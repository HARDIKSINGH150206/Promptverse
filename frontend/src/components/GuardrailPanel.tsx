import { Leaf, ShieldAlert, ShieldCheck, Drumstick } from "lucide-react";
import type { IntakeGuardrail } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { AiBadge } from "./AiBadge";
import { cx } from "@/lib/cx";

const DIET_WORD = { veg: "Vegetarian", nonveg: "Non-vegetarian" } as const;

/**
 * Laya's diet double-check and food-safety concern, with probabilities and reasons.
 * The guardrail only decides how loudly we ask; the diet question is always asked (diet_confirmed must be true).
 */
export function GuardrailPanel({
  guardrail, diet, dietConfirmed, onAnswer, highlight,
}: {
  guardrail: IntakeGuardrail;
  diet: "veg" | "nonveg" | null;
  dietConfirmed: boolean;
  onAnswer: (allVeg: boolean) => void;
  highlight?: boolean;
}) {
  const g = guardrail;
  const loud = g.needs_confirmation;
  const safety = g.safety_concern_probability;
  const safetyWarn = safety !== null && safety > 0.3;

  return (
    <section
      aria-labelledby="guardrail-title"
      className={cx(
        "rounded-card p-5",
        loud ? "border border-orange/70 bg-panel" : "border border-line bg-panel",
        highlight && !dietConfirmed && "ring-4 ring-orange/30",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="guardrail-title" className="flex items-center gap-2 text-lg font-medium text-white">
          {loud ? <ShieldAlert className="size-5 text-orange" aria-hidden /> : <ShieldCheck className="size-5 text-sky" aria-hidden />}
          {loud ? "Please double-check" : "Automatic safety check"}
        </h3>
        <AiBadge source={g.source} />
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <dt className="text-xs font-medium uppercase tracking-wider text-white/60">Diet check</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 text-base font-semibold text-white">
            {g.diet_check ? (
              <>
                {g.diet_check.label === "veg" ? <Leaf className="size-4 text-sky" aria-hidden /> : <Drumstick className="size-4 text-orange" aria-hidden />}
                {DIET_WORD[g.diet_check.label]}
                <span className="tabular text-white/75">{pct(g.diet_check.probability)}</span>
                {!g.diet_check.agrees_with_extraction ? (
                  <span className="rounded-full border border-orange px-2 py-px text-xs font-medium text-white">Doesn&apos;t match the note</span>
                ) : null}
              </>
            ) : (
              <span className="text-white/75">Not available</span>
            )}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <dt className="text-xs font-medium uppercase tracking-wider text-white/60">Safety concern</dt>
          <dd className="mt-1">
            {safety === null ? (
              <span className="text-base font-semibold text-white/75">Not available</span>
            ) : (
              <>
                <span className={cx("tabular text-base font-semibold", safetyWarn ? "text-white" : "text-white")}>
                  {pct(safety)} {safetyWarn ? "· please check" : "· no sign of a problem"}
                </span>
                <div className="mt-1.5 h-2 rounded-full bg-white/[0.06]">
                  <div className={cx("h-full rounded-full", safetyWarn ? "bg-orange" : "bg-sky")} style={{ width: `${Math.max(2, safety * 100)}%` }} />
                </div>
              </>
            )}
          </dd>
        </div>
      </dl>

      {g.reasons.length ? (
        <ul className={cx("mt-4 space-y-1.5 rounded-2xl p-3 text-[15px]", loud ? "bg-orange/10" : "bg-white/[0.03]")}>
          {g.reasons.map((r) => (
            <li key={r} className="flex gap-2 text-white">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange" aria-hidden />
              {r}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5">
        <p className={cx("font-medium text-white", loud ? "text-lg" : "text-base")}>Is every item vegetarian?</p>
        <p className="text-sm text-white/65">No meat, fish or egg in any dish. Your answer is sent with the offer.</p>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Is every item vegetarian?">
          {([true, false] as const).map((yes) => {
            const selected = dietConfirmed && diet === (yes ? "veg" : "nonveg");
            return (
              <button
                key={String(yes)}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onAnswer(yes)}
                className={cx(
                  "flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-base font-medium transition-colors",
                  selected ? "border-sky/60 bg-blue text-white" : "border-line bg-white/[0.03] text-white hover:border-sky/60",
                )}
              >
                {yes ? <Leaf className="size-5" aria-hidden /> : <Drumstick className="size-5" aria-hidden />}
                {yes ? "Yes, all veg" : "No, has non-veg"}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
