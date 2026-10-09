import { CircleHelp, MessageSquareQuote, Zap } from "lucide-react";
import { REPLY_INTENTS, type ReplyIntent, type ReplyUnderstanding } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { AiBadge } from "./AiBadge";
import { cx } from "@/lib/cx";

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
    <div className="h-2 w-full rounded-full bg-navy/[0.08]">
      <div
        className={cx("h-full rounded-full", warn ? "bg-orange" : strong ? "bg-blue" : "bg-blue/35")}
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
    <div className={cx("rounded-2xl border border-blue/20 bg-blue/[0.04] p-3.5 text-sm", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-start gap-1.5 text-navy">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden />
          <span className="italic">&ldquo;{u.text}&rdquo;</span>
        </p>
        <AiBadge source={u.source} probability={unavailable ? null : u.intent_probability} />
      </div>

      {unavailable ? null : (<>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wider text-navy/55">Understood as</p>
      <ul className="mt-1.5 space-y-1.5">
        {top.map((k) => (
          <li key={k} className="grid grid-cols-[minmax(0,9rem)_1fr_2.75rem] items-center gap-2">
            <span className={cx("truncate", k === u.intent ? "font-bold text-navy" : "text-navy/65")}>{INTENT_LABEL[k]}</span>
            <Bar value={u.probabilities[k] ?? 0} strong={k === u.intent} />
            <span className="tabular text-right text-navy/75">{pct(u.probabilities[k] ?? 0)}</span>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,9rem)_1fr_2.75rem] items-center gap-2">
          <span className={cx("truncate", riskHigh ? "font-bold text-navy" : "text-navy/65")}>Might not make it</span>
          <Bar value={u.at_risk_probability} warn={riskHigh} />
          <span className="tabular text-right text-navy/75">{pct(u.at_risk_probability)}</span>
        </li>
      </ul>
      </>)}

      {(u.meals !== null || u.eta) && !compact ? (
        <p className="mt-2 text-navy/70">
          {u.meals !== null ? <>Meals mentioned: <b className="text-navy">{u.meals}</b>. </> : null}
          {u.eta ? <>Arriving around <b className="text-navy">{fmtTime(u.eta)}</b>.</> : null}
        </p>
      ) : null}

      {u.needs_clarification && u.clarification_question ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-orange bg-white px-2.5 py-2 text-navy">
          <CircleHelp className="mt-0.5 size-4 shrink-0 text-orange" aria-hidden />
          {u.clarification_question}
        </p>
      ) : null}

      <p className={cx("mt-2.5 flex items-start gap-1.5 font-semibold", changed ? "text-blue" : "text-navy/70")}>
        <Zap className="mt-0.5 size-4 shrink-0" aria-hidden />
        {u.action_taken}
      </p>
    </div>
  );
}
