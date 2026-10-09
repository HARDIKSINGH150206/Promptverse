import {
  addEvent, getDemandRow, getRecipient, getOfferRow, listAssignmentRows, setDemandStatus, updateAssignment, updateOffer,
} from "../db/repo";
import { db } from "../db/db";
import { notify } from "./notify";
import type { AssignmentRow, AssignmentStatus } from "./types";

export const PRIMARY_LIVE: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed", "collected"];
export const PRIMARY_ACTIVE: AssignmentStatus[] = ["accepted", "reconfirm_sent", "confirmed"];
export const PRIMARY_OPEN: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed"];
export const STANDBY_LIVE: AssignmentStatus[] = ["standby_requested", "on_standby"];

export const TERMINAL_OFFER = ["collected", "partially_collected", "fallback", "expired"] as const;

export function isTerminalOffer(status: string): boolean {
  return (TERMINAL_OFFER as readonly string[]).includes(status);
}

/** Meals not yet held by any live primary assignment. */
export function remainingMeals(offerId: string): number {
  const o = getOfferRow(offerId);
  if (!o) return 0;
  const held = listAssignmentRows(offerId)
    .filter((a) => PRIMARY_LIVE.includes(a.status))
    .reduce((s, a) => s + a.meals, 0);
  return o.meal_count - held;
}

export function standbysFor(primaryId: string, rows: AssignmentRow[]): AssignmentRow[] {
  return rows.filter((a) => a.standby_for_assignment_id === primaryId && STANDBY_LIVE.includes(a.status));
}

export function releaseStandby(a: AssignmentRow, why: string): void {
  updateAssignment(a.id, { status: "released" });
  addEvent(a.offer_id, "standby_released", why, a.id);
  notify({ kind: "released", assignmentId: a.id });
}

/** Recompute meals_assigned and the offer status after any change. */
export function refreshOffer(offerId: string): void {
  const o = getOfferRow(offerId);
  if (!o || isTerminalOffer(o.status)) return;
  const rows = listAssignmentRows(offerId);
  const live = rows.filter((a) => PRIMARY_LIVE.includes(a.status));
  const assigned = live.reduce((s, a) => s + a.meals, 0);
  const committed = rows
    .filter((a) => [...PRIMARY_ACTIVE, "collected"].includes(a.status))
    .reduce((s, a) => s + a.meals, 0);
  const openCount = rows.filter((a) => PRIMARY_OPEN.includes(a.status)).length;

  let status = o.status;
  if (openCount === 0 && o.meals_collected >= o.meal_count) status = "collected";
  else if (openCount === 0 && o.fallback_route) status = o.meals_collected > 0 ? "partially_collected" : "fallback";
  else if (committed >= o.meal_count) status = "assigned";
  else status = "matching";

  updateOffer(offerId, { meals_assigned: assigned, status });

  if (isTerminalOffer(status)) {
    for (const s of rows.filter((a) => STANDBY_LIVE.includes(a.status))) {
      releaseStandby(s, `${getRecipient(s.recipient_id)?.name ?? "Backup"} released from standby — offer is finished.`);
    }
    // close out demands that got everything they were matched
    for (const demandId of new Set(rows.map((a) => a.demand_id))) maybeFulfilDemand(demandId);
  }
}

export function maybeFulfilDemand(demandId: string): void {
  const d = getDemandRow(demandId);
  if (!d || d.status === "fulfilled" || d.status === "expired") return;
  const open = db
    .prepare(`SELECT COUNT(*) AS n FROM assignments WHERE demand_id = ? AND status IN (${PRIMARY_OPEN.map(() => "?").join(",")})`)
    .get(demandId, ...PRIMARY_OPEN) as { n: number };
  if (open.n === 0 && d.meals_matched >= d.people_count) setDemandStatus(demandId, "fulfilled");
}
