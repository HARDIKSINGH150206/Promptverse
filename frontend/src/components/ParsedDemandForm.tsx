"use client";

import { Leaf, Utensils, Drumstick } from "lucide-react";
import type { Diet, ParsedDemand } from "@/lib/api/types";
import { istInputToIso, isoToIstInput } from "@/lib/time";
import { FollowupBubble } from "./FollowupBubble";
import { Card, FieldLabel, cx, inputClass, missingRing } from "./ui";

export interface DemandDraft {
  people_count: string;
  diet: Diet | null;
  needed_by: string; // IST "YYYY-MM-DDTHH:mm"
  max_distance_km: string;
  notes: string;
}

export const DEFAULT_MAX_KM = 5;

export function demandDraftFromParsed(p: ParsedDemand, prev?: DemandDraft): DemandDraft {
  return {
    people_count: p.people_count !== null ? String(p.people_count) : prev?.people_count ?? "",
    diet: p.diet ?? prev?.diet ?? null,
    needed_by: isoToIstInput(p.needed_by) || prev?.needed_by || "",
    max_distance_km: p.max_distance_km !== null ? String(p.max_distance_km) : prev?.max_distance_km ?? String(DEFAULT_MAX_KM),
    notes: p.notes ?? prev?.notes ?? "",
  };
}

export type DemandProblem = "people_count" | "diet" | "needed_by" | "max_distance_km";

export function validateDemand(d: DemandDraft, nowMs: number): { field: DemandProblem; message: string }[] {
  const out: { field: DemandProblem; message: string }[] = [];
  const people = Number(d.people_count);
  if (!Number.isInteger(people) || people < 1) out.push({ field: "people_count", message: "Enter how many people need food." });
  if (!d.diet) out.push({ field: "diet", message: "Choose veg only, non-veg, or anything." });
  const by = istInputToIso(d.needed_by);
  if (!by) out.push({ field: "needed_by", message: "Add by when you need the food." });
  else if (Date.parse(by) <= nowMs) out.push({ field: "needed_by", message: "\"Needed by\" must be in the future." });
  const km = Number(d.max_distance_km);
  if (!(km > 0 && km <= 50)) out.push({ field: "max_distance_km", message: "Pickup distance must be between 0 and 50 km." });
  return out;
}

const DIETS: { v: Diet; label: string; icon: typeof Leaf }[] = [
  { v: "veg", label: "Veg only", icon: Leaf },
  { v: "nonveg", label: "Non-veg", icon: Drumstick },
  { v: "any", label: "Anything", icon: Utensils },
];

export function ParsedDemandForm({
  parsed, draft, onChange, onFollowupAnswer, reparsing, showErrors, problems,
}: {
  parsed: ParsedDemand;
  draft: DemandDraft;
  onChange: (d: DemandDraft) => void;
  onFollowupAnswer: (answer: string) => void;
  reparsing: boolean;
  showErrors: boolean;
  problems: DemandProblem[];
}) {
  const set = <K extends keyof DemandDraft>(k: K, v: DemandDraft[K]) => onChange({ ...draft, [k]: v });
  const ai = new Set(parsed.missing_fields);
  const flag = (f: DemandProblem, empty: boolean) => (ai.has(f as never) && empty) || (showErrors && problems.includes(f));

  return (
    <div className="space-y-5">
      {parsed.followup_question ? (
        <FollowupBubble question={parsed.followup_question} onAnswer={onFollowupAnswer} busy={reparsing} />
      ) : null}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-navy">What we understood</h3>
          <span className="text-sm text-navy/55">Edit anything that&apos;s off</span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="people_count" missing={flag("people_count", !draft.people_count)}>People to feed</FieldLabel>
            <input
              id="people_count"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.people_count}
              onChange={(e) => set("people_count", e.target.value)}
              className={cx(inputClass, "tabular text-lg font-semibold", missingRing(flag("people_count", !draft.people_count)))}
              placeholder="20"
            />
          </div>
          <div>
            <FieldLabel htmlFor="needed_by" missing={flag("needed_by", !draft.needed_by)}>Needed by (IST)</FieldLabel>
            <input
              id="needed_by"
              type="datetime-local"
              value={draft.needed_by}
              onChange={(e) => set("needed_by", e.target.value)}
              className={cx(inputClass, "tabular", missingRing(flag("needed_by", !draft.needed_by)))}
            />
          </div>
        </div>

        <div className="mt-4">
          <FieldLabel missing={flag("diet", !draft.diet)}>Food you can accept</FieldLabel>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Food you can accept">
            {DIETS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={draft.diet === v}
                onClick={() => set("diet", v)}
                className={cx(
                  "flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-bold transition-colors",
                  draft.diet === v ? "border-blue bg-blue text-white" : "border-navy/15 bg-white text-navy hover:border-blue",
                  flag("diet", !draft.diet) && draft.diet !== v && "border-orange!",
                )}
              >
                <Icon className="size-4.5" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="max_distance_km" missing={showErrors && problems.includes("max_distance_km")}>Max pickup distance (km)</FieldLabel>
            <input
              id="max_distance_km"
              type="number"
              min={0.5}
              max={50}
              step={0.5}
              inputMode="decimal"
              value={draft.max_distance_km}
              onChange={(e) => set("max_distance_km", e.target.value)}
              className={cx(inputClass, "tabular", missingRing(showErrors && problems.includes("max_distance_km")))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <input
              id="notes"
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              className={inputClass}
              placeholder="Children, soft food preferred"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
