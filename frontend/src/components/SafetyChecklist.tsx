import { Check, ClipboardCheck } from "lucide-react";
import { cx } from "@/lib/cx";

export const CHECKLIST = [
  { key: "covered", label: "Kept covered", hint: "Lidded containers or wrapped trays" },
  { key: "temperature", label: "Kept hot or refrigerated", hint: "Never left at room temperature for long" },
  { key: "untouched", label: "Not served on plates / untouched", hint: "Straight from the kitchen, never from a diner's plate" },
] as const;

export type ChecklistKey = (typeof CHECKLIST)[number]["key"];
export type ChecklistState = Record<ChecklistKey, boolean>;
export const EMPTY_CHECKLIST: ChecklistState = { covered: false, temperature: false, untouched: false };

/** Required before an offer can be sent: sets confirmations.safety_checklist_confirmed. */
export function SafetyChecklist({
  value, onChange, highlight, id = "safety-checklist",
}: { value: ChecklistState; onChange: (v: ChecklistState) => void; highlight?: boolean; id?: string }) {
  const done = CHECKLIST.every((c) => value[c.key]);
  return (
    <fieldset
      id={id}
      className={cx(
        "rounded-card border bg-panel p-5 transition-shadow",
        highlight && !done ? "border-2 border-orange ring-4 ring-orange/30" : "border-line",
      )}
    >
      <legend className="sr-only">Food safety checklist</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-medium text-white">
          <ClipboardCheck className="size-5 text-sky" aria-hidden />
          Food safety checklist
        </p>
        <span className={cx("text-sm font-semibold", done ? "text-sky" : "text-white/60")}>
          {CHECKLIST.filter((c) => value[c.key]).length} of 3 · required
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {CHECKLIST.map((c) => {
          const on = value[c.key];
          return (
            <label
              key={c.key}
              className={cx(
                "flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors",
                on ? "border-sky/60 bg-sky/[0.06]" : "border-line hover:border-sky/50",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={(e) => onChange({ ...value, [c.key]: e.target.checked })}
              />
              <span
                className={cx(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg border-2",
                  on ? "border-sky/60 bg-blue text-white" : "border-white/25 bg-transparent",
                )}
                aria-hidden
              >
                {on ? <Check className="size-4.5" strokeWidth={3} /> : null}
              </span>
              <span>
                <span className="block text-base font-semibold text-white">{c.label}</span>
                <span className="block text-sm text-white/65">{c.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
