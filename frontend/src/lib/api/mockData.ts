// Seed for the in-browser mock backend. Identical to backend/src/db/seed.ts; everything is SIMULATED.
import { istToMs } from "../time";
import type {
  AssignmentStatus, Diet, DemandStatus, FallbackRoute, OfferItem, OfferStatus, RecipientType, Restaurant,
  ReplyUnderstanding, SelectionInfo, TimelineEvent,
} from "./types";

// ---- row shapes kept in the mock store ----

export interface RecipientRow {
  id: string; name: string; type: RecipientType; area: string; lat: number; lng: number;
  link_code: string; telegram_linked: boolean;
  completed: number; cancelled: number; no_show: number; avg_response_secs: number;
}

export interface DemandRow {
  id: string; recipient_id: string; people_count: number; meals_matched: number;
  diet: Diet; needed_by: string; max_distance_km: number; notes: string | null;
  status: DemandStatus; raw_transcript: string | null; created_at: string;
}

export interface OfferRow {
  id: string; restaurant_id: string; items: OfferItem[]; meal_count: number;
  meals_assigned: number; meals_collected: number; diet: "veg" | "nonveg";
  cooked_at: string; safe_until: string; photo_url: string | null; raw_transcript: string | null;
  pickup_notes: string | null; status: OfferStatus; fallback_route: FallbackRoute | null; created_at: string;
}

export interface AssignmentRow {
  id: string; offer_id: string; recipient_id: string; demand_id: string;
  meals: number; status: AssignmentStatus;
  reliability_at_assignment: number; selection: SelectionInfo; distance_km: number;
  offered_at: string; respond_by: string;
  accepted_at: string | null; reconfirm_by: string | null; collected_at: string | null;
  eta_promised: string | null; p_fail: number | null;
  is_standby: boolean; standby_for_assignment_id: string | null;
  last_reply: ReplyUnderstanding | null; was_rematched: boolean;
}

export interface MockState {
  version: number;
  restaurants: Restaurant[];
  recipients: RecipientRow[];
  demands: DemandRow[];
  offers: OfferRow[];
  assignments: AssignmentRow[];
  events: TimelineEvent[];
  rng: number;
  seq: number;
}

export const MOCK_STATE_VERSION = 1;
export const DEMO_SEED = 42;

// Same demo-scaled timers as backend/.env.example
export const CONFIG = {
  ACCEPT_TIMEOUT_SECS: 45,
  RECONFIRM_AFTER_SECS: 20,
  RECONFIRM_TIMEOUT_SECS: 30,
  STANDBY_TIMEOUT_SECS: 45,
  PICKUP_BUFFER_MINS: 20,
  AVG_SPEED_KMPH: 20,
  RISK_THRESHOLD: 0.25,
  INTENT_MIN_PROBABILITY: 0.7,
  THOMPSON_SAMPLING: true,
  EXPLORE_MIN_SLACK_MINS: 90,
  FALLBACK_ORDER: ["animal_feed", "compost"] as FallbackRoute[],
};

// ---- geography (Koramangala Kitchen is the reference point) ----

const KK = { lat: 12.9352, lng: 77.6245 };
const KM_LAT = 1 / 111.32;
const KM_LNG = 1 / (111.32 * Math.cos((KK.lat * Math.PI) / 180));
const at = (northKm: number, eastKm: number) => ({ lat: KK.lat + northKm * KM_LAT, lng: KK.lng + eastKm * KM_LNG });

export const RESTAURANTS: Restaurant[] = [
  { id: "r_koramangala", name: "Koramangala Kitchen", area: "Koramangala", lat: KK.lat, lng: KK.lng },
  { id: "r_indiranagar", name: "Indiranagar Tiffins", area: "Indiranagar", lat: 12.9719, lng: 77.6412 },
];

type SeedRecipient = Omit<RecipientRow, "telegram_linked"> & { demand: { people: number; diet: "veg" | "any" } };

