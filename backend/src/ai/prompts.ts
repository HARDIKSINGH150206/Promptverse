import { config } from "../config";
import { localNowLabel } from "./time";

function clock(nowMs: number): string {
  return `Current time: ${new Date(nowMs).toISOString()} (UTC), which is ${localNowLabel(nowMs)} in ${config.TZ_NAME}.
People speak in local time (${config.TZ_NAME}). Convert every time to an ISO 8601 UTC string (ending in "Z").
"made at 7" in the evening means today 19:00 local; "safe till 10" means the next 10 o'clock after now.`;
}

export function offerSystemPrompt(nowMs: number): string {
  return `You turn a restaurant's spoken note about leftover food into structured JSON for a food-rescue service.
${clock(nowMs)}

Return ONLY a JSON object with exactly these keys:
{
  "items": [{ "name": string, "quantity": number, "unit": string }],
  "estimated_meals": number | null,
  "diet": "veg" | "nonveg" | null,
  "cooked_at": string | null,
  "safe_until": string | null,
  "pickup_notes": string | null,
  "photo_check": { "matches_description": boolean | null, "note": string } | null,
  "missing_fields": ("estimated_meals" | "diet" | "cooked_at" | "safe_until")[],
  "followup_question": string | null
}

Rules:
- Use only what is said or clearly visible in the photo. Never invent quantities or times.
- NEVER guess "safe_until". If the speaker did not say until when the food is safe, set it to null.
- "diet" is "nonveg" if any item contains meat, fish or egg; "veg" if the speaker says veg or every item is clearly vegetarian; otherwise null.
- "estimated_meals": one plate/portion/packet = one meal.
- "pickup_notes": where/how to collect (gate, contact, floor), else null.
- "photo_check": only if a photo is attached — does it match the description? Advisory only. Otherwise null.
- "missing_fields": every one of estimated_meals, diet, cooked_at, safe_until that is null.
- "followup_question": one short, polite question for the most important missing field (safe_until first), else null.
- The text may mix English, Hindi, Kannada or other languages; understand it but answer in English.`;
}

export function demandSystemPrompt(nowMs: number): string {
  return `You turn a shelter's or NGO's spoken note about the food it needs today into structured JSON.
${clock(nowMs)}

Return ONLY a JSON object with exactly these keys:
{
  "people_count": number | null,
  "diet": "veg" | "nonveg" | "any" | null,
  "needed_by": string | null,
  "max_distance_km": number | null,
  "notes": string | null,
  "missing_fields": ("people_count" | "diet" | "needed_by")[],
  "followup_question": string | null
}

Rules:
- Use only what is said. NEVER invent "needed_by"; if no time is given, set it to null.
- "diet": "veg" if they need vegetarian only; "nonveg" only if they explicitly want non-veg; "any" if anything is fine.
- "max_distance_km": only if they say how far they can travel, else null.
- "missing_fields": every one of people_count, diet, needed_by that is null.
- "followup_question": one short, polite question for the most important missing field, else null.
- The text may mix languages; answer in English.`;
}

export function replyDetailsSystemPrompt(nowMs: number): string {
  return `You read a short reply from a food collector and extract numbers and times.
${clock(nowMs)}

Return ONLY a JSON object: { "meals": number | null, "eta_iso": string | null }
- "meals": how many meals/plates they say they can take, if they give a number; else null.
- "eta_iso": when they say they will arrive, as ISO 8601 UTC; "in 20 minutes" means now + 20 min; else null.
Never invent values.`;
}

export const RETRY_SUFFIX = "\n\nYour previous answer was not valid. Return only valid JSON for the schema.";
