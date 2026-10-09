import { Compass, Dices, ListOrdered } from "lucide-react";
import type { SelectionInfo } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

/** Why the engine picked this recipient: ranked by the reliability mean, a Thompson draw, or exploration. */
export function SelectionNote({ selection, className }: { selection: SelectionInfo; className?: string }) {
  const { method, explored, sampled_p_complete: sampled, reason } = selection;
  const Icon = explored ? Compass : method === "thompson" ? Dices : ListOrdered;
  const title = explored
    ? "Exploration: giving a less-proven home a chance"
    : method === "thompson"
      ? "Ranked by Thompson sampling"
      : "Ranked by reliability";

  return (
    <div className={cx("rounded-xl border px-3 py-2.5 text-sm", explored ? "border-dashed border-sky/40 bg-sky/[0.05]" : "border-white/[0.06] bg-white/[0.03]", className)}>
      <p className="flex items-center gap-1.5 font-medium text-sky">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {title}
        {method === "thompson" && sampled !== null ? (
          <span className="tabular ml-auto font-mono text-[11px] text-white/45">drew {pct(sampled)}</span>
        ) : null}
      </p>
      <p className="mt-1 leading-relaxed text-white/60">{reason}</p>
    </div>
  );
}
