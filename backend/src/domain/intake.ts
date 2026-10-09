// The one place offers and demands are created. REST forms and the voice agent both go through
// here, so a voice call can never skip a check the web form enforces.
import { z } from "zod";
import { addEvent, getRecipient, getRestaurant, insertDemand, insertOffer, listOfferRowsByStatus } from "../db/repo";
import { nowIso, nowMs } from "./clock";
import { fmtTime } from "./format";
import { newId } from "./ids";
import { runMatching } from "./matching";
import { AppError, type DemandRow, type IntakeGuardrail, type OfferRow } from "./types";

const isoString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");

export const CreateOfferBody = z.object({
  restaurant_id: z.string().min(1),
  items: z.array(z.object({ name: z.string().min(1), quantity: z.number().nonnegative(), unit: z.string() })),
  meal_count: z.number().int(),
  diet: z.enum(["veg", "nonveg"]),
  cooked_at: isoString,
  safe_until: isoString,
  photo_url: z.string().nullable().default(null),
  raw_transcript: z.string().nullable().default(null),
  pickup_notes: z.string().nullable().default(null),
  confirmations: z.object({ diet_confirmed: z.boolean(), safety_checklist_confirmed: z.boolean() }).optional(),
});
export type CreateOfferInput = z.input<typeof CreateOfferBody>;

export const CreateDemandBody = z.object({
  recipient_id: z.string().min(1),
  people_count: z.number().int().min(1),
  diet: z.enum(["veg", "nonveg", "any"]),
  needed_by: isoString,
  max_distance_km: z.number().positive().max(50),
  notes: z.string().nullable().default(null),
  raw_transcript: z.string().nullable().default(null),
});
export type CreateDemandInput = z.input<typeof CreateDemandBody>;

/** Validates, inserts, logs and starts matching. Returns the new offer id. */
export function createOffer(input: z.infer<typeof CreateOfferBody>, guardrail: IntakeGuardrail | null, via: "web" | "voice" = "web"): string {
  const body = input;
  if (body.confirmations?.diet_confirmed !== true || body.confirmations?.safety_checklist_confirmed !== true) {
    throw new AppError(400, "CONFIRMATION_REQUIRED", "Both diet_confirmed and safety_checklist_confirmed must be true");
  }
  if (body.meal_count < 1) throw new AppError(400, "VALIDATION_ERROR", "meal_count must be at least 1");
  const safe = Date.parse(body.safe_until);
  if (safe <= nowMs()) throw new AppError(400, "VALIDATION_ERROR", "safe_until is in the past");
  if (safe <= Date.parse(body.cooked_at)) throw new AppError(400, "VALIDATION_ERROR", "safe_until must be after cooked_at");
  const restaurant = getRestaurant(body.restaurant_id);
  if (!restaurant) throw new AppError(404, "NOT_FOUND", `Restaurant ${body.restaurant_id} not found`);

  const row: OfferRow = {
    id: newId("o"), restaurant_id: body.restaurant_id, items_json: JSON.stringify(body.items),
    meal_count: body.meal_count, meals_assigned: 0, meals_collected: 0, diet: body.diet,
    cooked_at: new Date(body.cooked_at).toISOString(), safe_until: new Date(safe).toISOString(),
    photo_url: body.photo_url, raw_transcript: body.raw_transcript, pickup_notes: body.pickup_notes,
    status: "open", fallback_route: null, created_at: nowIso(),
  };
  insertOffer(row);
  const what = body.items.map((i) => i.name).join(", ") || "food";
  const how = via === "voice" ? "Diet and safety checklist confirmed aloud on the voice call." : "Diet and safety checklist confirmed.";
  addEvent(row.id, "offer_created",
    `${restaurant.name} listed ${body.meal_count} ${body.diet === "veg" ? "veg" : "non-veg"} meals (${what}), safe until ${fmtTime(row.safe_until)}. ${how}`);
  // OfferDetail has no guardrail field, so the timeline event carries the full explanation.
  if (guardrail?.needs_confirmation) {
    const safety = guardrail.safety_concern_probability;
    const confirmed = safety != null && safety > 0.3 ? "the diet and the safety checklist" : "the diet";
    const reasons = guardrail.reasons.length ? guardrail.reasons.join("; ") : "automatic check asked for confirmation";
    addEvent(row.id, "guardrail_flag", `Intake check (${guardrail.source}): ${reasons}. The restaurant confirmed ${confirmed}.`);
  }
  addEvent(row.id, "matching_started", "Matching started: only recipients who already need this food, ranked by reliability.");
  runMatching(row.id);
  return row.id;
}

/** Validates, inserts and re-runs matching for offers still looking. */
export function createDemand(input: z.infer<typeof CreateDemandBody>): DemandRow {
  if (!getRecipient(input.recipient_id)) throw new AppError(404, "NOT_FOUND", `Recipient ${input.recipient_id} not found`);
  if (Date.parse(input.needed_by) <= nowMs()) throw new AppError(400, "VALIDATION_ERROR", "needed_by is in the past");
  const row = insertDemand({ ...input, needed_by: new Date(input.needed_by).toISOString() });
  for (const o of listOfferRowsByStatus("open", "matching")) runMatching(o.id);
  return row;
}
