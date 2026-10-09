import { Gauge } from "lucide-react";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

/** Failure risk (p_fail) against the standby threshold line. Turns orange above the threshold. */
export function RiskMeter({
  pFail, threshold, compact = false, label = "Failure risk", className,
}: { pFail: number | null; threshold: number; compact?: boolean; label?: string; className?: string }) {
  const p = pFail ?? 0;
  const above = pFail !== null && p > threshold;
  const desc = pFail === null
    ? `${label} not computed yet; threshold ${pct(threshold)}`
    : `${label} ${pct(p)}, ${above ? "above" : "below"} the ${pct(threshold)} threshold`;

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={cx("inline-flex items-center gap-1.5 font-medium text-white/85", compact ? "text-xs" : "text-sm")}>
          <Gauge className={cx("size-3.5", above ? "text-orange" : "text-sky")} aria-hidden />
          {label}
          <span className={cx("tabular rounded-md px-1.5", above ? "bg-orange text-navy" : "text-sky")}>
            {pFail === null ? "—" : pct(p)}
          </span>
        </span>
        <span className={cx(compact ? "text-[11px]" : "text-xs", above ? "text-white" : "text-white/45")}>
          {pFail === null ? "Not checked yet" : above ? "Above threshold: backup" : "Below threshold"}
        </span>
      </div>
      <div
        role="img"
        aria-label={desc}
        title={desc}
        className={cx("relative mt-2 w-full rounded-full bg-white/[0.07]", compact ? "h-1.5" : "h-2")}
      >
        <div
          className={cx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-700", above ? "bg-orange" : "bg-sky")}
          style={{ width: `${Math.min(100, p * 100)}%` }}
        />
        <div className="absolute -top-1 -bottom-1 w-px bg-white" style={{ left: `${threshold * 100}%` }} aria-hidden />
      </div>
      {!compact ? (
        <div className="relative mt-1.5 h-4 font-mono text-[10px] tracking-wide text-white/40 uppercase">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${threshold * 100}%` }}>
            {pct(threshold)} threshold
          </span>
        </div>
      ) : null}
    </div>
  );
}
