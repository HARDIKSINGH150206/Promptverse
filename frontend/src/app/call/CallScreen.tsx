"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Keyboard, Mic, MicOff, PhoneCall, PhoneOff, RotateCcw, Send, Store, Users } from "lucide-react";
import { api, isLive } from "@/lib/api/client";
import { fmtTime } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { useAgentCall, type CallRole } from "@/lib/voice/useAgentCall";
import { DraftCard } from "@/components/call/DraftCard";
import { LiveOfferPanel } from "@/components/call/LiveOfferPanel";
import { VoiceOrb, type OrbMode } from "@/components/call/VoiceOrb";
import { useHealth } from "@/components/providers";
import { cx } from "@/components/ui";

const SAY: Record<CallRole, string[]> = {
  restaurant: [
    "Hi, this is Koramangala Kitchen, we have about 40 plates of veg biryani.",
    "Made at 2, safe till 10 tonight, pick up from the back gate.",
    "नमस्ते, तीस प्लेट वेज पुलाव बचा है, रात दस बजे तक ठीक है।",
  ],
  recipient: [
    "Hello, this is New Dawn Shelter, we need food for 25 people tonight.",
    "Anything is fine, veg or non-veg, by 9 pm.",
  ],
};

const OUTCOME: Record<string, string> = {
  offer_created: "Offer listed and matched.",
  demand_created: "Request posted.",
  not_safe_to_list: "Not listed: the food didn't pass the spoken safety check. Thanks for being careful.",
  caller_ended: "Call ended.",
  caller_hung_up: "Call ended.",
  idle_timeout: "Call ended after a quiet spell.",
};

