"use client";

// Mirrors any voice-agent call in progress (from GET /api/stream call.* events), e.g. on the projector board.
import { useState } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { useStreamEvent } from "@/lib/stream";
import type { CallDraft, CallPhase, CallRole } from "@/lib/voice/useAgentCall";
import type { IntakeGuardrail } from "@/lib/api/types";
import { DraftCard } from "./call/DraftCard";
import { cx } from "./ui";

export interface LiveCallView {
  callId: string;
  role: CallRole;
  phase: CallPhase;
  draft: CallDraft;
  guardrail: IntakeGuardrail | null;
  lastAgent: string | null;
  lastCaller: string | null;
  ended: { outcome: string; offerId: string | null } | null;
}

export function useLiveCall(): LiveCallView | null {
  const [call, setCall] = useState<LiveCallView | null>(null);

  useStreamEvent<{ call_id: string; role: CallRole }>("call.started", (d) =>
    setCall({ callId: d.call_id, role: d.role, phase: "collect", draft: {}, guardrail: null, lastAgent: null, lastCaller: null, ended: null }),
  );
  useStreamEvent<{ call_id: string; role: CallRole; phase: CallPhase; draft: CallDraft; guardrail: IntakeGuardrail | null }>("call.draft", (d) =>
    setCall((c) => ({
      ...(c && c.callId === d.call_id ? c : { lastAgent: null, lastCaller: null, ended: null }),
      callId: d.call_id, role: d.role, phase: d.phase, draft: d.draft, guardrail: d.guardrail,
    })),
  );
  useStreamEvent<{ call_id: string; speaker: "user" | "agent"; text: string; final: boolean }>("call.caption", (d) =>
    setCall((c) => (c && c.callId === d.call_id ? { ...c, [d.speaker === "agent" ? "lastAgent" : "lastCaller"]: d.text } : c)),
  );
  useStreamEvent<{ call_id: string; outcome: string; offer_id: string | null }>("call.ended", (d) => {
    setCall((c) => (c && c.callId === d.call_id ? { ...c, ended: { outcome: d.outcome, offerId: d.offer_id } } : c));
    // let the result sit on screen briefly, then clear the banner
    setTimeout(() => setCall((c) => (c && c.callId === d.call_id ? null : c)), 12000);
  });
  return call;
}

export function LiveCallBanner({ call, className }: { call: LiveCallView; className?: string }) {
  return (
    <section aria-label="Voice call in progress" className={cx("animate-pop rounded-card border border-sky/40 bg-panel p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-white">
          <span className="relative flex size-8 items-center justify-center rounded-full bg-sky/15 text-sky">
            {!call.ended ? <span className="absolute inset-0 animate-ping rounded-full bg-sky/30" aria-hidden /> : null}
            <PhoneCall className="relative size-4" aria-hidden />
          </span>
          <span className="font-medium">
            {call.ended ? "Voice call ended" : `Live voice call · ${call.role === "restaurant" ? "a restaurant is listing food" : "a shelter is posting a need"}`}
          </span>
        </p>
        {call.ended?.offerId ? (
          <Link href={`/offers/${call.ended.offerId}`} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-navy">Open the offer</Link>
        ) : null}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2 text-[15px]">
          {call.lastCaller ? <p className="text-white/70"><span className="font-mono text-[10.5px] tracking-[0.12em] text-white/40 uppercase">Caller</span><br />{call.lastCaller}</p> : null}
          {call.lastAgent ? <p className="text-white"><span className="font-mono text-[10.5px] tracking-[0.12em] text-sky uppercase">AnnaRelay</span><br />{call.lastAgent}</p> : null}
        </div>
        <DraftCard role={call.role} phase={call.phase} draft={call.draft} guardrail={call.guardrail}
          confirmations={{ diet_confirmed: ["safety_checklist", "submitting", "narrating", "done"].includes(call.phase), safety_checklist_confirmed: ["submitting", "narrating", "done"].includes(call.phase) }}
          live={["submitting", "narrating", "done"].includes(call.phase)} />
      </div>
    </section>
  );
}
