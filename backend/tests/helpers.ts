import { addEvent, getOfferRow, getRecipient, insertOffer, listAssignmentRows } from "../src/db/repo";
import { seed } from "../src/db/seed";
import { addSecs, nowIso, nowMs } from "../src/domain/clock";
import { newId } from "../src/domain/ids";
import { runMatching } from "../src/domain/matching";

export function reset(): void {
  seed();
}

export function makeOffer(meals: number, diet: "veg" | "nonveg", safeMins = 75): string {
  const id = newId("o");
  insertOffer({
    id, restaurant_id: "r_koramangala", items_json: JSON.stringify([{ name: "Test food", quantity: meals, unit: "plates" }]),
    meal_count: meals, meals_assigned: 0, meals_collected: 0, diet,
    cooked_at: addSecs(nowMs(), -1800), safe_until: addSecs(nowMs(), safeMins * 60),
    photo_url: null, raw_transcript: null, pickup_notes: null, status: "open", fallback_route: null, created_at: nowIso(),
  });
  addEvent(id, "offer_created", "test");
  runMatching(id);
  return id;
}

export function assignmentsOf(offerId: string) {
  return listAssignmentRows(offerId).map((a) => ({ ...a, name: getRecipient(a.recipient_id)!.name }));
}

export function byName(offerId: string, name: string, statuses?: string[]) {
  return assignmentsOf(offerId).find((a) => a.name === name && (!statuses || statuses.includes(a.status)));
}

export const offer = (id: string) => getOfferRow(id)!;