function RoleToggle({ role, onChange, disabled }: { role: CallRole; onChange: (r: CallRole) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-panel p-1" role="radiogroup" aria-label="Who is calling">
      {([["restaurant", "Restaurant", Store], ["recipient", "Shelter / NGO", Users]] as const).map(([v, label, Icon]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={role === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cx("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
            role === v ? "bg-white text-navy" : "text-white/65 hover:text-white")}
        >
          <Icon className="size-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

export function CallScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const role: CallRole = params.get("role") === "recipient" ? "recipient" : "restaurant";
  const presetId = params.get(role === "restaurant" ? "restaurant_id" : "recipient_id") ?? "";
  const [who, setWho] = useState(presetId);
  const { health } = useHealth();
  const liveBackend = isLive("parse") && isLive("offers");

  const directory = usePoll(async () => {
    if (role === "restaurant") return (await api.restaurants()).map((r) => ({ id: r.id, name: r.name, area: r.area }));
    return (await api.recipients()).map((r) => ({ id: r.id, name: r.name, area: r.area }));
  }, 60000, role);

  const opts = useMemo(
    () => (role === "restaurant" ? { restaurantId: who || undefined } : { recipientId: who || undefined }),
    [role, who],
  );
  const { state, start, hangUp, sendText, level } = useAgentCall(role, opts);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state.lines]);

  const inCall = state.status === "connecting" || state.status === "live";
  const mode: OrbMode =
    state.status === "connecting" ? "connecting"
      : !inCall ? (state.status === "ended" ? "ended" : "idle")
        : state.speaking ? "speaking" : state.thinking ? "thinking" : "listening";
  const statusLine =
    mode === "connecting" ? "Connecting…" : mode === "speaking" ? "AnnaRelay is speaking" : mode === "thinking" ? "Thinking…"
      : mode === "listening" ? (state.micOn ? "Listening, just talk" : "Type your answer below") : state.status === "ended" ? "Call ended" : "Ready when you are";

  function setRole(r: CallRole) {
    setWho("");
    router.replace(`/call?role=${r}`);
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    sendText(typed);
    setTyped("");
  }

  const lines = state.lines.slice(-6);
  const outcomeText = state.outcome ? OUTCOME[state.outcome] ?? "Call ended." : null;

  return (
    <main className="relative mx-auto max-w-[1240px] px-5 py-10 lg:px-8 lg:py-14">
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_30%_10%,color-mix(in_srgb,#0099ff_14%,transparent),transparent)]" aria-hidden />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-sky uppercase">
            <PhoneCall className="size-3.5" aria-hidden /> AI voice agent
          </p>
          <h1 className="display mt-3 text-5xl text-white sm:text-6xl">Call AnnaRelay</h1>
          <p className="mt-3 max-w-xl text-[17px] text-white/65">
            No forms. Just talk, in English, Hindi or both. The card fills itself in as you speak, and nothing is listed until you say yes.
          </p>
        </div>
        <RoleToggle role={role} onChange={setRole} disabled={inCall} />
      </div>

      {!liveBackend ? (
        <p className="mt-6 rounded-2xl border border-orange/50 bg-orange/[0.07] px-4 py-3 text-white">
          The voice agent needs the live backend. Set <code className="font-mono">NEXT_PUBLIC_API_MODE=live</code> and restart the dev server. The <Link className="font-semibold text-sky" href={role === "restaurant" ? "/restaurant" : "/recipient"}>form intake</Link> works in mock mode.
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {/* ---- left: the call ---- */}
        <section aria-label="Call" className="flex flex-col rounded-card border border-line bg-panel p-5 sm:p-7">
          <div className="flex flex-col items-center">
            <VoiceOrb mode={mode} level={level} className="max-w-[260px]" />
            <p className="mt-2 text-center text-base font-medium text-white" aria-live="polite">{statusLine}</p>
            {state.micError ? <p className="mt-1 text-center text-sm text-orange">{state.micError}</p> : null}
            {state.notice ? <p className="mt-1 text-center text-sm text-white/55">{state.notice}</p> : null}
          </div>

          {!inCall && state.status !== "ended" ? (
            <div className="mt-6 space-y-5">
              <div>
                <p className="mb-2 font-mono text-[10.5px] tracking-[0.12em] text-white/45 uppercase">
                  {role === "restaurant" ? "Calling from (optional, or just say it)" : "Calling for (optional, or just say it)"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {(directory.data ?? []).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setWho(who === d.id ? "" : d.id)}
                      aria-pressed={who === d.id}
                      className={cx("rounded-full border px-3 py-1.5 text-sm transition-colors",
                        who === d.id ? "border-sky bg-sky/15 text-white" : "border-line text-white/65 hover:text-white")}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void start()}
                disabled={!liveBackend}
                className="group flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-4 text-lg font-semibold text-navy transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                <PhoneCall className="size-5" aria-hidden /> Start the call
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
              <div className="rounded-2xl border border-line bg-raised p-4">
                <p className="font-mono text-[10.5px] tracking-[0.12em] text-white/45 uppercase">Try saying</p>
                <ul className="mt-2 space-y-1.5 text-[15px] text-white/80">
                  {SAY[role].map((s) => <li key={s}>&ldquo;{s}&rdquo;</li>)}
                </ul>
                <p className="mt-3 text-[12.5px] text-white/45">
                  Speech: {health?.stt === "ready" ? "Sarvam, multilingual" : "unavailable, so you can type"} · Language model: {health?.llm ?? "…"}
                </p>
              </div>
            </div>
          ) : null}

          {inCall || state.lines.length ? (
            <div ref={scroller} className="mt-6 max-h-[300px] min-h-[160px] flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite" aria-label="Live captions">
              {lines.map((l) => (
                <p key={l.id} className={cx("animate-enter text-[15.5px] leading-relaxed", l.speaker === "agent" ? "text-white" : l.final ? "text-white/70" : "text-white/40 italic")}>
                  <span className={cx("mr-2 font-mono text-[10px] tracking-[0.12em] uppercase", l.speaker === "agent" ? "text-sky" : "text-white/40")}>
                    {l.speaker === "agent" ? "AnnaRelay" : "You"}
                  </span>
                  {l.text}
                </p>
              ))}
              {state.thinking ? (
                <p className="flex items-center gap-1.5 text-sm text-orange" aria-label="Thinking">
                  {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-blink rounded-full bg-orange" style={{ animationDelay: `${i * 160}ms` }} />)}
                </p>
              ) : null}
            </div>
          ) : null}

          {inCall ? (
            <div className="mt-5 space-y-3">
              {showType || !state.micOn ? (
                <form onSubmit={submitTyped} className="flex gap-2">
                  <label htmlFor="typed" className="sr-only">Type your answer</label>
                  <input
                    id="typed"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Type instead of speaking…"
                    className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2.5 text-white placeholder:text-white/35 focus:border-sky focus:outline-none"
                  />
                  <button type="submit" className="rounded-full bg-white px-4 text-navy" aria-label="Send"><Send className="size-4" aria-hidden /></button>
                </form>
              ) : null}
              <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => setShowType((v) => !v)} className="flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-white/75 hover:text-white">
                  <Keyboard className="size-4" aria-hidden /> {showType ? "Hide keyboard" : "Type instead"}
                </button>
                <span className="flex items-center gap-1.5 text-sm text-white/45">
                  {state.micOn ? <Mic className="size-4 text-emerald" aria-hidden /> : <MicOff className="size-4" aria-hidden />}
                  {state.micOn ? "Mic on" : "Mic off"}
                </span>
                <button type="button" onClick={hangUp} className="flex items-center gap-2 rounded-full bg-orange px-5 py-2.5 text-sm font-semibold text-navy">
                  <PhoneOff className="size-4" aria-hidden /> Hang up
                </button>
              </div>
            </div>
          ) : null}

          {state.status === "ended" || state.status === "error" ? (
            <div className="mt-6 space-y-3 text-center">
              {state.error ? <p className="text-orange">{state.error}</p> : outcomeText ? <p className="text-white">{outcomeText}</p> : null}
              <button type="button" onClick={() => void start()} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-semibold text-navy">
                <RotateCcw className="size-4" aria-hidden /> Call again
              </button>
            </div>
          ) : null}
        </section>

        {/* ---- right: the card that becomes the live offer ---- */}
        <section aria-label={role === "restaurant" ? "Your offer" : "Your request"} className="min-w-0">
          {state.offer ? (
            <LiveOfferPanel initial={state.offer} />
          ) : state.demand ? (
            <div className="animate-pop rounded-card border border-emerald/40 bg-raised p-6">
              <p className="font-mono text-[10.5px] tracking-[0.14em] text-emerald uppercase">Request live</p>
              <h2 className="display mt-2 text-3xl text-white">Food for {state.demand.people_count} people</h2>
              <p className="mt-2 text-white/70">{state.demand.recipient_name} · by {fmtTime(state.demand.needed_by)} · within {state.demand.max_distance_km} km</p>
              <p className="mt-4 text-white/60">Offers that fit arrive on Telegram and in the web inbox.</p>
              <Link href={`/collector/${state.demand.recipient_id}`} className="mt-4 inline-flex items-center gap-1.5 font-semibold text-sky">Open the inbox <ArrowRight className="size-4" aria-hidden /></Link>
            </div>
          ) : (
            <DraftCard
              role={role}
              phase={state.phase}
              draft={state.draft}
              guardrail={state.guardrail}
              confirmations={state.confirmations}
              live={false}
            />
          )}
        </section>
      </div>
    </main>
  );
}
