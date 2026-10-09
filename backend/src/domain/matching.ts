import { config } from "../config";
import {
  addEvent, adjustDemandMatched, getOfferRow, getRestaurant, hasEvent, insertAssignment, listAssignmentRows,
  listDemandRows, listRecipientRows,
} from "../db/repo";
import { tx } from "../db/db";
import { posterior, posteriorMean, rng, sampleBeta } from "./bayes";
import { addSecs, minutesBetween, nowIso, nowMs } from "./clock";
import { applyFallback } from "./fallback";
import { fmtDuration, pct } from "./format";
import { distanceKm, etaMins, round1 } from "./geo";
import { newId } from "./ids";
import { notify } from "./notify";
import { isTerminalOffer, refreshOffer, remainingMeals } from "./offerState";
import { failures, historyPhrase, proximity, rankScore, responsiveness } from "./reliability";
import type { AssignmentRow, DemandRow, OfferRow, RecipientRow, SelectionInfo } from "./types";

export interface Candidate {
  demand: DemandRow;
  recipient: RecipientRow;
  distance_km: number;
  p_mean: number;
  proximity: number;
  responsiveness: number;
  mean_score: number;
  capacity: number;
}

export function dietCompatible(offerDiet: "veg" | "nonveg", demandDiet: DemandRow["diet"]): boolean {
  return demandDiet === "any" || demandDiet === offerDiet;
}

/** Every demand that could safely take food from this offer right now, best (by mean) first. */
export function eligibleCandidates(offer: OfferRow, excluded: Set<string>, atMs = nowMs()): Candidate[] {
  const restaurant = getRestaurant(offer.restaurant_id);
  if (!restaurant) return [];
  const recipients = new Map(listRecipientRows().map((r) => [r.id, r]));
  const safeUntil = Date.parse(offer.safe_until);
  const out: Candidate[] = [];

  for (const d of listDemandRows()) {
    if (d.status !== "open" && d.status !== "partially_matched") continue;
    if (excluded.has(d.recipient_id)) continue;
    if (!dietCompatible(offer.diet, d.diet)) continue;
    const r = recipients.get(d.recipient_id);
    if (!r) continue;
    const km = distanceKm(restaurant.lat, restaurant.lng, r.lat, r.lng);
    if (km > d.max_distance_km) continue;
    const arriveMs = atMs + etaMins(km) * 60000;
    if (arriveMs + config.PICKUP_BUFFER_MINS * 60000 > safeUntil) continue;
    if (arriveMs > Date.parse(d.needed_by)) continue;
    const capacity = d.people_count - d.meals_matched;
    if (capacity <= 0) continue;

    const p = posteriorMean(r.completed, failures(r));
    const prox = proximity(km, d.max_distance_km);
    const resp = responsiveness(r.avg_response_secs);
    out.push({
      demand: d, recipient: r, distance_km: round1(km), p_mean: p, proximity: prox, responsiveness: resp,
      mean_score: rankScore(p, prox, resp), capacity,
    });
  }
  // a recipient may have several demands; keep only their best one
  const best = new Map<string, Candidate>();
  for (const c of out) {
    const prev = best.get(c.recipient.id);
    if (!prev || c.mean_score > prev.mean_score) best.set(c.recipient.id, c);
  }
  return [...best.values()].sort((x, y) => y.mean_score - x.mean_score || x.distance_km - y.distance_km);
}

/** Recipients excluded from new primary offers: anyone already on this offer, except released standbys. */
export function matchingExclusions(rows: AssignmentRow[]): Set<string> {
  return new Set(rows.filter((a) => !(a.is_standby && a.status === "released")).map((a) => a.recipient_id));
}

function minutesLeft(offer: OfferRow): number {
  return minutesBetween(nowMs(), offer.safe_until);
}

/** The earliest any collector could possibly arrive leaves no safe margin. */
export function tooLateForAnyone(offer: OfferRow): boolean {
  return nowMs() + (etaMins(0) + config.PICKUP_BUFFER_MINS) * 60000 >= Date.parse(offer.safe_until);
}

export function runMatching(offerId: string): void {
  tx(() => runMatchingInner(offerId));
}

