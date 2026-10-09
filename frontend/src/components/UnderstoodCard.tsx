import { CircleHelp, MessageSquareQuote, Zap } from "lucide-react";
import { REPLY_INTENTS, type ReplyIntent, type ReplyUnderstanding } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { cx } from "@/lib/cx";
import { AiBadge } from "./AiBadge";

export const INTENT_LABEL: Record<ReplyIntent, string> = {
  accept_full: "Accepting all",
  accept_partial: "Accepting some",
  decline: "Declining",
  cancel: "Cancelling",
  still_coming: "Still coming",
  running_late: "Running late",
  question: "Question / unclear",
};

function Bar({ value, strong, warn }: { value: number; strong?: boolean; warn?: boolean }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/[0.07]">
      <div
        className={cx("h-full rounded-full", warn ? "bg-orange" : strong ? "bg-sky" : "bg-sky/35")}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

/** What the AI understood from a free-text reply, and what the rule table did with it. */
export function UnderstoodCard({ understood, compact = false, className }: { understood: ReplyUnderstanding; compact?: boolean; className?: string }) {
  const u = understood;
  const top = [...REPLY_INTENTS]
    .sort((a, b) => (u.probabilities[b] ?? 0) - (u.probabilities[a] ?? 0))
    .slice(0, compact ? 2 : 3);
  const riskHigh = u.at_risk_probability > 0.3;
  const changed = !u.action_taken.startsWith("No change");
  // fallback rules mean no model answered: there are no probabilities to show
  const unavailable = u.source === "fallback_rules";

  return (
    <div className={cx("rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-start gap-2 text-white/90">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-sky" aria-hidden />
          <span className="italic">&ldquo;{u.text}&rdquo;</span>
        </p>
        <AiBadge source={u.source} probability={unavailable ? null : u.intent_probability} />
      </div>

      {unavailable ? null : (
        <>
          <p className="mt-3 font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">Understood as</p>
          <ul className="mt-2 space-y-2">
            {top.map((k) => (
              <li key={k} className="grid grid-cols-[minmax(0,8.5rem)_1fr_2.5rem] items-center gap-2.5">
                <span className={cx("truncate", k === u.intent ? "font-medium text-white" : "text-white/50")}>{INTENT_LABEL[k]}</span>
                <Bar value={u.probabilities[k] ?? 0} strong={k === u.intent} />
                <span className="tabular text-right text-white/60">{pct(u.probabilities[k] ?? 0)}</span>
              </li>
            ))}
            <li className="grid grid-cols-[minmax(0,8.5rem)_1fr_2.5rem] items-center gap-2.5">
              <span className={cx("truncate", riskHigh ? "font-medium text-white" : "text-white/50")}>Might not make it</span>
              <Bar value={u.at_risk_probability} warn={riskHigh} />
              <span className="tabular text-right text-white/60">{pct(u.at_risk_probability)}</span>
            </li>
          </ul>
        </>
      )}

      {(u.meals !== null || u.eta) && !compact ? (
        <p className="mt-2.5 text-white/60">
          {u.meals !== null ? <>Meals mentioned: <b className="font-medium text-white">{u.meals}</b>. </> : null}
          {u.eta ? <>Arriving around <b className="font-medium text-white">{fmtTime(u.eta)}</b>.</> : null}
        </p>
      ) : null}

      {u.needs_clarification && u.clarification_question ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-orange/60 bg-orange/[0.06] px-2.5 py-2 text-white">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden />
          {u.clarification_question}
        </p>
      ) : null}

      <p className={cx("mt-3 flex items-start gap-1.5 font-medium", changed ? "text-sky" : "text-white/55")}>
        <Zap className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {u.action_taken}
      </p>
    </div>
  );
}
