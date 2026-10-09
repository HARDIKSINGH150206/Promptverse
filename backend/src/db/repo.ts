import { db } from "./db";
import { newId } from "../domain/ids";
import { nowIso } from "../domain/clock";
import { bus } from "../realtime/bus";
import type {
  Assignment, AssignmentRow, AssignmentStatus, Demand, DemandRow, EventRow, Offer, OfferRow,
  RecipientRow, RestaurantRow, SelectionInfo, TimelineEvent, TimelineEventType,
} from "../domain/types";

// ---- restaurants ----
export function getRestaurant(id: string): RestaurantRow | undefined {
  return db.prepare("SELECT * FROM restaurants WHERE id = ?").get(id) as RestaurantRow | undefined;
}
export function listRestaurants(): RestaurantRow[] {
  return db.prepare("SELECT * FROM restaurants ORDER BY name").all() as RestaurantRow[];
}

// ---- recipients ----
export function getRecipient(id: string): RecipientRow | undefined {
  return db.prepare("SELECT * FROM recipients WHERE id = ?").get(id) as RecipientRow | undefined;
}
export function listRecipientRows(): RecipientRow[] {
  return db.prepare("SELECT * FROM recipients ORDER BY name").all() as RecipientRow[];
}
export function getRecipientByChat(chatId: string): RecipientRow | undefined {
  return db.prepare("SELECT * FROM recipients WHERE telegram_chat_id = ?").get(chatId) as RecipientRow | undefined;
}
export function getRecipientByLinkCode(code: string): RecipientRow | undefined {
  return db.prepare("SELECT * FROM recipients WHERE upper(link_code) = upper(?)").get(code) as RecipientRow | undefined;
}
export function linkTelegram(recipientId: string, chatId: string): void {
  db.prepare("UPDATE recipients SET telegram_chat_id = NULL WHERE telegram_chat_id = ?").run(chatId);
  db.prepare("UPDATE recipients SET telegram_chat_id = ? WHERE id = ?").run(chatId, recipientId);
}
export function setRecipientLanguage(id: string, language: string): void {
  db.prepare("UPDATE recipients SET language = ? WHERE id = ?").run(language, id);
}
export function bumpRecipientStat(id: string, field: "completed" | "cancelled" | "no_show"): void {
  db.prepare(`UPDATE recipients SET ${field} = ${field} + 1 WHERE id = ?`).run(id);
}
export function recordResponseTime(id: string, secs: number): void {
  // exponential moving average, so one fast reply doesn't erase history
  db.prepare("UPDATE recipients SET avg_response_secs = avg_response_secs * 0.8 + ? * 0.2 WHERE id = ?").run(secs, id);
}

// ---- demands ----
export function getDemandRow(id: string): DemandRow | undefined {
  return db.prepare("SELECT * FROM demands WHERE id = ?").get(id) as DemandRow | undefined;
}
export function listDemandRows(): DemandRow[] {
  return db.prepare("SELECT * FROM demands ORDER BY created_at DESC").all() as DemandRow[];
}
export function insertDemand(d: Omit<DemandRow, "id" | "created_at" | "meals_matched" | "status">): DemandRow {
  const row: DemandRow = { ...d, id: newId("d"), meals_matched: 0, status: "open", created_at: nowIso() };
  db.prepare(
    `INSERT INTO demands (id, recipient_id, people_count, meals_matched, diet, needed_by, max_distance_km, notes, status, raw_transcript, created_at)
     VALUES (@id, @recipient_id, @people_count, @meals_matched, @diet, @needed_by, @max_distance_km, @notes, @status, @raw_transcript, @created_at)`
  ).run(row);
  bus.emitBus("board_changed");
  return row;
}
/** Adjust meals_matched by delta and recompute demand status. */
export function adjustDemandMatched(id: string, delta: number): void {
  const d = getDemandRow(id);
  if (!d) return;
  const matched = Math.max(0, Math.min(d.people_count, d.meals_matched + delta));
  let status = d.status;
  if (status !== "fulfilled" && status !== "expired") {
    status = matched <= 0 ? "open" : matched >= d.people_count ? "matched" : "partially_matched";
  }
  db.prepare("UPDATE demands SET meals_matched = ?, status = ? WHERE id = ?").run(matched, status, id);
  bus.emitBus("board_changed");
}
export function setDemandStatus(id: string, status: DemandRow["status"]): void {
  db.prepare("UPDATE demands SET status = ? WHERE id = ?").run(status, id);
}
export function toDemand(d: DemandRow): Demand {
  const r = getRecipient(d.recipient_id);
  return {
    id: d.id, recipient_id: d.recipient_id, recipient_name: r?.name ?? "Unknown",
    people_count: d.people_count, meals_matched: d.meals_matched, diet: d.diet,
    needed_by: d.needed_by, max_distance_km: d.max_distance_km, notes: d.notes,
    status: d.status, raw_transcript: d.raw_transcript, created_at: d.created_at,
  };
}

