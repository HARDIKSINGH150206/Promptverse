// A voice-agent call. Code owns the flow and every safety gate; the LLM only extracts fields,
// classifies yes/no and phrases questions.
//
// Restaurant: collect -> confirm_details (spoken "yes" = diet confirmed) -> safety_checklist
//             (spoken "yes" = checklist confirmed) -> offer created -> narrate matching -> done
// Recipient:  collect -> confirm_details (spoken "yes") -> demand created -> narrate -> done
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

const YES_MIN = 0.85;
const ANSWER_WORDS = /\b(yes|yeah|yep|no|nope|haan|ha|nahi|nahin|correct|right|sahi|theek)\b|हाँ|हां|नहीं|ना/i;
const IDLE_MS = 3 * 60_000;

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

// ---- spoken templates for safety-critical steps (code, not the model, says these) ----
const T = {
  en: {
    greetR: (n?: string) => n ? `Hi ${n}, this is AnnaRelay. What food do you have left today?` : "Hi, this is AnnaRelay. Which kitchen are you calling from, and what food do you have left today?",
    greetD: (n?: string) => n ? `Hi ${n}, this is AnnaRelay. How many people do you need food for today?` : "Hi, this is AnnaRelay. Which shelter are you calling from, and how many people do you need food for?",
    summaryR: (s: string, diet: string) => `Let me read that back: ${s}. Is that correct, and is everything ${diet}? Please say yes or no.`,
    summaryD: (s: string) => `Let me read that back: ${s}. Shall I post this request? Please say yes or no.`,
    checklist: (warn: string) => `${warn}Last step, a quick safety check. Was the food kept covered, kept hot or refrigerated, and never served on anyone's plate? Please say yes or no.`,
    warnSafety: "Your description mentioned something that could affect safety. ",
    warnDiet: "The automatic diet check wasn't sure, so please double-check. ",
    whatChange: "No problem. What should I change?",
    repeatYesNo: "Sorry, I need a clear yes or no.",
    unsafeEnd: "Thanks for being careful. We can't send that food to people, so I won't list it. Goodbye!",
    live: "Thank you! Your food is listed, and I'm finding the most reliable shelter now.",
    liveD: "Done, your request is live. I'll look for food near you now.",
    bye: "That's all. We'll keep you posted on Telegram. Thank you for helping. Goodbye!",
    byeD: "That's all for now. Offers will reach you on Telegram or your inbox. Goodbye!",
    error: (m: string) => `Sorry, I couldn't save that: ${m}.`,
  },
  hi: {
    greetR: (n?: string) => n ? `नमस्ते ${n}, मैं AnnaRelay से बोल रही हूँ। आज कौन सा खाना बचा है?` : "नमस्ते, मैं AnnaRelay से बोल रही हूँ। आप किस किचन से बोल रहे हैं, और आज कौन सा खाना बचा है?",
    greetD: (n?: string) => n ? `नमस्ते ${n}, मैं AnnaRelay से बोल रही हूँ। आज कितने लोगों के लिए खाना चाहिए?` : "नमस्ते, मैं AnnaRelay से बोल रही हूँ। आप किस संस्था से हैं, और कितने लोगों के लिए खाना चाहिए?",
    summaryR: (s: string, diet: string) => `मैं दोहरा देती हूँ: ${s}. क्या यह सही है, और क्या सब कुछ ${diet === "vegetarian" ? "शाकाहारी" : "नॉन-वेज"} है? हाँ या ना बोलिए।`,
    summaryD: (s: string) => `मैं दोहरा देती हूँ: ${s}. क्या मैं यह अनुरोध डाल दूँ? हाँ या ना बोलिए।`,
    checklist: (warn: string) => `${warn}आख़िरी सवाल, सुरक्षा के लिए: क्या खाना ढका हुआ था, गरम या फ्रिज में रखा था, और किसी की प्लेट में परोसा नहीं गया था? हाँ या ना बोलिए।`,
    warnSafety: "आपकी बात में कुछ ऐसा था जो सुरक्षा पर असर डाल सकता है। ",
    warnDiet: "डाइट की जाँच पक्की नहीं है, कृपया ध्यान से बताइए। ",
    whatChange: "कोई बात नहीं। क्या बदलना है?",
    repeatYesNo: "माफ़ कीजिए, साफ़ हाँ या ना बोलिए।",
    unsafeEnd: "सावधानी के लिए धन्यवाद। यह खाना लोगों को नहीं भेज सकते, इसलिए लिस्ट नहीं करूँगी। नमस्ते!",
    live: "धन्यवाद! आपका खाना लिस्ट हो गया है, अब मैं सबसे भरोसेमंद संस्था ढूँढ रही हूँ।",
    liveD: "हो गया, आपका अनुरोध लाइव है। अब मैं पास में खाना ढूँढती हूँ।",
    bye: "बस इतना ही। हम Telegram पर बताते रहेंगे। धन्यवाद, नमस्ते!",
    byeD: "अभी के लिए बस। ऑफ़र Telegram या इनबॉक्स पर आएँगे। नमस्ते!",
    error: (m: string) => `माफ़ कीजिए, सेव नहीं हो पाया: ${m}.`,
  },
};

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

