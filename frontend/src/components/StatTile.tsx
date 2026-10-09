import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export function StatTile({
  label, value, sub, icon, hero = false, className,
}: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; hero?: boolean; className?: string }) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col justify-between rounded-card p-5",
        hero ? "bg-navy text-white" : "border border-navy/10 bg-white text-navy",
        className,
      )}
    >
      <p className={cx("flex items-center gap-2 text-sm font-semibold", hero ? "text-white/80" : "text-navy/65")}>
        {icon}
        {label}
      </p>
      <p className={cx("tabular mt-3 font-extrabold tracking-tight", hero ? "text-6xl sm:text-7xl" : "text-4xl")}>{value}</p>
      {sub ? <p className={cx("mt-1.5 text-sm", hero ? "text-white/75" : "text-navy/60")}>{sub}</p> : null}
    </div>
  );
}
