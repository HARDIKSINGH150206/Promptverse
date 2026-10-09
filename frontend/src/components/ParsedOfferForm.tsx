"use client";

import { Camera, Plus, X } from "lucide-react";
import type { OfferItem, ParsedOffer } from "@/lib/api/types";
import { istInputToIso, isoToIstInput } from "@/lib/time";
import { AiBadge } from "./AiBadge";
import { FollowupBubble } from "./FollowupBubble";
import { GuardrailPanel } from "./GuardrailPanel";
import { CHECKLIST, EMPTY_CHECKLIST, SafetyChecklist, type ChecklistState } from "./SafetyChecklist";
import { Card, FieldLabel, cx, inputBase, inputClass, missingRing } from "./ui";

export interface OfferDraft {
  items: OfferItem[];
  meal_count: string;
  diet: "veg" | "nonveg" | null;
  diet_confirmed: boolean;
  cooked_at: string; // IST "YYYY-MM-DDTHH:mm"
  safe_until: string;
  pickup_notes: string;
  checklist: ChecklistState;
}

/** Fresh parse -> draft. On a re-parse, keep what the user already filled when the AI returns nothing new. */
export function draftFromParsed(p: ParsedOffer, prev?: OfferDraft): OfferDraft {
  const keep = <T,>(next: T | null | "", old: T | undefined, empty: T): T =>
    next !== null && next !== "" ? next : old ?? empty;
  return {
    items: p.items.length ? p.items.map((i) => ({ ...i })) : prev?.items ?? [],
    meal_count: keep(p.estimated_meals !== null ? String(p.estimated_meals) : null, prev?.meal_count, ""),
    diet: p.diet ?? prev?.diet ?? null,
    // a new parse can change what the guardrail says, so the diet must be confirmed again
    diet_confirmed: false,
    cooked_at: keep(isoToIstInput(p.cooked_at), prev?.cooked_at, ""),
    safe_until: keep(isoToIstInput(p.safe_until), prev?.safe_until, ""),
    pickup_notes: keep(p.pickup_notes, prev?.pickup_notes, ""),
    checklist: prev?.checklist ?? EMPTY_CHECKLIST,
  };
}

export type OfferProblem = "meal_count" | "diet" | "cooked_at" | "safe_until" | "checklist" | "items";

/** Client-side checks that mirror the backend's 400s, so people see them before sending. */
export function validateOffer(d: OfferDraft, nowMs: number): { field: OfferProblem; message: string }[] {
  const out: { field: OfferProblem; message: string }[] = [];
  const meals = Number(d.meal_count);
  if (d.items.some((i) => !i.name.trim())) out.push({ field: "items", message: "Every food item needs a name." });
  if (!Number.isInteger(meals) || meals < 1) out.push({ field: "meal_count", message: "Enter how many meals (at least 1)." });
  if (!d.diet || !d.diet_confirmed) out.push({ field: "diet", message: "Answer whether every item is vegetarian." });
  const cooked = istInputToIso(d.cooked_at);
  const safe = istInputToIso(d.safe_until);
  if (!cooked) out.push({ field: "cooked_at", message: "Add when the food was cooked." });
  if (!safe) out.push({ field: "safe_until", message: "Add until when the food is safe." });
  else if (Date.parse(safe) <= nowMs) out.push({ field: "safe_until", message: "\"Safe until\" must be in the future." });
  else if (cooked && Date.parse(safe) <= Date.parse(cooked)) out.push({ field: "safe_until", message: "\"Safe until\" must be after the cooking time." });
  if (!CHECKLIST.every((c) => d.checklist[c.key])) out.push({ field: "checklist", message: "Tick all three safety checks." });
  return out;
}

