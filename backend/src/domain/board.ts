import { db } from "../db/db";
import {
  countEvents, getRestaurant, listAssignmentRows, listDemandRows, listOfferRows, listRecipientRows, toDemand, toOffer,
} from "../db/repo";
import { layaStatus, llmStatus } from "../ai/status";
import { nowIso } from "./clock";
import { distanceKm } from "./geo";
import { reliabilityScore } from "./reliability";
import type { Board, BoardStats, OfferRow, Recipient, RecipientRow, RestaurantRow } from "./types";

export function toRecipient(r: RecipientRow, ref: RestaurantRow | null, maxKm = 5): Recipient {
  const km = ref ? distanceKm(ref.lat, ref.lng, r.lat, r.lng) : null;
  return {
    id: r.id, name: r.name, type: r.type, area: r.area, lat: r.lat, lng: r.lng,
    telegram_linked: !!r.telegram_chat_id, link_code: r.link_code,
    stats: { completed: r.completed, cancelled: r.cancelled, no_show: r.no_show, avg_response_secs: Math.round(r.avg_response_secs) },
    reliability: reliabilityScore(r, km, maxKm),
  };
}

/** Proximity on the board is measured from the most recent open offer's restaurant (else 0.5). */
export function boardReferenceRestaurant(): RestaurantRow | null {
  const open = listOfferRows().find((o) => o.status === "open" || o.status === "matching" || o.status === "assigned");
  return open ? getRestaurant(open.restaurant_id) ?? null : null;
}

export function listRecipients(): Recipient[] {
  const ref = boardReferenceRestaurant();
  return listRecipientRows().map((r) => toRecipient(r, ref));
}

const RESOLVED = new Set(["collected", "partially_collected", "fallback", "expired"]);

export function collectedWithinWindow(o: OfferRow): boolean {
  if (o.status !== "collected") return false;
  const safe = Date.parse(o.safe_until);
  const collectedRows = listAssignmentRows(o.id).filter((a) => a.status === "collected");
  return collectedRows.length > 0 && collectedRows.every((a) => a.collected_at && Date.parse(a.collected_at) <= safe);
}

export function computeStats(offers: OfferRow[]): BoardStats {
  const resolved = offers.filter((o) => RESOLVED.has(o.status));
  const within = offers.filter(collectedWithinWindow).length;
  const ids = offers.map((o) => o.id);
  const inOffers = ids.length ? `offer_id IN (${ids.map((i) => `'${i}'`).join(",")})` : "0";
  const dropouts = ids.length
    ? (db.prepare(`SELECT COUNT(*) AS n FROM assignments WHERE was_rematched = 1 AND ${inOffers}`).get() as { n: number }).n
    : 0;
  return {
    offers_total: offers.length,
    offers_collected_within_window: within,
    // denominator = offers that have finished; in-flight offers don't drag the metric down
    share_collected_within_window: resolved.length ? Math.round((within / resolved.length) * 1000) / 1000 : 0,
    meals_rescued: offers.reduce((s, o) => s + o.meals_collected, 0),
    dropouts_caught: dropouts,
    backups_promoted: ids.length ? countEvents("standby_promoted", inOffers) : 0,
    replies_understood: ids.length ? countEvents("reply_understood", `${inOffers} AND message NOT LIKE '%No change%'`) : 0,
    fallback_count: offers.filter((o) => o.fallback_route).length,
    is_simulated: true,
  };
}

export function board(): Board {
  const offers = listOfferRows();
  return {
    offers: offers.map(toOffer),
    demands: listDemandRows().map(toDemand),
    recipients: listRecipients(),
    stats: computeStats(offers),
    server_time: nowIso(),
    ai_status: { llm: llmStatus(), laya: layaStatus() },
  };
}