const RECIPIENTS: SeedRecipient[] = [
  { id: "rc_hope", name: "Hope Shelter", type: "shelter", area: "Koramangala 6th Block", ...at(1.2, 0),
    link_code: "HOPE1", completed: 18, cancelled: 1, no_show: 1, avg_response_secs: 120, demand: { people: 20, diet: "veg" } },
  { id: "rc_sunrise", name: "Sunrise Elders Home", type: "old_age_home", area: "HSR Layout", ...at(-2.687, 2.687),
    link_code: "SUN1", completed: 12, cancelled: 0, no_show: 0, avg_response_secs: 200, demand: { people: 20, diet: "veg" } },
  { id: "rc_stars", name: "Little Stars Home", type: "orphanage", area: "Ejipura", ...at(0, -2.5),
    link_code: "STAR1", completed: 9, cancelled: 3, no_show: 2, avg_response_secs: 400, demand: { people: 15, diet: "any" } },
  { id: "rc_saathi", name: "Saathi NGO", type: "ngo", area: "Koramangala 8th Block", ...at(0, 1.0),
    link_code: "SAATHI1", completed: 4, cancelled: 2, no_show: 3, avg_response_secs: 500, demand: { people: 25, diet: "any" } },
  { id: "rc_dawn", name: "New Dawn Shelter", type: "shelter", area: "BTM Layout", ...at(-2.0, 0),
    link_code: "DAWN1", completed: 0, cancelled: 0, no_show: 0, avg_response_secs: 300, demand: { people: 15, diet: "any" } },
];

const iso = (ms: number) => new Date(ms).toISOString();
const addSecs = (isoStr: string, s: number) => iso(Date.parse(isoStr) + s * 1000);

/** Tonight 21:30 IST; if that's under 2 h away (late rehearsals), ~4 h from now instead. */
function demandDeadline(ref: number): string {
  const tonight = istToMs(0, 21, 30, ref);
  if (tonight - ref >= 2 * 3600_000) return iso(tonight);
  return iso(Math.ceil((ref + 4 * 3600_000) / 1800_000) * 1800_000);
}

export function seedState(now = Date.now(), keepLinks: Record<string, boolean> = {}): MockState {
  const neededBy = demandDeadline(now);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- demand is seeded separately below
  const recipients: RecipientRow[] = RECIPIENTS.map(({ demand, ...r }) => ({
    ...r, telegram_linked: !!keepLinks[r.id],
  }));
  const demands: DemandRow[] = RECIPIENTS.map((r) => ({
    id: `d_${r.id.slice(3)}`, recipient_id: r.id, people_count: r.demand.people, meals_matched: 0,
    diet: r.demand.diet, needed_by: neededBy, max_distance_km: 5, notes: "Simulated demand",
    status: "open", raw_transcript: null, created_at: iso(now - 3600_000),
  }));

  const state: MockState = {
    version: MOCK_STATE_VERSION,
    restaurants: RESTAURANTS.map((r) => ({ ...r })),
    recipients, demands, offers: [], assignments: [], events: [],
    rng: DEMO_SEED >>> 0, seq: 0,
  };
  seedHistory(state, now);
  return state;
}