function runMatchingInner(offerId: string): void {
  const offer = getOfferRow(offerId);
  if (!offer || isTerminalOffer(offer.status) || offer.fallback_route) return;
  let remaining = remainingMeals(offerId);
  if (remaining <= 0) {
    refreshOffer(offerId);
    return;
  }

  const rows = listAssignmentRows(offerId);
  const candidates = eligibleCandidates(offer, matchingExclusions(rows));
  const left = minutesLeft(offer);

  if (candidates.length === 0) {
    if (tooLateForAnyone(offer)) {
      applyFallback(offer, remaining);
    } else if (!hasEvent(offerId, "note", "Waiting for a matching demand")) {
      addEvent(offerId, "note", `Waiting for a matching demand — ${fmtDuration(left)} left.`);
    }
    refreshOffer(offerId);
    return;
  }

  const useThompson = config.THOMPSON_SAMPLING === "on" && left >= config.EXPLORE_MIN_SLACK_MINS;
  const r = rng();
  const ranked = candidates
    .map((c) => {
      const { a, b } = posterior(c.recipient.completed, failures(c.recipient));
      const sampled = useThompson ? sampleBeta(a, b, r) : null;
      const p = sampled ?? c.p_mean;
      return { ...c, sampled, rank: rankScore(p, c.proximity, c.responsiveness) };
    })
    .sort((x, y) => y.rank - x.rank || x.distance_km - y.distance_km);

  let created = 0;
  for (let i = 0; i < ranked.length && remaining > 0; i++) {
    const c = ranked[i];
    const meals = Math.min(remaining, c.capacity);
    const explored = useThompson && ranked.slice(i + 1).some((o) => o.mean_score > c.mean_score);
    const history = historyPhrase(c.recipient);
    const reason = useThompson
      ? `Ranked #${i + 1} by Thompson sampling (drew ${pct(c.sampled!)} from ${history}; mean ${pct(c.p_mean)}), ${c.distance_km} km away.`
      : `Ranked #${i + 1} by reliability: ${history} (${pct(c.p_mean)}), ${c.distance_km} km away.`;
    const selection: SelectionInfo = {
      method: useThompson ? "thompson" : "mean",
      sampled_p_complete: c.sampled === null ? null : Math.round(c.sampled * 1000) / 1000,
      explored,
      reason,
    };
    const now = nowIso();
    const a: AssignmentRow = {
      id: newId("a"), offer_id: offerId, recipient_id: c.recipient.id, demand_id: c.demand.id,
      meals, status: "offered", reliability_at_assignment: Math.round(c.p_mean * 1000) / 1000,
      selection_json: JSON.stringify(selection), distance_km: c.distance_km,
      offered_at: now, respond_by: addSecs(now, config.ACCEPT_TIMEOUT_SECS),
      accepted_at: null, reconfirm_by: null, collected_at: null, eta_promised: null, p_fail: null,
      is_standby: 0, standby_for_assignment_id: null, last_reply_json: null, was_rematched: 0,
    };
    insertAssignment(a);
    adjustDemandMatched(c.demand.id, meals);
    remaining -= meals;
    created++;
    addEvent(offerId, "offered", `Offered ${meals} meals to ${c.recipient.name} — ${reason}`, a.id);
    if (explored) {
      const what = failures(c.recipient) + c.recipient.completed === 0 ? "no history yet" : `only ${history}`;
      addEvent(
        offerId, "exploration",
        `Exploration: offered to ${c.recipient.name} (${what}) to learn its reliability — ${fmtDuration(left)} of slack.`,
        a.id
      );
    }
    notify({ kind: "offer", assignmentId: a.id });
  }

  if (created > 1) {
    const parts = listAssignmentRows(offerId)
      .filter((a) => a.status === "offered")
      .slice(-created)
      .map((a) => `${a.meals}`);
    addEvent(offerId, "split", `Split across ${created} recipients (${parts.join(" + ")} meals).`);
  }
  if (remaining > 0 && !hasEvent(offerId, "note", "Waiting for a matching demand")) {
    addEvent(offerId, "note", `Waiting for a matching demand — ${remaining} meals unassigned, ${fmtDuration(left)} left.`);
  }
  refreshOffer(offerId);
}
