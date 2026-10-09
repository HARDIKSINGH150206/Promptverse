// In-browser mock backend. Implements the same status rules as API_CONTRACT.md §5 and the backend engine
// (matching, Bayesian reliability, Thompson sampling, risk, standby promotion, reply table, timeouts), so the
// whole demo runs with no server. State lives in localStorage so several tabs (board, inbox) share one world.
// Keep this file permanently: it is the stage fallback if the backend dies.
import { fmtDuration, fmtTime, pct } from "../time";
import { mockGuardrail, mockParseDemand, mockParseOffer, mockUnderstand } from "./mockAi";
import {
  CONFIG, MOCK_STATE_VERSION, interval90, posteriorMean, rngFrom, sampleBeta, seedState,
  type AssignmentRow, type DemandRow, type MockState, type OfferRow, type RecipientRow,
} from "./mockData";
import {
  ApiError,
  type Api, type Assignment, type AssignmentAction, type AssignmentStatus, type Board, type BoardStats, type Demand,
  type FallbackRoute, type ImpactCard, type IntakeGuardrail, type Offer, type OfferDetail, type Recipient,
  type ReliabilityScore, type ReplyUnderstanding, type Restaurant, type SelectionInfo, type TimelineEvent,
  type TimelineEventType,
} from "./types";

const STORAGE_KEY = "annarelay.mock.state";

const PRIMARY_LIVE: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed", "collected"];
const PRIMARY_ACTIVE: AssignmentStatus[] = ["accepted", "reconfirm_sent", "confirmed"];
const PRIMARY_OPEN: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed"];
const STANDBY_LIVE: AssignmentStatus[] = ["standby_requested", "on_standby"];
const REPLYABLE: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed", "standby_requested", "on_standby"];
const TERMINAL_OFFER = ["collected", "partially_collected", "fallback", "expired"];
const W_P = 0.6;
const W_PROX = 0.25;
const W_RESP = 0.15;

// ---------- persistence ----------

let memory: MockState | null = null;

function load(): MockState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as MockState;
      if (s.version === MOCK_STATE_VERSION) return s;
    }
  } catch {
    // storage blocked: fall through to memory
  }
  if (!memory) memory = seedState();
  return structuredClone(memory);
}

function save(s: MockState): void {
  memory = s;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // memory copy still holds the state
  }
}

