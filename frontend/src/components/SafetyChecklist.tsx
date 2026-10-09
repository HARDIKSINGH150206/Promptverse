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
        "rounded-card border bg-white p-5 transition-shadow",
        highlight && !done ? "border-2 border-orange ring-4 ring-orange/30" : "border-navy/10",
      )}
    >
      <legend className="sr-only">Food safety checklist</legend>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-bold text-navy">
          <ClipboardCheck className="size-5 text-blue" aria-hidden />
          Food safety checklist
        </p>
        <span className={cx("text-sm font-semibold", done ? "text-blue" : "text-navy/55")}>
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
                on ? "border-blue bg-blue/5" : "border-navy/10 hover:border-blue/50",
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
                  on ? "border-blue bg-blue text-white" : "border-navy/30 bg-white",
                )}
                aria-hidden
              >
                {on ? <Check className="size-4.5" strokeWidth={3} /> : null}
              </span>
              <span>
                <span className="block text-base font-semibold text-navy">{c.label}</span>
                <span className="block text-sm text-navy/60">{c.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