export function ParsedOfferForm({
  parsed, draft, onChange, onFollowupAnswer, reparsing, showErrors, problems, highlightChecklist,
}: {
  parsed: ParsedOffer;
  draft: OfferDraft;
  onChange: (d: OfferDraft) => void;
  onFollowupAnswer: (answer: string) => void;
  reparsing: boolean;
  showErrors: boolean;
  problems: OfferProblem[];
  highlightChecklist: boolean;
}) {
  const set = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K]) => onChange({ ...draft, [k]: v });
  const missing = (f: OfferProblem) => showErrors && problems.includes(f);
  const aiMissing = new Set(parsed.missing_fields);
  const flag = (f: "estimated_meals" | "cooked_at" | "safe_until", field: OfferProblem, value: string) =>
    (aiMissing.has(f) && !value) || missing(field);

  const setItem = (i: number, patch: Partial<OfferItem>) =>
    set("items", draft.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  return (
    <div className="space-y-5">
      {parsed.followup_question ? (
        <FollowupBubble question={parsed.followup_question} onAnswer={onFollowupAnswer} busy={reparsing} />
      ) : null}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-medium text-white">What we understood</h3>
          <span className="text-sm text-white/60">Edit anything that&apos;s off</span>
        </div>

        <div className="mt-4">
          <FieldLabel missing={missing("items")}>Food items</FieldLabel>
          {draft.items.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-white/70">No dishes recognised. Add them below.</p>
          ) : (
            <ul className="space-y-2">
              {draft.items.map((it, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <input
                    aria-label={`Item ${i + 1} name`}
                    value={it.name}
                    onChange={(e) => setItem(i, { name: e.target.value })}
                    className={cx(inputBase, "min-w-0 basis-full sm:basis-auto sm:flex-1", missing("items") && !it.name.trim() && missingRing(true))}
                    placeholder="Dish"
                  />
                  <input
                    aria-label={`Item ${i + 1} quantity`}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    value={Number.isFinite(it.quantity) ? it.quantity : ""}
                    onChange={(e) => setItem(i, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })}
                    className={cx(inputBase, "tabular w-24")}
                  />
                  <input
                    aria-label={`Item ${i + 1} unit`}
                    value={it.unit}
                    onChange={(e) => setItem(i, { unit: e.target.value })}
                    className={cx(inputBase, "min-w-0 flex-1 sm:w-28 sm:flex-none")}
                    placeholder="plates"
                  />
                  <button
                    type="button"
                    onClick={() => set("items", draft.items.filter((_, j) => j !== i))}
                    className="rounded-xl p-2 text-white/65 hover:bg-white/5 hover:text-white"
                    aria-label={`Remove ${it.name || "item"}`}
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => set("items", [...draft.items, { name: "", quantity: Number(draft.meal_count) || 1, unit: "plates" }])}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-semibold text-sky hover:bg-sky/10"
          >
            <Plus className="size-4" aria-hidden /> Add a dish
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="meal_count" missing={flag("estimated_meals", "meal_count", draft.meal_count)}>Meals</FieldLabel>
            <input
              id="meal_count"
              type="number"
              min={1}
              inputMode="numeric"
              value={draft.meal_count}
              onChange={(e) => set("meal_count", e.target.value)}
              className={cx(inputClass, "tabular text-lg font-semibold", missingRing(flag("estimated_meals", "meal_count", draft.meal_count)))}
              placeholder="40"
            />
          </div>
          <div>
            <FieldLabel htmlFor="pickup_notes">Pickup notes</FieldLabel>
            <input
              id="pickup_notes"
              value={draft.pickup_notes}
              onChange={(e) => set("pickup_notes", e.target.value)}
              className={inputClass}
              placeholder="Back gate, ask for Ravi"
            />
          </div>
          <div>
            <FieldLabel htmlFor="cooked_at" missing={flag("cooked_at", "cooked_at", draft.cooked_at)}>Cooked at (IST)</FieldLabel>
            <input
              id="cooked_at"
              type="datetime-local"
              value={draft.cooked_at}
              onChange={(e) => set("cooked_at", e.target.value)}
              className={cx(inputClass, "tabular", missingRing(flag("cooked_at", "cooked_at", draft.cooked_at)))}
            />
          </div>
          <div>
            <FieldLabel htmlFor="safe_until" missing={flag("safe_until", "safe_until", draft.safe_until)}>Safe until (IST)</FieldLabel>
            <input
              id="safe_until"
              type="datetime-local"
              value={draft.safe_until}
              onChange={(e) => set("safe_until", e.target.value)}
              className={cx(inputClass, "tabular", missingRing(flag("safe_until", "safe_until", draft.safe_until)))}
            />
          </div>
        </div>

        {parsed.photo_check ? (
          <p className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-white">
            <Camera className="size-4 text-sky" aria-hidden />
            <b>Photo check (advisory):</b>
            {parsed.photo_check.matches_description === false ? "doesn't seem to match the description." : parsed.photo_check.matches_description ? "matches the description." : "unclear."}
            <span className="text-white/75">{parsed.photo_check.note}</span>
            <AiBadge source="llm" />
          </p>
        ) : null}
      </Card>

      <GuardrailPanel
        guardrail={parsed.guardrail}
        diet={draft.diet}
        dietConfirmed={draft.diet_confirmed}
        highlight={missing("diet")}
        onAnswer={(allVeg) => onChange({ ...draft, diet: allVeg ? "veg" : "nonveg", diet_confirmed: true })}
      />

      <SafetyChecklist
        value={draft.checklist}
        onChange={(v) => set("checklist", v)}
        highlight={highlightChecklist || missing("checklist")}
      />
    </div>
  );
}
