import type { Recipient } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

/**
 * Bayesian reliability, drawn honestly: the dot is the posterior mean (p_complete), the band is the
 * 90% credible interval. A new recipient's wide band must look visibly different from a proven one's.
 */
export function ReliabilityBar({
  recipient, compact = false, showExplanation = false, light = false, className,
}: { recipient: Recipient; compact?: boolean; showExplanation?: boolean; light?: boolean; className?: string }) {
  const r = recipient.reliability;
  const [lo, hi] = r.interval_90;
  const label = r.observations === 0 ? "No pickups yet" : `${recipient.stats.completed} of ${r.observations} pickups`;
  const desc = `Reliability ${pct(r.p_complete)}, likely between ${pct(lo)} and ${pct(hi)}. ${label}.`;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={cx("tabular text-sm font-medium", light ? "text-navy" : "text-white")}>
          {pct(r.p_complete)}
          <span className={cx("ml-1.5 font-normal", light ? "text-navy/55" : "text-white/45")}>likely {pct(lo)}–{pct(hi)}</span>
        </span>
        <span className={cx("text-xs", light ? "text-navy/55" : "text-white/45")}>{label}</span>
      </div>
      <div
        role="img"
        aria-label={desc}
        title={desc}
        className={cx("relative mt-2 w-full rounded-full", light ? "bg-navy/[0.08]" : "bg-white/[0.07]", compact ? "h-1.5" : "h-2")}
      >
        <div
          className={cx("absolute inset-y-0 rounded-full", light ? "bg-blue/30" : "bg-sky/30")}
          style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%` }}
        />
        <div
          className={cx(
            "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
            light ? "border-mist bg-blue" : "border-navy bg-sky",
            compact ? "size-3" : "size-3.5",
          )}
          style={{ left: `${r.p_complete * 100}%` }}
        />
      </div>
      {showExplanation ? <p className="mt-2 text-sm text-white/60">{r.explanation}</p> : null}
    </div>
  );
}