function similar(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().match(/\p{L}+/gu) ?? []);
  const wb = b.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (!wb.length) return 0;
  return wb.filter((w) => wa.has(w)).length / wb.length;
}

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
  private lastAgent: string | null = null;
  private speakingUntil = 0;
  private busy = false;
  private queued: string[] = [];
  private stt: SarvamRealtime | null = null;
  private idle: NodeJS.Timeout | null = null;
  private unsub: (() => void) | null = null;
  private seq = 0;
  private closed = false;

  constructor(private ws: WebSocket, private role: Role, opts: { restaurant_id?: string; recipient_id?: string; language_code?: string }) {
    const lang = opts.language_code && opts.language_code !== "auto" && opts.language_code !== "unknown" ? opts.language_code : null;
    this.language = lang;
    if (role === "restaurant" && opts.restaurant_id && getRestaurant(opts.restaurant_id)) this.draft.restaurant_id = opts.restaurant_id;
    if (role === "recipient" && opts.recipient_id && getRecipient(opts.recipient_id)) this.draft.recipient_id = opts.recipient_id;
  }

  // ---------------- lifecycle ----------------

  start(): void {
    this.send({ type: "ready", call_id: this.id, role: this.role, stt: !!config.SARVAM_API_KEY, tts: !!config.SARVAM_API_KEY });
    bus.emitBus("call.started", { call_id: this.id, role: this.role, language: this.language });
    this.stt = new SarvamRealtime(this.language ?? "auto");
    this.stt.on("partial", (text: string) => this.send({ type: "caption", speaker: "user", text, final: false }));
    this.stt.on("final", (text: string, lang: string | null) => this.onCallerFinal(text, lang));
    this.stt.on("error", (m: string) => this.send({ type: "notice", code: "STT_UNAVAILABLE", message: `${m}. You can still type.` }));
    this.stt.start();
    this.publishDraft();
    const name = this.role === "restaurant" ? getRestaurant(this.draft.restaurant_id ?? "")?.name : getRecipient(this.draft.recipient_id ?? "")?.name;
    void this.say(this.role === "restaurant" ? this.t().greetR(name) : this.t().greetD(name));
    this.touch();

    this.ws.on("message", (data: RawData, isBinary: boolean) => this.onClientMessage(data, isBinary));
    this.ws.on("close", () => this.end("caller_hung_up"));
  }

  private end(outcome: string, ids: { offer_id?: string; demand_id?: string } = {}): void {
    if (this.closed) return;
    this.closed = true;
    if (this.phase !== "done") this.phase = "ended";
    this.stt?.close();
    this.unsub?.();
    if (this.idle) clearTimeout(this.idle);
    bus.emitBus("call.ended", { call_id: this.id, outcome, offer_id: ids.offer_id ?? null, demand_id: ids.demand_id ?? null });
    this.send({ type: "ended", outcome, ...ids });
    setTimeout(() => {
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close(1000);
    }, 500);
  }

  private touch(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.end("idle_timeout"), IDLE_MS);
  }

  // ---------------- IO ----------------

  private send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private t() {
    return this.language?.startsWith("hi") ? T.hi : T.en;
  }

  private onClientMessage(data: RawData, isBinary: boolean): void {
    if (isBinary) {
      this.stt?.sendPcm(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      return;
    }
    let msg: { event?: string; text?: string };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.event === "text" && msg.text?.trim()) this.onCallerFinal(msg.text.trim(), null);
    else if (msg.event === "playback_done") this.speakingUntil = 0;
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
    let total = 0;
    for (let i = 0; i < parts.length; i++) {
      const audio = await jobs[i];
      if (this.closed) return;
      if (audio) {
        total += Math.max(0, (Buffer.byteLength(audio, "base64") - 44) / (config.SARVAM_TTS_SAMPLE_RATE * 2));
        this.send({ type: "audio", turn, index: i, format: "wav", sample_rate: config.SARVAM_TTS_SAMPLE_RATE, text: parts[i], data: audio });
      } else {
        this.send({ type: "audio_unavailable", turn, index: i, text: parts[i] }); // client may use speechSynthesis
      }
    }
    this.send({ type: "audio_end", turn });
    this.speakingUntil = Date.now() + total * 1000 + 300;
  }

  private onCallerFinal(text: string, lang: string | null): void {
    if (this.closed) return;
    // echo guard: the mic picking up our own voice
    // Only drop near-verbatim copies with no answer in them: callers often reuse the question's words ("yes, kept covered and hot").
    if (this.lastAgent && Date.now() < this.speakingUntil && similar(this.lastAgent, text) > 0.9 && !ANSWER_WORDS.test(text)) return;
    if (Date.now() < this.speakingUntil) {
      this.send({ type: "interrupt" }); // barge-in: client stops playback
      this.speakingUntil = 0;
    }
    if (lang && lang !== "unknown") this.language = lang;
    this.send({ type: "caption", speaker: "user", text, final: true });
    bus.emitBus("call.caption", { call_id: this.id, speaker: "user", text, final: true });
    this.touch();
    this.queued.push(text);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queued.length && !this.closed) {
        const text = this.queued.splice(0).join(" ");
        try {
          await this.turn(text);
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

  private async turn(text: string): Promise<void> {
    this.history.push({ speaker: "caller", text });
    this.callerTurns.push(text);
    this.send({ type: "thinking" });

    let b: BrainResult;
    try {
      b = await think({
        role: this.role, phase: this.phase, draft: this.viewDraft(), missing: this.missing(),
        last_agent_utterance: this.lastAgent, pending_yes_no: this.pendingYesNo, user_text: text,
        history: this.history, directory: this.directory(), nowMs: nowMs(),
      });
    } catch (err) {
      console.warn("[agent] brain failed:", (err as Error).message);
      await this.say(this.language?.startsWith("hi") ? "माफ़ कीजिए, फिर से बोलिए?" : "Sorry, could you say that again?");
      return;
    }
    if (b.language && b.language !== "unknown" && !this.language) this.language = b.language;
    if (b.wants_to_end) {
      await this.say(this.role === "restaurant" ? this.t().bye : this.t().byeD);
      this.end("caller_ended");
      return;
    }

    const changed = this.apply(b, text);
    if (changed) this.publishDraft();

    switch (this.phase) {
      case "collect":
        return this.afterCollect(b);
      case "confirm_details":
        return this.afterConfirmDetails(b, changed);
      case "safety_checklist":
        return this.afterChecklist(b, changed);
      default:
        return;
    }
  }

  /** Validate and merge the model's updates. Returns true if anything changed. */
  private apply(b: BrainResult, text: string): boolean {
    const u = b.updates ?? {};
    const d = this.draft;
    const before = JSON.stringify(d);
    const tomorrow = SAYS_TOMORROW.test(this.callerTurns.join(" "));
    if (this.role === "restaurant") {
      if (u.restaurant_id && getRestaurant(u.restaurant_id)) d.restaurant_id = u.restaurant_id;
      if (u.items?.length) {
        d.items = u.items
          .filter((i) => i.name?.trim())
          .map((i) => ({ name: i.name.trim(), quantity: Math.max(0, Math.round(i.quantity ?? u.meal_count ?? d.meal_count ?? 0)), unit: i.unit?.trim() || "plates" }));
      }
      if (u.meal_count && u.meal_count > 0) d.meal_count = Math.round(u.meal_count);
      if (!d.meal_count && d.items?.length === 1 && d.items[0].quantity > 0) d.meal_count = d.items[0].quantity;
      if (u.diet === "veg" || u.diet === "nonveg") d.diet = u.diet;
      const cooked = spokenPast(u.cooked_at);
      if (cooked) d.cooked_at = cooked;
      const safe = spokenFuture(u.safe_until, tomorrow);
      if (safe) d.safe_until = safe;
      if (u.pickup_notes?.trim()) d.pickup_notes = u.pickup_notes.trim();
    } else {
      if (u.recipient_id && getRecipient(u.recipient_id)) d.recipient_id = u.recipient_id;
      if (u.people_count && u.people_count > 0) d.people_count = Math.round(u.people_count);
      if (u.diet) d.diet = u.diet;
      const by = spokenFuture(u.needed_by, tomorrow);
      if (by) d.needed_by = by;
      if (u.max_distance_km && u.max_distance_km > 0 && u.max_distance_km <= 50) d.max_distance_km = u.max_distance_km;
      if (u.notes?.trim()) d.notes = u.notes.trim();
    }
    void text;
    const changed = JSON.stringify(d) !== before;
    // any change to the details invalidates earlier confirmations
    if (changed && (this.dietConfirmed || this.phase !== "collect")) {
      this.dietConfirmed = false;
      this.safetyConfirmed = false;
    }
    return changed;
  }

  private async afterCollect(b: BrainResult): Promise<void> {
    if (this.missing().length) {
      await this.say(b.say || "Could you tell me a bit more?");
      return;
    }
    await this.readBack();
  }

  private summary(): string {
    const d = this.draft;
    const hi = this.language?.startsWith("hi");
    const notes = d.pickup_notes?.replace(/[.\s]+$/, "");
    if (this.role === "restaurant") {
      const items = d.items?.map((i) => i.name).join(", ") || (hi ? "खाना" : "food");
      const name = getRestaurant(d.restaurant_id!)?.name;
      if (hi) {
        const parts = [`${name} से ${d.meal_count} प्लेट ${items}`];
        if (d.cooked_at) parts.push(`${fmtTime(d.cooked_at)} पर बना`);
        parts.push(`${fmtTime(d.safe_until!)} तक सुरक्षित`);
        if (notes) parts.push(`पिकअप: ${notes}`);
        return parts.join(", ");
      }
      const parts = [`${d.meal_count} plates of ${items}`, `from ${name}`];
      if (d.cooked_at) parts.push(`cooked at ${fmtTime(d.cooked_at)}`);
      parts.push(`safe until ${fmtTime(d.safe_until!)}`);
      if (notes) parts.push(/^pick/i.test(notes) ? notes.replace(/^\w/, (c) => c.toLowerCase()) : `pickup at ${notes}`);
      return parts.join(", ");
    }
    const name = getRecipient(d.recipient_id!)?.name;
    if (hi) {
      const dietHi = d.diet === "veg" ? "शाकाहारी खाना" : d.diet === "nonveg" ? "नॉन-वेज खाना" : "कोई भी खाना";
      return `${name} के ${d.people_count} लोगों के लिए ${dietHi}, ${fmtTime(d.needed_by!)} तक${d.max_distance_km ? `, ${d.max_distance_km} किलोमीटर के अंदर` : ""}`;
    }
    const dietWord = d.diet === "veg" ? "vegetarian food" : d.diet === "nonveg" ? "non-veg food" : "any food";
    return `${dietWord} for ${d.people_count} people at ${name}, needed by ${fmtTime(d.needed_by!)}${d.max_distance_km ? `, within ${d.max_distance_km} km` : ""}`;
  }

  private async readBack(): Promise<void> {
    this.phase = "confirm_details";
    let lead = "";
    if (this.role === "restaurant") {
      const transcript = this.callerTurns.join(" ");
      this.guardrail = await intakeGuardrail(transcript, this.draft.items ?? [], this.draft.diet as "veg" | "nonveg");
      const g = this.guardrail;
      if (g.diet_check && !g.diet_check.agrees_with_extraction) {
        // the check disagrees with what we heard: ask, don't silently switch
        lead = this.t().warnDiet;
      } else if (g.needs_confirmation && (g.diet_check?.probability ?? 1) < 0.95) lead = this.t().warnDiet;
      this.publishDraft();
      const diet = this.draft.diet === "veg" ? "vegetarian" : "non-vegetarian";
      const q = this.t().summaryR(this.summary(), diet);
      this.pendingYesNo = q;
      await this.say(lead + q);
    } else {
      this.publishDraft();
      const q = this.t().summaryD(this.summary());
      this.pendingYesNo = q;
      await this.say(q);
    }
  }

  private async afterConfirmDetails(b: BrainResult, changed: boolean): Promise<void> {
    if (changed) {
      if (this.missing().length) {
        this.phase = "collect";
        this.pendingYesNo = null;
        await this.say(b.say || this.t().whatChange);
      } else await this.readBack();
      return;
    }
    if (b.answer === "yes" && (b.answer_probability ?? 0) >= YES_MIN) {
      if (this.role === "restaurant") {
        this.dietConfirmed = true;
        this.phase = "safety_checklist";
        const g = this.guardrail;
        const transcript = this.callerTurns.join(" ");
        const warn = (g?.safety_concern_probability ?? 0) > 0.3 || SAFETY_RE.test(transcript) ? this.t().warnSafety : "";
        const q = this.t().checklist(warn);
        this.pendingYesNo = q;
        this.publishDraft();
        await this.say(q);
      } else {
        await this.submitDemand();
      }
      return;
    }
    if (b.answer === "no" && (b.answer_probability ?? 0) >= 0.6) {
      this.phase = "collect";
      this.pendingYesNo = null;
      this.publishDraft();
      await this.say(this.t().whatChange);
      return;
    }
    await this.say(`${this.t().repeatYesNo} ${this.pendingYesNo ?? ""}`);
  }

  private async afterChecklist(b: BrainResult, changed: boolean): Promise<void> {
    if (changed) {
      await this.readBack();
      return;
    }
    if (b.answer === "yes" && (b.answer_probability ?? 0) >= YES_MIN) {
      this.safetyConfirmed = true;
      await this.submitOffer();
      return;
    }
    if (b.answer === "no" && (b.answer_probability ?? 0) >= 0.6) {
      this.publishDraft();
      await this.say(this.t().unsafeEnd);
      this.end("not_safe_to_list");
      return;
    }
    await this.say(`${this.t().repeatYesNo} ${this.pendingYesNo ?? ""}`);
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
    this.phase = "narrating";
    this.publishDraft();
    this.send({ type: "offer_created", offer: offerDetail(offerId) });
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
    this.phase = "done";
    this.publishDraft();
    await this.say(this.t().bye);
    const o = getOfferRow(offerId);
    setTimeout(() => this.end("offer_created", { offer_id: o?.id }), 4000);
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
      this.phase = "narrating";
      this.publishDraft();
      this.send({ type: "demand_created", demand: toDemand(row) });
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
      setTimeout(() => this.end("demand_created", { demand_id: row.id }), 4000);
    } catch (err) {
      const m = err instanceof AppError ? err.message : "something went wrong";
      this.phase = "collect";
      this.publishDraft();
      await this.say(`${this.t().error(m)} ${this.t().whatChange}`);
    }
  }
}