/** A few finished offers from yesterday so the board isn't empty. All simulated. */
function seedHistory(s: MockState, now: number): void {
  const past = [
    { id: "o_past1", r: "r_koramangala", rc: "rc_hope", meals: 25, dish: "Veg Pulao", diet: "veg", cook: [19, 0], safe: [22, 0], got: [20, 10] },
    { id: "o_past2", r: "r_indiranagar", rc: "rc_sunrise", meals: 18, dish: "Idli Sambar", diet: "veg", cook: [8, 0], safe: [12, 0], got: [9, 20] },
    { id: "o_past3", r: "r_koramangala", rc: "rc_stars", meals: 12, dish: "Egg Curry and Rice", diet: "nonveg", cook: [13, 0], safe: [16, 30], got: [14, 5] },
  ] as const;
  const y = (hm: readonly [number, number]) => iso(istToMs(-1, hm[0], hm[1], now));

  for (const p of past) {
    const cooked = y(p.cook);
    const safe = y(p.safe);
    const got = y(p.got);
    const offered = addSecs(cooked, 1800);
    const accepted = addSecs(offered, 90);
    const dId = `d_hist_${p.id.slice(2)}`;
    s.demands.push({
      id: dId, recipient_id: p.rc, people_count: p.meals, meals_matched: p.meals, diet: p.diet === "veg" ? "veg" : "any",
      needed_by: safe, max_distance_km: 5, notes: "Simulated history", status: "fulfilled", raw_transcript: null, created_at: cooked,
    });
    s.offers.push({
      id: p.id, restaurant_id: p.r, items: [{ name: p.dish, quantity: p.meals, unit: "plates" }], meal_count: p.meals,
      meals_assigned: p.meals, meals_collected: p.meals, diet: p.diet, cooked_at: cooked, safe_until: safe, photo_url: null,
      raw_transcript: `(simulated) ${p.meals} plates ${p.dish.toLowerCase()}`, pickup_notes: null, status: "collected",
      fallback_route: null, created_at: offered,
    });
    const aId = `a_hist_${p.id.slice(2)}`;
    s.assignments.push({
      id: aId, offer_id: p.id, recipient_id: p.rc, demand_id: dId, meals: p.meals, status: "collected",
      reliability_at_assignment: 0.8,
      selection: { method: "mean", sampled_p_complete: null, explored: false, reason: "Simulated history" },
      distance_km: 2.0, offered_at: offered, respond_by: addSecs(offered, 45), accepted_at: accepted, reconfirm_by: null,
      collected_at: got, eta_promised: null, p_fail: 0, is_standby: false, standby_for_assignment_id: null,
      last_reply: null, was_rematched: false,
    });
    const ev = (n: number, at: string, type: TimelineEvent["type"], message: string, a: string | null) =>
      s.events.push({ id: `e_h${n}_${p.id}`, offer_id: p.id, at, type, message, assignment_id: a });
    ev(1, offered, "offer_created", `(Simulated) ${p.meals} meals of ${p.dish} listed.`, null);
    ev(2, offered, "offered", `(Simulated) Offered ${p.meals} meals.`, aId);
    ev(3, accepted, "accepted", `(Simulated) Accepted ${p.meals} meals.`, aId);
    ev(4, got, "collected", `(Simulated) Collected ${p.meals} meals within the safe window.`, aId);
  }
}

// ---- Bayesian reliability (port of backend/src/domain/bayes.ts) ----

export type Rng = () => number;

/** mulberry32 over a mutable holder so the seed survives persistence. */
export function rngFrom(holder: { rng: number }): Rng {
  return () => {
    holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
    let t = holder.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = gamma(a, rng);
  const y = gamma(b, rng);
  return x / (x + y);
}

export function posteriorMean(completed: number, fails: number): number {
  return (1 + completed) / (2 + completed + fails);
}

const intervalCache = new Map<string, [number, number]>();

/** 90% credible interval of Beta(1 + completed, 1 + failures), stable per (completed, failures). */
export function interval90(completed: number, fails: number): [number, number] {
  const key = `${completed}/${fails}`;
  const hit = intervalCache.get(key);
  if (hit) return hit;
  const holder = { rng: (completed * 7919 + fails * 104729 + 1) >>> 0 };
  const rng = rngFrom(holder);
  const draws = 2000;
  const xs = Array.from({ length: draws }, () => sampleBeta(1 + completed, 1 + fails, rng)).sort((p, q) => p - q);
  const iv: [number, number] = [xs[Math.floor(draws * 0.05)], xs[Math.floor(draws * 0.95)]];
  intervalCache.set(key, iv);
  return iv;
}