/** Run one operation against the store; nothing is saved if it throws. */
function run<T>(fn: (sim: Sim) => T): T {
  const sim = new Sim(load());
  const out = fn(sim);
  save(sim.s);
  return out;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round1 = (x: number) => Math.round(x * 10) / 10;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const etaMins = (km: number) => Math.ceil((km / CONFIG.AVG_SPEED_KMPH) * 60) + 10;
const failures = (r: RecipientRow) => r.cancelled + r.no_show;
const pComplete = (r: RecipientRow) => posteriorMean(r.completed, failures(r));
const proximity = (km: number, max: number) => (max <= 0 ? 0 : Math.max(0, 1 - km / max));
const responsiveness = (secs: number) => Math.min(1, Math.max(0, 1 - secs / 600));
const rankScore = (p: number, prox: number, resp: number) => W_P * p + W_PROX * prox + W_RESP * resp;

function historyPhrase(r: RecipientRow): string {
  const obs = r.completed + failures(r);
  return obs === 0 ? "no pickups yet" : `${r.completed} of ${obs} past pickups completed`;
}

interface Candidate {
  demand: DemandRow; recipient: RecipientRow; distance_km: number; p_mean: number;
  proximity: number; responsiveness: number; mean_score: number; capacity: number;
}

const FALLBACK_LABEL: Record<FallbackRoute, string> = {
  people: "people", animal_feed: "animal feed partner", compost: "compost partner",
};

const INTENT_LABEL: Record<string, string> = {
  accept_full: "accepting all", accept_partial: "accepting some", decline: "declining", cancel: "cancelling",
  still_coming: "still coming", running_late: "running late", question: "a question / unclear",
};

// ---------- the engine ----------

class Sim {
  readonly now = Date.now();
  constructor(public s: MockState) {}

  // ---- lookups ----
  nowIso(): string { return new Date(this.now).toISOString(); }
  addSecs(iso: string, secs: number): string { return new Date(Date.parse(iso) + secs * 1000).toISOString(); }
  newId(prefix: string): string {
    this.s.seq += 1;
    return `${prefix}_m${this.s.seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }
  restaurant(id: string): Restaurant | undefined { return this.s.restaurants.find((r) => r.id === id); }
  recipient(id: string): RecipientRow | undefined { return this.s.recipients.find((r) => r.id === id); }
  demand(id: string): DemandRow | undefined { return this.s.demands.find((d) => d.id === id); }
  offerRow(id: string): OfferRow {
    const o = this.s.offers.find((x) => x.id === id);
    if (!o) throw new ApiError("NOT_FOUND", `Offer ${id} not found`, 404);
    return o;
  }
  assignment(id: string): AssignmentRow {
    const a = this.s.assignments.find((x) => x.id === id);
    if (!a) throw new ApiError("NOT_FOUND", `Assignment ${id} not found`, 404);
    return a;
  }
  rowsFor(offerId: string): AssignmentRow[] { return this.s.assignments.filter((a) => a.offer_id === offerId); }
  name(a: AssignmentRow): string { return this.recipient(a.recipient_id)?.name ?? "Recipient"; }

  addEvent(offerId: string, type: TimelineEventType, message: string, assignmentId: string | null = null): TimelineEvent {
    const ev: TimelineEvent = { id: this.newId("e"), offer_id: offerId, at: this.nowIso(), type, message, assignment_id: assignmentId };
    this.s.events.push(ev);
    return ev;
  }
  hasEvent(offerId: string, type: TimelineEventType, contains?: string): boolean {
    return this.s.events.some((e) => e.offer_id === offerId && e.type === type && (!contains || e.message.includes(contains)));
  }

  adjustDemandMatched(id: string, delta: number): void {
    const d = this.demand(id);
    if (!d) return;
    d.meals_matched = Math.max(0, Math.min(d.people_count, d.meals_matched + delta));
    if (d.status !== "fulfilled" && d.status !== "expired") {
      d.status = d.meals_matched <= 0 ? "open" : d.meals_matched >= d.people_count ? "matched" : "partially_matched";
    }
  }
  recordResponseTime(recipientId: string, secs: number): void {
    const r = this.recipient(recipientId);
    if (r) r.avg_response_secs = r.avg_response_secs * 0.8 + secs * 0.2;
  }
  responseSecs(a: AssignmentRow): number { return Math.max(1, (this.now - Date.parse(a.offered_at)) / 1000); }

  // ---- reliability ----
  reliabilityScore(r: RecipientRow, km: number | null, maxKm = 5): ReliabilityScore {
    const fails = failures(r);
    const obs = r.completed + fails;
    const p = posteriorMean(r.completed, fails);
    const iv = interval90(r.completed, fails);
    const prox = km === null ? 0.5 : proximity(km, maxKm);
    const resp = responsiveness(r.avg_response_secs);
    const head = obs === 0
      ? `No pickups yet (${pct(p)}, could be anywhere from ${pct(iv[0])} to ${pct(iv[1])})`
      : `${r.completed} of ${obs} pickups completed (${pct(p)}, likely ${Math.round(iv[0] * 100)}–${pct(iv[1])})`;
    const parts = [head];
    if (km !== null) parts.push(`${km.toFixed(1)} km away`);
    const secs = r.avg_response_secs;
    parts.push(secs < 90 ? `replies in ~${Math.max(1, Math.round(secs))} s` : `replies in ~${Math.round(secs / 60)} min`);
    return {
      p_complete: round3(p), interval_90: [round3(iv[0]), round3(iv[1])], observations: obs,
      proximity: round3(prox), responsiveness: round3(resp), total: round3(rankScore(p, prox, resp)),
      explanation: parts.join(", "), is_simulated_history: true,
    };
  }
  boardReferenceRestaurant(): Restaurant | null {
    const open = this.sortedOffers().find((o) => o.status === "open" || o.status === "matching" || o.status === "assigned");
    return open ? this.restaurant(open.restaurant_id) ?? null : null;
  }
  toRecipient(r: RecipientRow, ref: Restaurant | null): Recipient {
    const km = ref ? distanceKm(ref.lat, ref.lng, r.lat, r.lng) : null;
    return {
      id: r.id, name: r.name, type: r.type, area: r.area, lat: r.lat, lng: r.lng,
      telegram_linked: r.telegram_linked, link_code: r.link_code,
      stats: { completed: r.completed, cancelled: r.cancelled, no_show: r.no_show, avg_response_secs: Math.round(r.avg_response_secs) },
      reliability: this.reliabilityScore(r, km),
    };
  }
  listRecipients(): Recipient[] {
    const ref = this.boardReferenceRestaurant();
    return this.s.recipients.map((r) => this.toRecipient(r, ref));
  }

  // ---- views ----
  sortedOffers(): OfferRow[] { return [...this.s.offers].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  toOffer(o: OfferRow): Offer {
    return {
      id: o.id, restaurant_id: o.restaurant_id, restaurant_name: this.restaurant(o.restaurant_id)?.name ?? "Unknown",
      items: o.items.map((i) => ({ ...i })), meal_count: o.meal_count, meals_assigned: o.meals_assigned,
      meals_collected: o.meals_collected, diet: o.diet, cooked_at: o.cooked_at, safe_until: o.safe_until,
      photo_url: o.photo_url, raw_transcript: o.raw_transcript, pickup_notes: o.pickup_notes,
      status: o.status, fallback_route: o.fallback_route, created_at: o.created_at,
    };
  }
  toAssignment(a: AssignmentRow): Assignment {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- internal bookkeeping field, not in the contract
    const { was_rematched, ...rest } = a;
    return { ...rest, recipient_name: this.name(a), selection: { ...a.selection }, last_reply: a.last_reply ? { ...a.last_reply } : null };
  }
  toDemand(d: DemandRow): Demand {
    return { ...d, recipient_name: this.recipient(d.recipient_id)?.name ?? "Unknown" };
  }
  offerDetail(offerId: string): OfferDetail {
    const o = this.offerRow(offerId);
    const rows = this.rowsFor(offerId);
    const active = rows.filter((a) => PRIMARY_ACTIVE.includes(a.status));
    return {
      ...this.toOffer(o),
      assignments: rows.map((a) => this.toAssignment(a)),
      timeline: this.s.events.filter((e) => e.offer_id === offerId).map((e) => ({ ...e })),
      minutes_left: Math.max(0, Math.floor((Date.parse(o.safe_until) - this.now) / 60000)),
      risk: {
        highest_p_fail: active.reduce((m, a) => Math.max(m, a.p_fail ?? 0), 0),
        threshold: CONFIG.RISK_THRESHOLD,
        standby_active: rows.some((a) => STANDBY_LIVE.includes(a.status)),
      },
    };
  }

  collectedWithinWindow(o: OfferRow): boolean {
    if (o.status !== "collected") return false;
    const safe = Date.parse(o.safe_until);
    const got = this.rowsFor(o.id).filter((a) => a.status === "collected");
    return got.length > 0 && got.every((a) => a.collected_at && Date.parse(a.collected_at) <= safe);
  }
  computeStats(offers: OfferRow[]): BoardStats {
    const resolved = offers.filter((o) => TERMINAL_OFFER.includes(o.status));
    const within = offers.filter((o) => this.collectedWithinWindow(o)).length;
    const ids = new Set(offers.map((o) => o.id));
    const evs = this.s.events.filter((e) => ids.has(e.offer_id));
    return {
      offers_total: offers.length,
      offers_collected_within_window: within,
      share_collected_within_window: resolved.length ? Math.round((within / resolved.length) * 1000) / 1000 : 0,
      meals_rescued: offers.reduce((s, o) => s + o.meals_collected, 0),
      dropouts_caught: this.s.assignments.filter((a) => ids.has(a.offer_id) && a.was_rematched).length,
      backups_promoted: evs.filter((e) => e.type === "standby_promoted").length,
      replies_understood: evs.filter((e) => e.type === "reply_understood" && !e.message.includes("No change")).length,
      fallback_count: offers.filter((o) => o.fallback_route).length,
      is_simulated: true,
    };
  }

  // ---- offer state ----
  isTerminal(o: OfferRow): boolean { return TERMINAL_OFFER.includes(o.status); }
  remainingMeals(offerId: string): number {
    const o = this.offerRow(offerId);
    const held = this.rowsFor(offerId).filter((a) => PRIMARY_LIVE.includes(a.status)).reduce((s, a) => s + a.meals, 0);
    return o.meal_count - held;
  }
  standbysFor(primaryId: string): AssignmentRow[] {
    return this.s.assignments.filter((a) => a.standby_for_assignment_id === primaryId && STANDBY_LIVE.includes(a.status));
  }
  releaseStandby(a: AssignmentRow, why: string): void {
    a.status = "released";
    this.addEvent(a.offer_id, "standby_released", why, a.id);
  }
  maybeFulfilDemand(demandId: string): void {
    const d = this.demand(demandId);
    if (!d || d.status === "fulfilled" || d.status === "expired") return;
    const open = this.s.assignments.filter((a) => a.demand_id === demandId && PRIMARY_OPEN.includes(a.status)).length;
    if (open === 0 && d.meals_matched >= d.people_count) d.status = "fulfilled";
  }
  refreshOffer(offerId: string): void {
    const o = this.offerRow(offerId);
    if (this.isTerminal(o)) return;
    const rows = this.rowsFor(offerId);
    const assigned = rows.filter((a) => PRIMARY_LIVE.includes(a.status)).reduce((s, a) => s + a.meals, 0);
    const committed = rows.filter((a) => [...PRIMARY_ACTIVE, "collected"].includes(a.status)).reduce((s, a) => s + a.meals, 0);
    const openCount = rows.filter((a) => PRIMARY_OPEN.includes(a.status)).length;

    let status = o.status;
    if (openCount === 0 && o.meals_collected >= o.meal_count) status = "collected";
    else if (openCount === 0 && o.fallback_route) status = o.meals_collected > 0 ? "partially_collected" : "fallback";
    else if (committed >= o.meal_count) status = "assigned";
    else status = "matching";
    o.meals_assigned = assigned;
    o.status = status;

    if (this.isTerminal(o)) {
      for (const sb of rows.filter((a) => STANDBY_LIVE.includes(a.status))) {
        this.releaseStandby(sb, `${this.name(sb)} released from standby — offer is finished.`);
      }
      for (const demandId of new Set(rows.map((a) => a.demand_id))) this.maybeFulfilDemand(demandId);
    }
  }

  // ---- matching ----
  eligibleCandidates(o: OfferRow, excluded: Set<string>): Candidate[] {
    const restaurant = this.restaurant(o.restaurant_id);
    if (!restaurant) return [];
    const safeUntil = Date.parse(o.safe_until);
    const best = new Map<string, Candidate>();
    for (const d of this.s.demands) {
      if (d.status !== "open" && d.status !== "partially_matched") continue;
      if (excluded.has(d.recipient_id)) continue;
      if (!(d.diet === "any" || d.diet === o.diet)) continue;
      const r = this.recipient(d.recipient_id);
      if (!r) continue;
      const km = distanceKm(restaurant.lat, restaurant.lng, r.lat, r.lng);
      if (km > d.max_distance_km) continue;
      const arrive = this.now + etaMins(km) * 60000;
      if (arrive + CONFIG.PICKUP_BUFFER_MINS * 60000 > safeUntil) continue;
      if (arrive > Date.parse(d.needed_by)) continue;
      const capacity = d.people_count - d.meals_matched;
      if (capacity <= 0) continue;
      const p = pComplete(r);
      const prox = proximity(km, d.max_distance_km);
      const resp = responsiveness(r.avg_response_secs);
      const c: Candidate = {
        demand: d, recipient: r, distance_km: round1(km), p_mean: p, proximity: prox, responsiveness: resp,
        mean_score: rankScore(p, prox, resp), capacity,
      };
      const prev = best.get(r.id);
      if (!prev || c.mean_score > prev.mean_score) best.set(r.id, c);
    }
    return [...best.values()].sort((x, y) => y.mean_score - x.mean_score || x.distance_km - y.distance_km);
  }
  tooLateForAnyone(o: OfferRow): boolean {
    return this.now + (etaMins(0) + CONFIG.PICKUP_BUFFER_MINS) * 60000 >= Date.parse(o.safe_until);
  }
  applyFallback(o: OfferRow, meals: number): void {
    if (o.fallback_route || meals <= 0) return;
    const route = CONFIG.FALLBACK_ORDER[0] ?? "compost";
    o.fallback_route = route;
    this.addEvent(o.id, "fallback",
      `No recipient can reach it before ${fmtTime(o.safe_until)}. ${meals} meals routed to ${FALLBACK_LABEL[route]} (simulated).`);
    this.refreshOffer(o.id);
  }
  runMatching(offerId: string): void {
    const o = this.offerRow(offerId);
    if (this.isTerminal(o) || o.fallback_route) return;
    let remaining = this.remainingMeals(offerId);
    if (remaining <= 0) {
      this.refreshOffer(offerId);
      return;
    }
    const rows = this.rowsFor(offerId);
    const excluded = new Set(rows.filter((a) => !(a.is_standby && a.status === "released")).map((a) => a.recipient_id));
    const candidates = this.eligibleCandidates(o, excluded);
    const left = (Date.parse(o.safe_until) - this.now) / 60000;

    if (candidates.length === 0) {
      if (this.tooLateForAnyone(o)) this.applyFallback(o, remaining);
      else if (!this.hasEvent(offerId, "note", "Waiting for a matching demand")) {
        this.addEvent(offerId, "note", `Waiting for a matching demand — ${fmtDuration(left)} left.`);
      }
      this.refreshOffer(offerId);
      return;
    }

    const useThompson = CONFIG.THOMPSON_SAMPLING && left >= CONFIG.EXPLORE_MIN_SLACK_MINS;
    const rng = rngFrom(this.s);
    const ranked = candidates
      .map((c) => {
        const sampled = useThompson ? sampleBeta(1 + c.recipient.completed, 1 + failures(c.recipient), rng) : null;
        return { ...c, sampled, rank: rankScore(sampled ?? c.p_mean, c.proximity, c.responsiveness) };
      })
      .sort((x, y) => y.rank - x.rank || x.distance_km - y.distance_km);

    const created: AssignmentRow[] = [];
    for (let i = 0; i < ranked.length && remaining > 0; i++) {
      const c = ranked[i];
      const meals = Math.min(remaining, c.capacity);
      const explored = useThompson && ranked.slice(i + 1).some((x) => x.mean_score > c.mean_score);
      const history = historyPhrase(c.recipient);
      const reason = useThompson
        ? `Ranked #${i + 1} by Thompson sampling (drew ${pct(c.sampled!)} from ${history}; mean ${pct(c.p_mean)}), ${c.distance_km} km away.`
        : `Ranked #${i + 1} by reliability: ${history} (${pct(c.p_mean)}), ${c.distance_km} km away.`;
      const selection: SelectionInfo = {
        method: useThompson ? "thompson" : "mean",
        sampled_p_complete: c.sampled === null ? null : round3(c.sampled),
        explored, reason,
      };
      const now = this.nowIso();
      const a: AssignmentRow = {
        id: this.newId("a"), offer_id: offerId, recipient_id: c.recipient.id, demand_id: c.demand.id,
        meals, status: "offered", reliability_at_assignment: round3(c.p_mean), selection, distance_km: c.distance_km,
        offered_at: now, respond_by: this.addSecs(now, CONFIG.ACCEPT_TIMEOUT_SECS),
        accepted_at: null, reconfirm_by: null, collected_at: null, eta_promised: null, p_fail: null,
        is_standby: false, standby_for_assignment_id: null, last_reply: null, was_rematched: false,
      };
      this.s.assignments.push(a);
      created.push(a);
      this.adjustDemandMatched(c.demand.id, meals);
      remaining -= meals;
      this.addEvent(offerId, "offered", `Offered ${meals} meals to ${c.recipient.name} — ${reason}`, a.id);
      if (explored) {
        const what = c.recipient.completed + failures(c.recipient) === 0 ? "no history yet" : `only ${history}`;
        this.addEvent(offerId, "exploration",
          `Exploration: offered to ${c.recipient.name} (${what}) to learn its reliability — ${fmtDuration(left)} of slack.`, a.id);
      }
    }
    if (created.length > 1) {
      this.addEvent(offerId, "split", `Split across ${created.length} recipients (${created.map((a) => a.meals).join(" + ")} meals).`);
    }
    if (remaining > 0 && !this.hasEvent(offerId, "note", "Waiting for a matching demand")) {
      this.addEvent(offerId, "note", `Waiting for a matching demand — ${remaining} meals unassigned, ${fmtDuration(left)} left.`);
    }
    this.refreshOffer(offerId);
  }

  // ---- risk ----
  computePFail(a: AssignmentRow, o: OfferRow, r: RecipientRow): number {
    const latestRisk = a.last_reply?.at_risk_probability ?? 0;
    const latest = Date.parse(o.safe_until) - CONFIG.PICKUP_BUFFER_MINS * 60000;
    if (a.eta_promised && Date.parse(a.eta_promised) > latest) return 1;
    return 1 - pComplete(r) * (1 - latestRisk);
  }
  riskReason(a: AssignmentRow, r: RecipientRow, pFail: number): string {
    const bits = [historyPhrase(r)];
    if (a.last_reply && a.last_reply.at_risk_probability > 0.3) bits.push(`latest reply at-risk ${pct(a.last_reply.at_risk_probability)}`);
    if (pFail >= 1 && a.eta_promised) bits.push("promised arrival is after the safe window");
    return `Failure risk for ${r.name} is ${pct(pFail)} (${bits.join("; ")}) — above ${pct(CONFIG.RISK_THRESHOLD)}.`;
  }
  runRisk(offerId: string): void {
    const o = this.offerRow(offerId);
    if (this.isTerminal(o)) return;
    for (const a of this.rowsFor(offerId).filter((x) => PRIMARY_ACTIVE.includes(x.status))) {
      const r = this.recipient(a.recipient_id);
      if (!r) continue;
      const pFail = round3(this.computePFail(a, o, r));
      a.p_fail = pFail;
      if (pFail <= CONFIG.RISK_THRESHOLD) continue;
      if (this.standbysFor(a.id).length > 0) continue;

      const involved = new Set(this.rowsFor(offerId).map((x) => x.recipient_id));
      const best = this.eligibleCandidates(o, involved)[0];
      const why = this.riskReason(a, r, pFail);
      if (!best) {
        const marker = `No backup available for ${r.name}`;
        if (!this.hasEvent(offerId, "risk_check", marker)) {
          this.addEvent(offerId, "risk_check", `${why} ${marker} — nobody else eligible can reach it in time.`, a.id);
        }
        continue;
      }
      const meals = Math.min(a.meals, best.capacity);
      const now = this.nowIso();
      const sb: AssignmentRow = {
        id: this.newId("a"), offer_id: offerId, recipient_id: best.recipient.id, demand_id: best.demand.id,
        meals, status: "standby_requested", reliability_at_assignment: round3(best.p_mean),
        selection: {
          method: "mean", sampled_p_complete: null, explored: false,
          reason: `Best remaining backup: ${historyPhrase(best.recipient)} (${pct(best.p_mean)}), ${best.distance_km} km away.`,
        },
        distance_km: best.distance_km, offered_at: now, respond_by: this.addSecs(now, CONFIG.STANDBY_TIMEOUT_SECS),
        accepted_at: null, reconfirm_by: null, collected_at: null, eta_promised: null, p_fail: null,
        is_standby: true, standby_for_assignment_id: a.id, last_reply: null, was_rematched: false,
      };
      this.s.assignments.push(sb);
      this.addEvent(offerId, "risk_check", why, a.id);
      this.addEvent(offerId, "backup_alerted", `Asked ${best.recipient.name} to stand by for ${meals} meals.`, sb.id);
    }
  }

  // ---- transitions ----
  need(a: AssignmentRow, from: AssignmentStatus[], action: string): void {
    if (!from.includes(a.status)) {
      throw new ApiError("INVALID_TRANSITION", `Cannot ${action} an assignment that is ${a.status}`, 409);
    }
  }
  accept(id: string, opts: { meals?: number; eta?: string | null } = {}): void {
    const a = this.assignment(id);
    this.need(a, ["offered"], "accept");
    const meals = opts.meals && opts.meals > 0 && opts.meals < a.meals ? opts.meals : a.meals;
    const before = a.meals;
    a.status = "accepted";
    a.accepted_at = this.nowIso();
    a.meals = meals;
    a.eta_promised = opts.eta ?? a.eta_promised;
    this.recordResponseTime(a.recipient_id, this.responseSecs(a));
    if (meals < before) {
      this.adjustDemandMatched(a.demand_id, meals - before);
      this.addEvent(a.offer_id, "accepted", `${this.name(a)} accepted ${meals} of ${before} meals; re-matching ${before - meals}.`, id);
    } else {
      this.addEvent(a.offer_id, "accepted", `${this.name(a)} accepted ${meals} meals.`, id);
    }
    if (opts.eta) this.addEvent(a.offer_id, "note", `${this.name(a)} expects to arrive around ${fmtTime(opts.eta)}.`, id);
    this.refreshOffer(a.offer_id);
    if (meals < before) this.runMatching(a.offer_id);
    this.runRisk(a.offer_id);
  }
  decline(id: string): void {
    const a = this.assignment(id);
    this.need(a, ["offered"], "decline");
    a.status = "declined";
    this.adjustDemandMatched(a.demand_id, -a.meals);
    this.recordResponseTime(a.recipient_id, this.responseSecs(a));
    this.addEvent(a.offer_id, "declined", `${this.name(a)} declined ${a.meals} meals.`, id);
    this.refreshOffer(a.offer_id);
    this.runMatching(a.offer_id);
  }
  reconfirm(id: string): void {
    const a = this.assignment(id);
    this.need(a, ["reconfirm_sent"], "reconfirm");
    a.status = "confirmed";
    this.addEvent(a.offer_id, "confirmed", `${this.name(a)} confirmed they're still coming.`, id);
    this.refreshOffer(a.offer_id);
    this.runRisk(a.offer_id);
  }
  cancel(id: string): void {
    const a = this.assignment(id);
    this.need(a, PRIMARY_ACTIVE, "cancel");
    a.status = "cancelled";
    const r = this.recipient(a.recipient_id);
    if (r) r.cancelled += 1;
    this.addEvent(a.offer_id, "cancelled", `${this.name(a)} cancelled their pickup of ${a.meals} meals.`, id);
    this.promoteStandbyOrRematch(id);
  }
  collected(id: string): void {
    const a = this.assignment(id);
    this.need(a, PRIMARY_ACTIVE, "mark collected");
    const o = this.offerRow(a.offer_id);
    a.status = "collected";
    a.collected_at = this.nowIso();
    a.p_fail = 0;
    const r = this.recipient(a.recipient_id);
    if (r) r.completed += 1;
    o.meals_collected += a.meals;
    const spare = (Date.parse(o.safe_until) - this.now) / 60000;
    const timing = spare >= 0 ? `with ${fmtDuration(spare)} to spare` : `${fmtDuration(-spare)} after the safe window`;
    this.addEvent(a.offer_id, "collected", `${this.name(a)} collected ${a.meals} meals ${timing}.`, id);
    for (const sb of this.standbysFor(id)) this.releaseStandby(sb, `${this.name(sb)} released from standby — ${this.name(a)} collected.`);
    this.maybeFulfilDemand(a.demand_id);
    this.refreshOffer(a.offer_id);
  }
  standbyAccept(id: string): void {
    const a = this.assignment(id);
    this.need(a, ["standby_requested"], "stand by for");
    a.status = "on_standby";
    this.recordResponseTime(a.recipient_id, this.responseSecs(a));
    this.addEvent(a.offer_id, "standby_ready", `${this.name(a)} is on standby for ${a.meals} meals.`, id);
  }
  standbyDecline(id: string): void {
    const a = this.assignment(id);
    this.need(a, ["standby_requested"], "decline standby for");
    a.status = "released";
    this.addEvent(a.offer_id, "standby_released", `${this.name(a)} can't stand by today (no penalty).`, id);
    this.runRisk(a.offer_id);
  }
  standbyRelease(id: string): void {
    const a = this.assignment(id);
    this.need(a, ["on_standby", "standby_requested"], "release");
    a.status = "released";
    this.addEvent(a.offer_id, "standby_released", `${this.name(a)} is no longer available as a backup.`, id);
    this.runRisk(a.offer_id);
  }
  promoteStandbyOrRematch(failedId: string): void {
    const failed = this.assignment(failedId);
    const backups = this.standbysFor(failedId);
    const ready = backups.find((b) => b.status === "on_standby");
    this.adjustDemandMatched(failed.demand_id, -failed.meals);
    failed.was_rematched = true;
    if (ready) {
      ready.status = "accepted";
      ready.accepted_at = this.nowIso();
      ready.p_fail = null;
      this.adjustDemandMatched(ready.demand_id, ready.meals);
      this.addEvent(failed.offer_id, "standby_promoted",
        `${this.name(failed)} dropped out. ${this.name(ready)} was already on standby — took over ${ready.meals} meals instantly.`, ready.id);
    } else {
      this.addEvent(failed.offer_id, "rematch", `Re-matching ${failed.meals} meals after ${this.name(failed)} dropped out.`, failedId);
    }
    for (const b of backups.filter((x) => x !== ready)) this.releaseStandby(b, `${this.name(b)} released from standby — no longer needed.`);
    this.refreshOffer(failed.offer_id);
    this.runMatching(failed.offer_id);
    this.runRisk(failed.offer_id);
  }
  applyAction(id: string, action: AssignmentAction): string {
    const a = this.assignment(id);
    switch (action) {
      case "accept": this.accept(id); break;
      case "decline": this.decline(id); break;
      case "reconfirm": this.reconfirm(id); break;
      case "cancel": this.cancel(id); break;
      case "collected": this.collected(id); break;
      case "standby_accept": this.standbyAccept(id); break;
      case "standby_decline": this.standbyDecline(id); break;
      default: throw new ApiError("NOT_FOUND", `Unknown action ${action as string}`, 404);
    }
    return a.offer_id;
  }

  // ---- replies (fixed table, backend/src/domain/replies.ts) ----
  applyReply(a: AssignmentRow, u: ReplyUnderstanding): { action_taken: string; changed: boolean } {
    a.last_reply = u;
    if (u.needs_clarification || u.intent_probability < CONFIG.INTENT_MIN_PROBABILITY) {
      return { action_taken: "No change — asked to clarify", changed: false };
    }
    if (!REPLYABLE.includes(a.status)) return { action_taken: `No change — assignment is already ${a.status}`, changed: false };
    const res = this.dispatchReply(a, u);
    this.runRisk(a.offer_id);
    return res;
  }
  dispatchReply(a: AssignmentRow, u: ReplyUnderstanding): { action_taken: string; changed: boolean } {
    const s = a.status;
    const active = PRIMARY_ACTIVE.includes(s);
    const who = this.name(a);
    const ok = (action_taken: string) => ({ action_taken, changed: true });
    const note = (msg: string) => {
      this.addEvent(a.offer_id, "note", msg, a.id);
      return { action_taken: "No change — noted", changed: false };
    };
    switch (u.intent) {
      case "accept_full":
      case "still_coming":
        if (s === "offered") { this.accept(a.id); return ok(`Accepted ${a.meals} meals`); }
        if (s === "reconfirm_sent") { this.reconfirm(a.id); return ok("Reconfirmed — still coming"); }
        if (active) return note(`${who} says they're still coming.`);
        if (s === "standby_requested") { this.standbyAccept(a.id); return ok("On standby"); }
        return note(`${who} (standby) acknowledged.`);
      case "accept_partial": {
        const m = u.meals;
        if (m === null || m <= 0) return { action_taken: "No change — asked how many meals", changed: false };
        if (s === "standby_requested") { this.standbyAccept(a.id); return ok("On standby"); }
        if (s === "on_standby") return note(`${who} (standby) can take ${m} meals.`);
        if (m >= a.meals) {
          if (s === "offered") { this.accept(a.id); return ok(`Accepted ${a.meals} meals`); }
          if (s === "reconfirm_sent") { this.reconfirm(a.id); return ok("Reconfirmed — still coming"); }
          return note(`${who} can take all ${a.meals} meals.`);
        }
        const before = a.meals;
        if (s === "offered") {
          this.accept(a.id, { meals: m });
          return ok(`Accepted ${m} of ${before} meals; re-matching ${before - m}`);
        }
        a.meals = m;
        this.adjustDemandMatched(a.demand_id, m - before);
        this.addEvent(a.offer_id, "note", `${who} can now take only ${m} of ${before} meals; re-matching ${before - m}.`, a.id);
        this.refreshOffer(a.offer_id);
        this.runMatching(a.offer_id);
        return ok(`Reduced to ${m} of ${before} meals; re-matching ${before - m}`);
      }
      case "decline":
      case "cancel":
        if (s === "offered") { this.decline(a.id); return ok("Declined — offering elsewhere"); }
        if (active) { this.cancel(a.id); return ok("Cancelled — backup or re-match triggered"); }
        if (s === "standby_requested") { this.standbyDecline(a.id); return ok("Not standing by — trying the next backup"); }
        this.standbyRelease(a.id);
        return ok("Released from standby");
      case "running_late":
        if (s === "offered") {
          this.accept(a.id, { eta: u.eta });
          return ok(u.eta ? `Accepted; arriving around ${fmtTime(u.eta)}` : "Accepted; running late");
        }
        if (active) {
          if (u.eta) {
            a.eta_promised = u.eta;
            this.addEvent(a.offer_id, "note", `${who} now expects to arrive around ${fmtTime(u.eta)}.`, a.id);
          }
          return ok(u.eta ? `Noted new ETA ${fmtTime(u.eta)}; risk re-checked` : "Noted running late; risk re-checked");
        }
        if (s === "standby_requested") { this.standbyAccept(a.id); return ok("On standby"); }
        return note(`${who} (standby) says they'd be late.`);
      case "question":
      default:
        this.addEvent(a.offer_id, "note", `${who} asked: "${u.text}"`, a.id);
        return { action_taken: "No change — question forwarded", changed: false };
    }
  }
  handleReply(id: string, text: string): { understood: ReplyUnderstanding; offer: OfferDetail } {
    const a = this.assignment(id);
    const u = mockUnderstand(text, a.meals, this.now);
    const quoted = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    const head = `${this.name(a)}: '${quoted}' → ${INTENT_LABEL[u.intent]} (${pct(u.intent_probability)}), at-risk ${pct(u.at_risk_probability)}.`;
    const ev = this.addEvent(a.offer_id, "reply_understood", head, a.id);
    const { action_taken } = this.applyReply(a, { ...u, action_taken: "" });
    const understood: ReplyUnderstanding = { ...u, action_taken };
    a.last_reply = understood;
    ev.message = `${head} ${action_taken}.`;
    return { understood, offer: this.offerDetail(a.offer_id) };
  }

  // ---- scheduler (backend/src/scheduler.ts) ----
  tick(): void {
    const past = (iso: string | null) => !!iso && Date.parse(iso) <= this.now;
    const byStatus = (st: AssignmentStatus) => this.s.assignments.filter((a) => a.status === st);
    const step = (fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.warn("[mock scheduler]", err);
      }
    };
    step(() => {
      for (const a of byStatus("offered")) {
        if (!past(a.respond_by)) continue;
        a.status = "no_response";
        this.adjustDemandMatched(a.demand_id, -a.meals);
        this.addEvent(a.offer_id, "no_response", `${this.name(a)} didn't respond in time (no penalty) — offering elsewhere.`, a.id);
        this.refreshOffer(a.offer_id);
        this.runMatching(a.offer_id);
      }
    });
    step(() => {
      for (const a of byStatus("accepted")) {
        if (!a.accepted_at || Date.parse(a.accepted_at) + CONFIG.RECONFIRM_AFTER_SECS * 1000 > this.now) continue;
        a.status = "reconfirm_sent";
        a.reconfirm_by = this.addSecs(this.nowIso(), CONFIG.RECONFIRM_TIMEOUT_SECS);
        this.addEvent(a.offer_id, "reconfirm_sent", `Asked ${this.name(a)} to reconfirm they're still coming.`, a.id);
      }
    });
    step(() => {
      for (const a of byStatus("reconfirm_sent")) {
        if (!past(a.reconfirm_by)) continue;
        a.status = "no_response";
        const r = this.recipient(a.recipient_id);
        if (r) r.no_show += 1;
        this.addEvent(a.offer_id, "no_response", `${this.name(a)} went silent at reconfirm — counted as a no-show.`, a.id);
        this.promoteStandbyOrRematch(a.id);
      }
    });
    step(() => {
      for (const a of byStatus("standby_requested")) {
        if (!past(a.respond_by)) continue;
        a.status = "released";
        this.addEvent(a.offer_id, "standby_released", `${this.name(a)} didn't answer the standby request (no penalty).`, a.id);
        this.runRisk(a.offer_id);
      }
    });
    const byOfferStatus = (...st: string[]) =>
      this.s.offers.filter((o) => st.includes(o.status)).sort((a, b) => a.created_at.localeCompare(b.created_at));
    step(() => { for (const o of byOfferStatus("matching", "assigned")) this.runRisk(o.id); });
    step(() => { for (const o of byOfferStatus("open", "matching")) this.runMatching(o.id); });
    step(() => {
      for (const o of byOfferStatus("open", "matching", "assigned")) if (past(o.safe_until)) this.expireOffer(o);
    });
  }
  expireOffer(o: OfferRow): void {
    const remaining = this.remainingMeals(o.id);
    for (const a of this.rowsFor(o.id)) {
      if (PRIMARY_OPEN.includes(a.status)) {
        a.status = "no_response";
        this.adjustDemandMatched(a.demand_id, -a.meals);
        this.addEvent(o.id, "expired", `${this.name(a)} didn't collect before the safe window closed.`, a.id);
      } else if (STANDBY_LIVE.includes(a.status)) {
        this.releaseStandby(a, `${this.name(a)} released — safe window closed.`);
      }
    }
    const uncollected = o.meal_count - o.meals_collected;
    if ((remaining > 0 || uncollected > 0) && !o.fallback_route) this.applyFallback(o, uncollected);
    this.refreshOffer(o.id);
    if (o.status === "matching" || o.status === "assigned" || o.status === "open") {
      o.status = o.meals_collected > 0 ? "partially_collected" : "expired";
      this.addEvent(o.id, "expired", "Safe window closed.");
    }
  }
}