// ---- offers ----
export function getOfferRow(id: string): OfferRow | undefined {
  return db.prepare("SELECT * FROM offers WHERE id = ?").get(id) as OfferRow | undefined;
}
export function listOfferRows(): OfferRow[] {
  return db.prepare("SELECT * FROM offers ORDER BY created_at DESC").all() as OfferRow[];
}
export function listOfferRowsByStatus(...statuses: OfferRow["status"][]): OfferRow[] {
  const q = statuses.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM offers WHERE status IN (${q}) ORDER BY created_at`).all(...statuses) as OfferRow[];
}
export function insertOffer(o: OfferRow): void {
  db.prepare(
    `INSERT INTO offers (id, restaurant_id, items_json, meal_count, meals_assigned, meals_collected, diet, cooked_at, safe_until, photo_url, raw_transcript, pickup_notes, status, fallback_route, created_at)
     VALUES (@id, @restaurant_id, @items_json, @meal_count, @meals_assigned, @meals_collected, @diet, @cooked_at, @safe_until, @photo_url, @raw_transcript, @pickup_notes, @status, @fallback_route, @created_at)`
  ).run(o);
  bus.emitBus("offer_changed", o.id);
}
export function updateOffer(id: string, patch: Partial<OfferRow>): void {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db.prepare(`UPDATE offers SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...patch, id });
  bus.emitBus("offer_changed", id);
}
export function toOffer(o: OfferRow): Offer {
  const r = getRestaurant(o.restaurant_id);
  return {
    id: o.id, restaurant_id: o.restaurant_id, restaurant_name: r?.name ?? "Unknown",
    items: JSON.parse(o.items_json), meal_count: o.meal_count, meals_assigned: o.meals_assigned,
    meals_collected: o.meals_collected, diet: o.diet, cooked_at: o.cooked_at, safe_until: o.safe_until,
    photo_url: o.photo_url, raw_transcript: o.raw_transcript, pickup_notes: o.pickup_notes,
    status: o.status, fallback_route: o.fallback_route, created_at: o.created_at,
  };
}

// ---- assignments ----
export function getAssignmentRow(id: string): AssignmentRow | undefined {
  return db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as AssignmentRow | undefined;
}
export function listAssignmentRows(offerId: string): AssignmentRow[] {
  return db.prepare("SELECT * FROM assignments WHERE offer_id = ? ORDER BY offered_at, rowid").all(offerId) as AssignmentRow[];
}
export function listAssignmentsByStatus(...statuses: AssignmentStatus[]): AssignmentRow[] {
  const q = statuses.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM assignments WHERE status IN (${q}) ORDER BY offered_at, rowid`).all(...statuses) as AssignmentRow[];
}
export function listAssignmentsForRecipient(recipientId: string, statuses: AssignmentStatus[]): AssignmentRow[] {
  const q = statuses.map(() => "?").join(",");
  return db
    .prepare(`SELECT * FROM assignments WHERE recipient_id = ? AND status IN (${q}) ORDER BY offered_at DESC, rowid DESC`)
    .all(recipientId, ...statuses) as AssignmentRow[];
}
export function insertAssignment(a: AssignmentRow): void {
  db.prepare(
    `INSERT INTO assignments (id, offer_id, recipient_id, demand_id, meals, status, reliability_at_assignment, selection_json, distance_km, offered_at, respond_by, accepted_at, reconfirm_by, collected_at, eta_promised, p_fail, is_standby, standby_for_assignment_id, last_reply_json, was_rematched)
     VALUES (@id, @offer_id, @recipient_id, @demand_id, @meals, @status, @reliability_at_assignment, @selection_json, @distance_km, @offered_at, @respond_by, @accepted_at, @reconfirm_by, @collected_at, @eta_promised, @p_fail, @is_standby, @standby_for_assignment_id, @last_reply_json, @was_rematched)`
  ).run(a);
  bus.emitBus("offer_changed", a.offer_id);
}
export function updateAssignment(id: string, patch: Partial<AssignmentRow>): void {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  db.prepare(`UPDATE assignments SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run({ ...patch, id });
  const offerId = (db.prepare("SELECT offer_id FROM assignments WHERE id = ?").get(id) as { offer_id: string } | undefined)?.offer_id;
  if (offerId) bus.emitBus("offer_changed", offerId);
}
export function toAssignment(a: AssignmentRow): Assignment {
  const r = getRecipient(a.recipient_id);
  return {
    id: a.id, offer_id: a.offer_id, recipient_id: a.recipient_id, recipient_name: r?.name ?? "Unknown",
    demand_id: a.demand_id, meals: a.meals, status: a.status,
    reliability_at_assignment: a.reliability_at_assignment,
    selection: JSON.parse(a.selection_json) as SelectionInfo,
    distance_km: a.distance_km, offered_at: a.offered_at, respond_by: a.respond_by,
    accepted_at: a.accepted_at, reconfirm_by: a.reconfirm_by, collected_at: a.collected_at,
    eta_promised: a.eta_promised, p_fail: a.p_fail, is_standby: !!a.is_standby,
    standby_for_assignment_id: a.standby_for_assignment_id,
    last_reply: a.last_reply_json ? JSON.parse(a.last_reply_json) : null,
  };
}

// ---- events ----
export function addEvent(offerId: string, type: TimelineEventType, message: string, assignmentId: string | null = null): EventRow {
  const row: EventRow = { id: newId("e"), offer_id: offerId, at: nowIso(), type, message, assignment_id: assignmentId };
  db.prepare("INSERT INTO events (id, offer_id, at, type, message, assignment_id) VALUES (@id, @offer_id, @at, @type, @message, @assignment_id)").run(row);
  bus.emitBus("timeline", row);
  bus.emitBus("offer_changed", offerId);
  return row;
}
export function listEvents(offerId: string): TimelineEvent[] {
  return db.prepare("SELECT * FROM events WHERE offer_id = ? ORDER BY at, rowid").all(offerId) as TimelineEvent[];
}
export function hasEvent(offerId: string, type: TimelineEventType, contains?: string): boolean {
  const rows = db.prepare("SELECT message FROM events WHERE offer_id = ? AND type = ?").all(offerId, type) as { message: string }[];
  return rows.some((r) => (contains ? r.message.includes(contains) : true));
}
export function countEvents(type: TimelineEventType, where = "1=1"): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM events WHERE type = ? AND ${where}`).get(type) as { n: number }).n;
}
