import { Compass, Dices, ListOrdered } from "lucide-react";
import type { SelectionInfo } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

/** Why the engine picked this recipient: ranked by the reliability mean, a Thompson draw, or exploration. */
export function SelectionNote({ selection, className }: { selection: SelectionInfo; className?: string }) {
  const { method, explored, sampled_p_complete: sampled, reason } = selection;
  const Icon = explored ? Compass : method === "thompson" ? Dices : ListOrdered;
  const title = explored
    ? "Exploration: giving a less-proven recipient a chance"
    : method === "thompson"
      ? "Ranked by Thompson sampling"
      : "Ranked by reliability";

  return (
    <div className={cx("rounded-2xl px-3 py-2.5 text-sm", explored ? "border border-dashed border-blue bg-blue/5" : "bg-navy/[0.04]", className)}>
      <p className="flex items-center gap-1.5 font-semibold text-blue">
        <Icon className="size-4 shrink-0" aria-hidden />
        {title}
        {method === "thompson" && sampled !== null ? (
          <span className="tabular ml-auto text-xs font-semibold text-navy/60">drew {pct(sampled)}</span>
        ) : null}
      </p>
      <p className="mt-1 text-navy/75">{reason}</p>
    </div>
  );
}