// ---------- background timer: one tick per second while a mock page is open ----------

let ticker: ReturnType<typeof setInterval> | null = null;

function ensureTicker(): void {
  if (ticker || typeof window === "undefined") return;
  ticker = setInterval(() => {
    try {
      run((sim) => sim.tick());
    } catch (err) {
      console.warn("[mock] tick failed", err);
    }
  }, 1000);
}

/** Every mock call: make sure timers run, then act on the shared store. */
async function call<T>(fn: (sim: Sim) => T, ms = 120): Promise<T> {
  ensureTicker();
  await delay(ms);
  return run((sim) => {
    sim.tick();
    return fn(sim);
  });
}

function badRequest(message: string): never {
  throw new ApiError("VALIDATION_ERROR", message, 400);
}

function fileToDataUrl(file: File): Promise<string | null> {
  // Downscaled so the photo survives in localStorage and shows in other tabs.
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export const mock: Api = {
  health: () => call(() => ({ ok: true, llm: "mock" as const, laya: "mock" as const, telegram: "disabled" as const, stt: "disabled" as const }), 60),
  restaurants: () => call((sim) => sim.s.restaurants.map((r) => ({ ...r }))),
  recipients: () => call((sim) => sim.listRecipients()),

  async parseOffer({ restaurant_id, transcript, photo }) {
    if (!transcript.trim()) badRequest("transcript is required");
    const photoUrl = photo ? await fileToDataUrl(photo) : null;
    return call((sim) => {
      if (restaurant_id && !sim.restaurant(restaurant_id)) throw new ApiError("NOT_FOUND", `Restaurant ${restaurant_id} not found`, 404);
      const p = mockParseOffer(transcript, sim.now);
      const guardrail: IntakeGuardrail = mockGuardrail(transcript, p.items, p.diet);
      return { parsed: { ...p, guardrail }, photo_url: photoUrl };
    }, 600);
  },

  createOffer: (body) =>
    call((sim) => {
      if (body.confirmations?.diet_confirmed !== true || body.confirmations?.safety_checklist_confirmed !== true) {
        throw new ApiError("CONFIRMATION_REQUIRED", "Both diet_confirmed and safety_checklist_confirmed must be true", 400);
      }
      if (!Number.isInteger(body.meal_count) || body.meal_count < 1) badRequest("meal_count must be at least 1");
      const safe = Date.parse(body.safe_until);
      if (Number.isNaN(safe) || Number.isNaN(Date.parse(body.cooked_at))) badRequest("cooked_at and safe_until must be ISO 8601 timestamps");
      if (safe <= sim.now) badRequest("safe_until is in the past");
      if (safe <= Date.parse(body.cooked_at)) badRequest("safe_until must be after cooked_at");
      const restaurant = sim.restaurant(body.restaurant_id);
      if (!restaurant) throw new ApiError("NOT_FOUND", `Restaurant ${body.restaurant_id} not found`, 404);

      const row: OfferRow = {
        id: sim.newId("o"), restaurant_id: body.restaurant_id, items: body.items.map((i) => ({ ...i })),
        meal_count: body.meal_count, meals_assigned: 0, meals_collected: 0, diet: body.diet,
        cooked_at: new Date(body.cooked_at).toISOString(), safe_until: new Date(safe).toISOString(),
        photo_url: body.photo_url, raw_transcript: body.raw_transcript, pickup_notes: body.pickup_notes,
        status: "open", fallback_route: null, created_at: sim.nowIso(),
      };
      sim.s.offers.push(row);
      const what = body.items.map((i) => i.name).join(", ") || "food";
      sim.addEvent(row.id, "offer_created",
        `${restaurant.name} listed ${body.meal_count} ${body.diet === "veg" ? "veg" : "non-veg"} meals (${what}), safe until ${fmtTime(row.safe_until)}. Diet and safety checklist confirmed.`);
      const guard = body.raw_transcript ? mockGuardrail(body.raw_transcript, body.items, body.diet) : null;
      if (guard?.safety_concern_probability != null && guard.safety_concern_probability > 0.3) {
        sim.addEvent(row.id, "guardrail_flag",
          `Safety check (mock) flagged a possible concern (${pct(guard.safety_concern_probability)}); the restaurant confirmed the safety checklist.`);
      }
      sim.addEvent(row.id, "matching_started", "Matching started: only recipients who already need this food, ranked by reliability.");
      sim.runMatching(row.id);
      return sim.offerDetail(row.id);
    }, 250),

  getOffer: (id) => call((sim) => sim.offerDetail(id)),

  parseDemand: ({ recipient_id, transcript }) =>
    call((sim) => {
      if (!transcript.trim()) badRequest("transcript is required");
      if (recipient_id && !sim.recipient(recipient_id)) throw new ApiError("NOT_FOUND", `Recipient ${recipient_id} not found`, 404);
      return { parsed: mockParseDemand(transcript, sim.now) };
    }, 600),

  createDemand: (body) =>
    call((sim) => {
      if (!sim.recipient(body.recipient_id)) throw new ApiError("NOT_FOUND", `Recipient ${body.recipient_id} not found`, 404);
      if (!Number.isInteger(body.people_count) || body.people_count < 1) badRequest("people_count must be at least 1");
      if (!(body.max_distance_km > 0 && body.max_distance_km <= 50)) badRequest("max_distance_km must be between 0 and 50");
      const needed = Date.parse(body.needed_by);
      if (Number.isNaN(needed)) badRequest("needed_by must be an ISO 8601 timestamp");
      if (needed <= sim.now) badRequest("needed_by is in the past");
      const row: DemandRow = {
        id: sim.newId("d"), recipient_id: body.recipient_id, people_count: body.people_count, meals_matched: 0,
        diet: body.diet, needed_by: new Date(needed).toISOString(), max_distance_km: body.max_distance_km,
        notes: body.notes, status: "open", raw_transcript: body.raw_transcript, created_at: sim.nowIso(),
      };
      sim.s.demands.push(row);
      for (const o of sim.s.offers.filter((x) => x.status === "open" || x.status === "matching")) sim.runMatching(o.id);
      return sim.toDemand(row);
    }),

  board: () =>
    call((sim): Board => {
      const offers = sim.sortedOffers();
      return {
        offers: offers.map((o) => sim.toOffer(o)),
        demands: [...sim.s.demands].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((d) => sim.toDemand(d)),
        recipients: sim.listRecipients(),
        stats: sim.computeStats(offers),
        server_time: sim.nowIso(),
        ai_status: { llm: "mock", laya: "mock" },
      };
    }, 80),

  assignmentAction: (id, action) => call((sim) => sim.offerDetail(sim.applyAction(id, action))),

  reply: (id, text) =>
    call((sim) => {
      const t = text.trim();
      if (!t || t.length > 1000) badRequest("text: must be 1 to 1000 characters");
      return sim.handleReply(id, t);
    }, 500),

  collectorInbox: (recipientId) =>
    call((sim) => {
      const r = sim.recipient(recipientId);
      if (!r) throw new ApiError("NOT_FOUND", `Recipient ${recipientId} not found`, 404);
      const inbox: AssignmentStatus[] = ["offered", "accepted", "reconfirm_sent", "confirmed", "standby_requested", "on_standby"];
      const rows = sim.s.assignments
        .filter((a) => a.recipient_id === r.id && inbox.includes(a.status))
        .reverse()
        .sort((a, b) => b.offered_at.localeCompare(a.offered_at));
      return {
        recipient: sim.toRecipient(r, sim.boardReferenceRestaurant()),
        assignments: rows.map((a) => ({ ...sim.toAssignment(a), offer: sim.toOffer(sim.offerRow(a.offer_id)) })),
      };
    }),

  impact: (restaurantId) =>
    call((sim): ImpactCard => {
      const r = sim.restaurant(restaurantId);
      if (!r) throw new ApiError("NOT_FOUND", `Restaurant ${restaurantId} not found`, 404);
      const offers = sim.s.offers.filter((o) => o.restaurant_id === r.id);
      const st = sim.computeStats(offers);
      return {
        restaurant_id: r.id, restaurant_name: r.name, period_label: "Since setup (includes simulated history)",
        meals_rescued: st.meals_rescued, offers_made: offers.length,
        share_collected_within_window: st.share_collected_within_window, fallback_count: st.fallback_count,
        is_simulated: true,
      };
    }),

  async demoReset() {
    ensureTicker();
    await delay(150);
    const links = Object.fromEntries(load().recipients.map((r) => [r.id, r.telegram_linked]));
    save(seedState(Date.now(), links));
    return { ok: true as const };
  },

  demoFastForward: (assignmentId) =>
    call((sim) => {
      const a = sim.assignment(assignmentId);
      const now = sim.nowIso();
      switch (a.status) {
        case "offered":
        case "standby_requested":
          a.respond_by = now;
          break;
        case "reconfirm_sent":
          a.reconfirm_by = now;
          break;
        case "accepted":
          a.accepted_at = sim.addSecs(now, -CONFIG.RECONFIRM_AFTER_SECS);
          break;
        default:
          throw new ApiError("INVALID_TRANSITION", `Assignment is ${a.status}; nothing to fast-forward`, 409);
      }
      sim.tick();
      return sim.offerDetail(a.offer_id);
    }),

  async transcribe() {
    throw new ApiError("STT_UNAVAILABLE", "Server speech-to-text isn't available in mock mode.", 503);
  },
};
