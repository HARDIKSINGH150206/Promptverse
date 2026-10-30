// A voice-agent call. Code owns the flow and every safety gate; the LLM only extracts fields,
// classifies yes/no and phrases questions.
//
// Restaurant: collect -> confirm_details (spoken "yes" = diet confirmed) -> safety_checklist
//             (spoken "yes" = checklist confirmed) -> offer created -> narrate matching -> done
// Recipient:  collect -> confirm_details (spoken "yes") -> demand created -> narrate -> done
// With MATCHING=off the offer / request is saved and the call ends there: nobody is contacted.
import crypto from "node:crypto";
import { WebSocket, type RawData } from "ws";
import { config } from "../config";
import { intakeGuardrail } from "../ai/guardrail";
import { SAFETY_RE } from "../ai/mock";
import { fixFuture, fixPast, SAYS_TOMORROW } from "../ai/parse";
import { parseSpokenTime, resolveFuture, resolvePast } from "../ai/time";
import { SarvamRealtime } from "../ai/sarvamRealtime";
import { sentences, synthesize, ttsLanguage } from "../ai/tts";
import { getRecipient, getRestaurant, listAssignmentsForRecipient, listRecipientRows, listRestaurants, getOfferRow } from "../db/repo";
import { nowMs } from "../domain/clock";
import { fmtTime, pct } from "../domain/format";
import { createDemand, createOffer } from "../domain/intake";
import { AppError, type IntakeGuardrail, type OfferItem } from "../domain/types";
import { offerDetail } from "../domain/timeline";
import { toDemand } from "../db/repo";
import { bus } from "../realtime/bus";
import { think, type BrainResult, type Role } from "./brain";
import { normLang, scriptLanguage } from "./language";
import { lines } from "./templates";

const YES_MIN = 0.85;
const NO_MIN = 0.6;
const IDLE_MS = 3 * 60_000;
const MAX_UNCLEAR = 3; // unclear answers to one yes/no question before the call gives up (nothing listed)
const STT_RETRIES = 3;
const ECHO_SLACK_MS = 300; // playback runs a little behind our estimate

