import type { Recipient } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

/**
 * Bayesian reliability, drawn honestly: the dot is the posterior mean (p_complete), the band is the
 * 90% credible interval. A new recipient's wide band must look visibly different from a proven one's.
 */
export function ReliabilityBar({
  recipient, compact = false, showExplanation = false, className,
}: { recipient: Recipient; compact?: boolean; showExplanation?: boolean; className?: string }) {
  const r = recipient.reliability;
  const [lo, hi] = r.interval_90;
  const done = recipient.stats.completed;
  const label = r.observations === 0 ? "No pickups yet" : `${done} of ${r.observations} pickups`;
  const desc = `Reliability ${pct(r.p_complete)}, likely between ${pct(lo)} and ${pct(hi)}. ${label}.`;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular text-sm font-bold text-navy">
          {pct(r.p_complete)}
          <span className="ml-1.5 font-medium text-navy/60">likely {pct(lo)}–{pct(hi)}</span>
        </span>
        <span className="text-xs font-semibold text-navy/60">{label}</span>
      </div>
      <div
        role="img"
        aria-label={desc}
        title={desc}
        className={cx("relative mt-1.5 w-full rounded-full bg-navy/[0.08]", compact ? "h-2.5" : "h-3.5")}
      >
        <div
          className="absolute inset-y-0 rounded-full bg-blue/30"
          style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%` }}
        />
        <div
          className={cx(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue",
            compact ? "size-3.5" : "size-4.5",
          )}
          style={{ left: `${r.p_complete * 100}%` }}
        />
      </div>
      {showExplanation ? <p className="mt-2 text-sm text-navy/70">{r.explanation}</p> : null}
    </div>
  );
}