/** Whole-word matcher that also works for Indic scripts (JS \b only knows ASCII). */
function wordRe(list: string[]): RegExp {
  const alt = [...list].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${alt})(?![\\p{L}\\p{M}\\p{N}])`, "iu");
}

// A spoken "yes" only counts when the model hears yes AND the words themselves say yes, with no
// negation or "but" anywhere in the reply. Anything else is asked again.
const AFFIRM = wordRe([
  "yes", "yeah", "yep", "yup", "yah", "sure", "correct", "right", "ok", "okay", "absolutely", "definitely",
  "haan", "haa", "han", "ha", "ji", "haanji", "bilkul", "sahi", "theek", "thik", "houdu", "haudu", "aama", "aam", "avunu", "athe", "hoy",
  "हाँ", "हां", "हा", "जी", "बिल्कुल", "सही", "ठीक", "हो", "होय", "ಹೌದು", "ஆமா", "ஆம்", "అవును", "হ্যাঁ", "হাঁ", "അതെ", "હા",
]);
const NEGATE = wordRe([
  "no", "nope", "nah", "not", "don't", "dont", "didn't", "didnt", "wasn't", "wasnt", "isn't", "isnt", "weren't", "wrong",
  "but", "except", "lekin", "magar", "nahi", "nahin", "nai", "illa", "illai", "ledu", "kaadu", "nako",
  "नहीं", "नही", "मत", "गलत", "ग़लत", "लेकिन", "मगर", "ಇಲ್ಲ", "இல்லை", "లేదు", "కాదు", "না", "नाही", "ഇല്ല", "ના",
]);
const NOT_A_NO = /\bno (problem|issues?|worries)\b|\bkoi baat nahi?n?\b|कोई बात नहीं/giu;
// the model's wants_to_end is only trusted when the caller actually said something like this
export const END_CUE = wordRe([
  "bye", "goodbye", "good bye", "end the call", "end call", "hang up", "cut the call", "cancel", "stop the call",
  "band karo", "rakhta hoon", "rakhti hoon", "alvida", "बाय", "अलविदा", "फ़ोन रखता", "फ़ोन रखती", "फोन रखता", "फोन रखती", "बंद करो",
]);

export function saysYes(text: string): boolean {
  const t = text.toLowerCase().replace(/[’‘]/g, "'").replace(NOT_A_NO, " ");
  return AFFIRM.test(t) && !NEGATE.test(t);
}

/** Letters plus combining marks, so Devanagari vowel signs don't split a word. */
const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

/** Caller words that were not in what the agent just said. */
export function residual(agent: string, caller: string): string[] {
  const a = new Set(tokens(agent));
  return tokens(caller).filter((w) => !a.has(w));
}

type Phase = "collect" | "confirm_details" | "safety_checklist" | "submitting" | "narrating" | "done" | "ended";

interface Draft {
  restaurant_id?: string;
  recipient_id?: string;
  items?: OfferItem[];
  meal_count?: number;
  people_count?: number;
  diet?: "veg" | "nonveg" | "any";
  cooked_at?: string;
  safe_until?: string;
  needed_by?: string;
  max_distance_km?: number;
  pickup_notes?: string;
  notes?: string;
}
// The model reports times as spoken local clock times ("19:00", "2:00"); code picks the day and
// resolves am/pm: cooked = most recent occurrence, safe-until / needed-by = next occurrence.
const ISO_RE = /\d{4}-\d{2}-\d{2}T/;
function spokenPast(v: string | null | undefined): string | null {
  if (!v) return null;
  if (ISO_RE.test(v)) return fixPast(v); // tolerate ISO from older prompts
  const t = parseSpokenTime(v);
  return t ? resolvePast(t, nowMs()) : null;
}
function spokenFuture(v: string | null | undefined, tomorrow: boolean): string | null {
  if (!v) return null;
  if (ISO_RE.test(v)) return fixFuture(v, nowMs(), tomorrow);
  const t = parseSpokenTime(v);
  if (!t) return null;
  return resolveFuture(t, tomorrow ? nowMs() + 12 * 3600_000 : nowMs());
}

interface Heard { text: string; start: number }

export class CallSession {
  readonly id = `call_${crypto.randomBytes(4).toString("hex")}`;
  private phase: Phase = "collect";
  private draft: Draft = {};
  private guardrail: IntakeGuardrail | null = null;
  private dietConfirmed = false;
  private safetyConfirmed = false;
  private language: string | null;
  private history: { speaker: "agent" | "caller"; text: string }[] = [];
  private callerTurns: string[] = [];
  private pendingYesNo: string | null = null;
  private askedAt = 0; // when the pending yes/no question started playing
  private unclear = 0;
  private problem: "window" | "cooked" | null = null;
  private problemInfo: { cooked: string | null; latest: string | null } = { cooked: null, latest: null };
  private lastAgent: string | null = null;
  private audioUntil = 0; // when our current speech should finish playing on the caller's side
  private speechStartedAt = 0; // Sarvam VAD: the caller started talking
  private lastFinalAt = 0;
  private busy = false;
  private queued: Heard[] = [];
  private stt: SarvamRealtime | null = null;
  private sttRetries = 0;
  private idle: NodeJS.Timeout | null = null;
  private limit: NodeJS.Timeout | null = null;
  private unsub: (() => void) | null = null;
  private seq = 0;
  private closed = false;

  constructor(private ws: WebSocket, private role: Role, opts: { restaurant_id?: string; recipient_id?: string; language_code?: string }) {
    this.language = normLang(opts.language_code); // "auto" / "unknown" -> null: decided from the caller's speech
    if (role === "restaurant" && opts.restaurant_id && getRestaurant(opts.restaurant_id)) this.draft.restaurant_id = opts.restaurant_id;
    if (role === "recipient" && opts.recipient_id && getRecipient(opts.recipient_id)) this.draft.recipient_id = opts.recipient_id;
  }

  // ---------------- lifecycle ----------------

  start(): void {
    this.send({ type: "ready", call_id: this.id, role: this.role, stt: !!config.SARVAM_API_KEY, tts: !!config.SARVAM_API_KEY });
    bus.emitBus("call.started", { call_id: this.id, role: this.role, language: this.language });
    this.openStt();
    this.publishDraft();
    const name = this.role === "restaurant" ? getRestaurant(this.draft.restaurant_id ?? "")?.name : getRecipient(this.draft.recipient_id ?? "")?.name;
    void this.say(this.role === "restaurant" ? this.t().greetR(name) : this.t().greetD(name));
    this.touch();
    this.limit = setTimeout(() => void this.timeUp(), config.AGENT_MAX_CALL_SECS * 1000);

    this.ws.on("message", (data: RawData, isBinary: boolean) => this.onClientMessage(data, isBinary));
    this.ws.on("close", () => this.end("caller_hung_up"));
  }

  /** Live speech-to-text; reconnects a few times if Sarvam drops mid-call. */
  private openStt(): void {
    const stt = new SarvamRealtime(this.language ?? "auto");
    this.stt = stt;
    stt.on("ready", () => {
      this.sttRetries = 0;
    });
    stt.on("speech_start", () => {
      this.speechStartedAt = Date.now();
    });
    stt.on("partial", (text: string) => this.send({ type: "caption", speaker: "user", text, final: false }));
    stt.on("final", (text: string, lang: string | null) => this.onCallerFinal(text, lang, false));
    stt.on("error", (m: string) => {
      console.warn("[agent] stt:", m);
      if (!config.SARVAM_API_KEY) this.send({ type: "notice", code: "STT_UNAVAILABLE", message: `${m}. You can still type.` });
      else stt.close(); // the close handler reconnects
    });
    stt.on("closed", () => {
      if (this.closed || this.stt !== stt) return;
      if (this.sttRetries < STT_RETRIES) {
        this.sttRetries += 1;
        setTimeout(() => {
          if (!this.closed && this.stt === stt) this.openStt();
        }, 500 * this.sttRetries);
      } else {
        this.send({ type: "notice", code: "STT_UNAVAILABLE", message: "Speech recognition dropped. You can still type." });
      }
    });
    stt.start();
  }

  private end(outcome: string, ids: { offer_id?: string; demand_id?: string } = {}): void {
    if (this.closed) return;
    this.closed = true;
    if (this.phase !== "done") this.phase = "ended";
    const stt = this.stt;
    this.stt = null;
    stt?.close();
    this.unsub?.();
    if (this.idle) clearTimeout(this.idle);
    if (this.limit) clearTimeout(this.limit);
    bus.emitBus("call.ended", { call_id: this.id, outcome, offer_id: ids.offer_id ?? null, demand_id: ids.demand_id ?? null });
    this.send({ type: "ended", outcome, ...ids });
    setTimeout(() => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close(1000);
    }, 500);
  }

  /** End once the goodbye has finished playing, so the caller hears all of it. */
  private endAfterSpeech(outcome: string, ids: { offer_id?: string; demand_id?: string } = {}): void {
    setTimeout(() => this.end(outcome, ids), Math.max(1500, this.audioUntil - Date.now() + 800));
  }

  private touch(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.end("idle_timeout"), IDLE_MS);
  }

  private async timeUp(): Promise<void> {
    if (this.closed || ["submitting", "narrating", "done"].includes(this.phase)) return;
    await this.say(this.t().timeLimit);
    this.endAfterSpeech("time_limit");
  }

  // ---------------- IO ----------------

  private send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private t() {
    return lines(this.language);
  }

  /**
   * Follow the caller's language turn by turn. The script they spoke in wins (Kannada script is
   * Kannada, whatever any code says); for Latin text the model's guess counts, but a short "ok" or
   * "yes" never switches a Hindi call to English.
   */
  private followLanguage(text: string, modelGuess: string | null | undefined): void {
    const heard = scriptLanguage(text, modelGuess) ?? (text.trim().split(/\s+/).length >= 4 ? normLang(modelGuess) : null);
    if (heard) this.language = heard;
    else if (!this.language) this.language = normLang(modelGuess);
  }

  private onClientMessage(data: RawData, isBinary: boolean): void {
    if (isBinary) {
      this.stt?.sendPcm(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      return;
    }
    let msg: { event?: string; text?: string; turn?: number };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.event === "text" && typeof msg.text === "string" && msg.text.trim()) this.onCallerFinal(msg.text.trim().slice(0, 500), null, true);
    // the client says our latest reply has finished playing (older clients send no turn)
    else if (msg.event === "playback_done" && (msg.turn === undefined || msg.turn === this.seq)) this.audioUntil = Date.now();
    else if (msg.event === "end") this.end("caller_hung_up");
  }

  /** Speak: text first (instant captions), then audio sentence by sentence, in order. */
  private async say(text: string): Promise<void> {
    if (!text.trim() || this.closed) return;
    const turn = ++this.seq;
    this.lastAgent = text;
    this.history.push({ speaker: "agent", text });
    this.send({ type: "agent", text, phase: this.phase, turn });
    bus.emitBus("call.caption", { call_id: this.id, speaker: "agent", text, final: true });
    const parts = sentences(text);
    const lang = ttsLanguage(this.language);
    const jobs = parts.map((p) => synthesize(p, lang)); // in parallel, sent in order
    for (let i = 0; i < parts.length; i++) {
      const audio = await jobs[i];
      if (this.closed) return;
      // extend the "agent is talking" window clip by clip, so echo of the first sentence is guarded too
      const from = Math.max(Date.now(), this.audioUntil);
      if (audio) {
        const secs = Math.max(0, (Buffer.byteLength(audio, "base64") - 44) / (config.SARVAM_TTS_SAMPLE_RATE * 2));
        this.audioUntil = from + secs * 1000 + 250;
        this.send({ type: "audio", turn, index: i, format: "wav", sample_rate: config.SARVAM_TTS_SAMPLE_RATE, text: parts[i], data: audio });
      } else {
        this.audioUntil = from + (parts[i].length / 14) * 1000; // the client may read it with speechSynthesis
        this.send({ type: "audio_unavailable", turn, index: i, text: parts[i] });
      }
    }
    this.send({ type: "audio_end", turn });
  }

  /** Recent agent speech, to recognise our own voice coming back through the mic. */
  private recentAgent(): string {
    return this.history.filter((h) => h.speaker === "agent").slice(-2).map((h) => h.text).join(" ");
  }

  private onCallerFinal(text: string, lang: string | null, typed: boolean): void {
    if (this.closed) return;
    const now = Date.now();
    // when did this utterance start? Sarvam's VAD says; otherwise estimate it from its length
    const start = typed ? now
      : this.speechStartedAt > this.lastFinalAt ? this.speechStartedAt
        : now - config.SARVAM_SILENCE_MS - 350 * tokens(text).length;
    if (!typed) this.lastFinalAt = now;
    if (!typed && start < this.audioUntil + ECHO_SLACK_MS) {
      // It started while we were talking. If it adds (almost) nothing to what we said, it's our own
      // voice through the mic ("...please say yes or no" must never count as a yes). A short answer
      // spoken over the question is dropped too; the caller answers again once the question ends.
      if (residual(this.recentAgent(), text).length <= 1) return;
      this.send({ type: "interrupt" }); // a real barge-in: the client stops playback
      this.audioUntil = now;
    }
    // Sarvam's language tag is often en-IN for code-mixed speech, so it only fills a gap; the turn
    // itself (script + model) decides the language in turn()
    if (!this.language) this.language = normLang(lang);
    this.send({ type: "caption", speaker: "user", text, final: true });
    bus.emitBus("call.caption", { call_id: this.id, speaker: "user", text, final: true });
    this.touch();
    this.queued.push({ text, start });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queued.length && !this.closed) {
        const batch = this.queued.splice(0);
        try {
          await this.turn(batch.map((h) => h.text).join(" "), Math.min(...batch.map((h) => h.start)));
        } catch (err) {
          console.error("[agent] turn failed:", err);
          this.send({ type: "notice", code: "AGENT_ERROR", message: (err as Error).message });
        }
      }
    } finally {
      this.busy = false;
    }
  }

  // ---------------- the flow ----------------

  private missing(): string[] {
    const d = this.draft;
    const m: string[] = [];
    if (this.role === "restaurant") {
      if (!d.restaurant_id) m.push("restaurant_id");
      if (!d.items?.length) m.push("items");
      if (!d.meal_count) m.push("meal_count");
      if (!d.diet) m.push("diet");
      if (!d.safe_until) m.push("safe_until");
      if (!d.cooked_at) m.push("cooked_at");
    } else {
      if (!d.recipient_id) m.push("recipient_id");
      if (!d.people_count) m.push("people_count");
      if (!d.diet) m.push("diet");
      if (!d.needed_by) m.push("needed_by");
    }
    return m;
  }

  private publishDraft(): void {
    const payload = {
      call_id: this.id, role: this.role, phase: this.phase, draft: this.viewDraft(),
      missing: this.missing(), guardrail: this.guardrail,
    };
    this.send({ type: "draft", ...payload, confirmations: { diet_confirmed: this.dietConfirmed, safety_checklist_confirmed: this.safetyConfirmed } });
    bus.emitBus("call.draft", payload);
  }

  private viewDraft(): Record<string, unknown> {
    const d = this.draft;
    return {
      ...d,
      restaurant_name: d.restaurant_id ? getRestaurant(d.restaurant_id)?.name ?? null : null,
      recipient_name: d.recipient_id ? getRecipient(d.recipient_id)?.name ?? null : null,
    };
  }

  private directory() {
    return this.role === "restaurant"
      ? listRestaurants().map((r) => ({ id: r.id, name: r.name, area: r.area }))
      : listRecipientRows().map((r) => ({ id: r.id, name: r.name, area: r.area }));
  }

  /** `start` is when the caller began saying `text`; it decides whether this can answer the pending question. */
  private async turn(text: string, start: number): Promise<void> {
    this.history.push({ speaker: "caller", text });
    this.callerTurns.push(text);
    this.send({ type: "thinking" });

    let b: BrainResult;
    try {
      b = await think({
        role: this.role, phase: this.phase, draft: this.viewDraft(), missing: this.missing(),
        last_agent_utterance: this.lastAgent, pending_yes_no: this.pendingYesNo, user_text: text,
        history: this.history, directory: this.directory(), nowMs: nowMs(), language: this.language,
      });
    } catch (err) {
      console.warn("[agent] brain failed:", (err as Error).message);
      await this.say(this.t().sayAgain);
      return;
    }
    if (this.closed) return;
    this.followLanguage(text, b.language);
    if (b.wants_to_end && END_CUE.test(text)) {
      await this.say(config.MATCHING === "off" ? this.t().byeOff : this.role === "restaurant" ? this.t().bye : this.t().byeD);
      this.endAfterSpeech("caller_ended");
      return;
    }

    const changed = this.apply(b);
    if (changed) this.publishDraft();

    if (this.problem) {
      // a time we can't accept: code asks again, whatever phase we were in
      const p = this.problem;
      this.problem = null;
      this.phase = "collect";
      this.pendingYesNo = null;
      this.publishDraft();
      const { cooked, latest } = this.problemInfo;
      await this.say(p === "window" ? this.t().window(config.MAX_SAFE_HOURS, cooked, latest) : this.t().cookedOld(config.MAX_SAFE_HOURS));
      return;
    }

    // only something said after the question started can answer it (not a "yes" queued before it)
    const answerable = start >= this.askedAt;
    switch (this.phase) {
      case "collect":
        return this.afterCollect(b);
      case "confirm_details":
        return this.afterConfirmDetails(b, text, changed, answerable);
      case "safety_checklist":
        return this.afterChecklist(b, text, changed, answerable);
      default:
        return;
    }
  }

  /** Validate and merge the model's updates. Returns true if anything changed. */
  private apply(b: BrainResult): boolean {
    const u = b.updates ?? {};
    const d = this.draft;
    const before = JSON.stringify(d);
    const tomorrow = SAYS_TOMORROW.test(this.callerTurns.join(" "));
    const maxMs = config.MAX_SAFE_HOURS * 3600_000;
    if (this.role === "restaurant") {
      if (u.restaurant_id && getRestaurant(u.restaurant_id)) d.restaurant_id = u.restaurant_id;
      if (u.items?.length) {
        const items = u.items
          .filter((i) => i.name?.trim())
          .map((i) => ({ name: i.name.trim(), quantity: Math.max(0, Math.round(i.quantity ?? u.meal_count ?? d.meal_count ?? 0)), unit: i.unit?.trim() || "plates" }));
        if (items.length) d.items = items;
      }
      if (u.meal_count && u.meal_count > 0 && u.meal_count <= 5000) d.meal_count = Math.round(u.meal_count);
      if (!d.meal_count && d.items?.length === 1 && d.items[0].quantity > 0) d.meal_count = d.items[0].quantity;
      if (u.diet === "veg" || u.diet === "nonveg") d.diet = u.diet;
      const cooked = spokenPast(u.cooked_at);
      if (cooked) {
        if (nowMs() - Date.parse(cooked) > maxMs) this.problem = "cooked";
        else d.cooked_at = cooked;
      }
      const safe = spokenFuture(u.safe_until, tomorrow);
      if (safe) d.safe_until = safe;
      // cooked food doesn't stay safe for a day: a window this long is almost always a misheard time
      if (d.safe_until && Date.parse(d.safe_until) - (d.cooked_at ? Date.parse(d.cooked_at) : nowMs()) > maxMs) {
        delete d.safe_until;
        this.problem ??= "window";
        // tell the caller what we heard and the latest time we can accept, so they don't just repeat it
        const from = d.cooked_at ? Date.parse(d.cooked_at) : nowMs();
        this.problemInfo = {
          cooked: d.cooked_at ? fmtTime(d.cooked_at) : null,
          latest: from + maxMs > nowMs() ? fmtTime(new Date(from + maxMs).toISOString()) : null,
        };
      }
      if (u.pickup_notes?.trim()) d.pickup_notes = u.pickup_notes.trim().slice(0, 300);
    } else {
      if (u.recipient_id && getRecipient(u.recipient_id)) d.recipient_id = u.recipient_id;
      if (u.people_count && u.people_count > 0 && u.people_count <= 5000) d.people_count = Math.round(u.people_count);
      if (u.diet) d.diet = u.diet;
      const by = spokenFuture(u.needed_by, tomorrow);
      if (by) d.needed_by = by;
      if (u.max_distance_km && u.max_distance_km > 0 && u.max_distance_km <= 50) d.max_distance_km = u.max_distance_km;
      if (u.notes?.trim()) d.notes = u.notes.trim().slice(0, 300);
    }
    const changed = JSON.stringify(d) !== before;
    // any change to the details invalidates earlier confirmations
    if (changed && (this.dietConfirmed || this.phase !== "collect")) {
      this.dietConfirmed = false;
      this.safetyConfirmed = false;
    }
    return changed;
  }

  /** Code's verdict on a yes/no answer: the model's call, gated by timing and the words themselves. */
  private verdict(b: BrainResult, text: string): "yes" | "no" | "unclear" {
    const p = b.answer_probability ?? 0;
    if (b.answer === "yes" && p >= YES_MIN && saysYes(text)) return "yes";
    if (b.answer === "no" && p >= NO_MIN) return "no";
    return "unclear";
  }

  /** Ask a yes/no question whose answer the code acts on. */
  private async ask(q: string, lead = ""): Promise<void> {
    this.pendingYesNo = q;
    this.unclear = 0;
    this.askedAt = Date.now();
    await this.say(lead + q);
  }

  private async reask(): Promise<void> {
    this.unclear += 1;
    if (this.unclear >= MAX_UNCLEAR) {
      this.pendingYesNo = null;
      await this.say(this.t().giveUp);
      this.endAfterSpeech("unconfirmed");
      return;
    }
    await this.say(`${this.t().repeatYesNo} ${this.pendingYesNo ?? ""}`);
  }

  private async afterCollect(b: BrainResult): Promise<void> {
    if (this.missing().length) {
      await this.say(b.say || "Could you tell me a bit more?");
      return;
    }
    await this.readBack();
  }

  private summary(): string {
    // built from the draft by code, in the call's language, so the read-back says exactly what is stored
    const d = this.draft;
    const w = this.t().w;
    const notes = d.pickup_notes?.replace(/[.\s]+$/, "");
    if (this.role === "restaurant") {
      const items = d.items?.map((i) => i.name).join(", ") || w.food;
      const parts = [`${d.meal_count} ${w.plates} ${items}`, w.from(getRestaurant(d.restaurant_id!)?.name ?? "")];
      if (d.cooked_at) parts.push(w.cooked(fmtTime(d.cooked_at)));
      parts.push(w.safe(fmtTime(d.safe_until!)));
      if (notes) parts.push(w.pickup(notes));
      return parts.join(", ");
    }
    const diet = d.diet === "veg" ? w.veg : d.diet === "nonveg" ? w.nonveg : w.any;
    return w.need(d.people_count!, getRecipient(d.recipient_id!)?.name ?? "", diet, fmtTime(d.needed_by!), d.max_distance_km);
  }

  private async readBack(): Promise<void> {
    this.phase = "confirm_details";
    if (this.role === "restaurant") {
      let lead = "";
      const transcript = this.callerTurns.join(" ");
      this.guardrail = await intakeGuardrail(transcript, this.draft.items ?? [], this.draft.diet as "veg" | "nonveg");
      if (this.closed) return;
      const g = this.guardrail;
      if (g.diet_check && !g.diet_check.agrees_with_extraction) {
        // the check disagrees with what we heard: ask, don't silently switch
        lead = this.t().warnDiet;
      } else if (g.needs_confirmation && (g.diet_check?.probability ?? 1) < 0.95) lead = this.t().warnDiet;
      this.publishDraft();
      await this.ask(this.t().summaryR(this.summary(), this.draft.diet === "veg"), lead);
    } else {
      this.publishDraft();
      await this.ask(this.t().summaryD(this.summary()));
    }
  }

  private async afterConfirmDetails(b: BrainResult, text: string, changed: boolean, answerable: boolean): Promise<void> {
    if (changed) {
      if (this.missing().length) {
        this.phase = "collect";
        this.pendingYesNo = null;
        await this.say(b.say || this.t().whatChange);
      } else await this.readBack();
      return;
    }
    if (!answerable) return; // said before the read-back began: wait for the real answer
    const v = this.verdict(b, text);
    if (v === "yes") {
      if (this.role === "restaurant") {
        this.dietConfirmed = true;
        this.phase = "safety_checklist";
        const g = this.guardrail;
        const transcript = this.callerTurns.join(" ");
        const warn = (g?.safety_concern_probability ?? 0) > 0.3 || SAFETY_RE.test(transcript) ? this.t().warnSafety : "";
        this.publishDraft();
        await this.ask(this.t().checklist(warn));
      } else {
        this.pendingYesNo = null;
        await this.submitDemand();
      }
      return;
    }
    if (v === "no") {
      this.phase = "collect";
      this.pendingYesNo = null;
      this.publishDraft();
      await this.say(this.t().whatChange);
      return;
    }
    await this.reask();
  }

  private async afterChecklist(b: BrainResult, text: string, changed: boolean, answerable: boolean): Promise<void> {
    if (changed) {
      await this.readBack();
      return;
    }
    if (!answerable) return;
    const v = this.verdict(b, text);
    if (v === "yes") {
      this.safetyConfirmed = true;
      this.pendingYesNo = null;
      await this.submitOffer();
      return;
    }
    if (v === "no") {
      this.pendingYesNo = null;
      this.publishDraft();
      await this.say(this.t().unsafeEnd);
      this.endAfterSpeech("not_safe_to_list");
      return;
    }
    await this.reask();
  }

  // ---------------- submit + narrate ----------------

  private async submitOffer(): Promise<void> {
    const d = this.draft;
    this.phase = "submitting";
    this.publishDraft();
    let offerId: string;
    try {
      const cooked = d.cooked_at ?? new Date(nowMs() - 30 * 60000).toISOString();
      offerId = createOffer(
        {
          restaurant_id: d.restaurant_id!, items: d.items ?? [], meal_count: d.meal_count!, diet: d.diet as "veg" | "nonveg",
          cooked_at: cooked, safe_until: d.safe_until!, photo_url: null,
          raw_transcript: this.callerTurns.join(" "), pickup_notes: d.pickup_notes ?? null,
          // set ONLY by the two spoken yes answers above
          confirmations: { diet_confirmed: this.dietConfirmed, safety_checklist_confirmed: this.safetyConfirmed },
        },
        this.guardrail,
        "voice"
      );
    } catch (err) {
      const m = err instanceof AppError ? err.message : "something went wrong";
      this.phase = "collect";
      this.dietConfirmed = this.safetyConfirmed = false;
      this.publishDraft();
      await this.say(`${this.t().error(m)} ${this.t().whatChange}`);
      return;
    }
    const matching = config.MATCHING === "on";
    this.phase = matching ? "narrating" : "done";
    this.publishDraft();
    this.send({ type: "offer_created", offer: offerDetail(offerId), matching });
    if (!matching) {
      await this.say(`${this.t().liveOff} ${this.t().byeOff}`);
      this.endAfterSpeech("offer_created", { offer_id: offerId });
      return;
    }
    await this.say(this.t().live);
    await this.narrateOffer(offerId);
  }

  private async narrateOffer(offerId: string): Promise<void> {
    // speak the matching decisions already made (from the assignments, not timeline text)
    const hi = this.language?.startsWith("hi");
    const detail = offerDetail(offerId);
    const lines = detail.assignments
      .filter((a) => !a.is_standby && a.status === "offered")
      .map((a) => {
        const p = Math.round(a.reliability_at_assignment * 100);
        const why = a.selection.explored ? (hi ? " (नई संस्था, भरोसा परखने के लिए)" : ", a newer shelter we're giving a chance") : "";
        return hi
          ? `${a.recipient_name} को ${a.meals} प्लेट भेज रही हूँ: ${p} प्रतिशत भरोसेमंद, ${a.distance_km} किलोमीटर दूर${why}।`
          : `Offering ${a.meals} meals to ${a.recipient_name}: ${p} percent reliable, ${a.distance_km} kilometres away${why}.`;
      });
    if (detail.fallback_route) {
      lines.push(hi ? "समय पर कोई नहीं पहुँच सकता, इसलिए खाना पशु-आहार पार्टनर को जाएगा (सिम्युलेटेड)।" : "Nobody can reach it in time, so it goes to our animal-feed partner, which is simulated for the demo.");
    } else if (!lines.length) {
      lines.push(hi ? "अभी किसी को इसकी ज़रूरत नहीं है; सुरक्षित रहने तक मैं ढूँढती रहूँगी।" : "No shelter needs this right now. I'll keep looking until it's no longer safe.");
    }
    await this.say(lines.join(" "));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(done, 3000);
      this.unsub = bus.onBus("timeline", (e) => {
        if (e.offer_id !== offerId) return;
        if (e.type === "accepted") void this.say(e.message.replace(/\.$/, "") + ".");
      });
      function done() {
        clearTimeout(timer);
        resolve();
      }
    });
    if (this.closed) return;
    this.phase = "done";
    this.publishDraft();
    await this.say(this.t().bye);
    const o = getOfferRow(offerId);
    this.endAfterSpeech("offer_created", { offer_id: o?.id });
  }

  private async submitDemand(): Promise<void> {
    const d = this.draft;
    this.phase = "submitting";
    this.publishDraft();
    try {
      const row = createDemand({
        recipient_id: d.recipient_id!, people_count: d.people_count!, diet: d.diet ?? "any",
        needed_by: d.needed_by!, max_distance_km: d.max_distance_km ?? 5, notes: d.notes ?? null,
        raw_transcript: this.callerTurns.join(" "),
      });
      const matching = config.MATCHING === "on";
      this.phase = matching ? "narrating" : "done";
      this.publishDraft();
      this.send({ type: "demand_created", demand: toDemand(row), matching });
      if (!matching) {
        await this.say(`${this.t().liveDOff} ${this.t().byeOff}`);
        this.endAfterSpeech("demand_created", { demand_id: row.id });
        return;
      }
      await this.say(this.t().liveD);
      const offered = listAssignmentsForRecipient(d.recipient_id!, ["offered"]).filter((a) => a.demand_id === row.id);
      if (offered.length) {
        const a = offered[0];
        const r = getRestaurant(getOfferRow(a.offer_id)?.restaurant_id ?? "");
        await this.say(`Good news: ${r?.name ?? "a kitchen"} has ${a.meals} meals for you right now. Accept it on Telegram or in your inbox. You were ${pct(a.reliability_at_assignment)} reliable, which put you first.`);
      }
      this.phase = "done";
      this.publishDraft();
      await this.say(this.t().byeD);
      this.endAfterSpeech("demand_created", { demand_id: row.id });
    } catch (err) {
      const m = err instanceof AppError ? err.message : "something went wrong";
      this.phase = "collect";
      this.publishDraft();
      await this.say(`${this.t().error(m)} ${this.t().whatChange}`);
    }
  }
}
