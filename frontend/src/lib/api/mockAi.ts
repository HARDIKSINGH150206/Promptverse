// Offline keyword versions of the LLM parser and the Laya decision model.
// Ported from backend/src/ai/mock.ts + parse.ts so mock mode answers the same way. Source is always "mock".
import { istToMs, pct } from "../time";
import {
  REPLY_INTENTS,
  type DemandMissingField, type IntakeGuardrail, type OfferItem, type OfferMissingField, type ParsedDemand,
  type ParsedOffer, type ReplyIntent, type ReplyUnderstanding,
} from "./types";

const NONVEG_RE = /\b(chicken|egg|eggs|omelette|mutton|fish|prawns?|meat|keema|beef|pork|lamb|non[- ]?veg)\b/i;
const VEG_RE = /\b(veg|vegetarian|pure veg|jain)\b/i;
const SAFETY_RE = /(smell|smells|since afternoon|since morning|left out|sitting out|uncovered|not refrigerated|reheated|half eaten|leftover from plates|served on plates|spoil|stale|sour)/i;
const AT_RISK_RE = /(traffic|late|stuck|delay|breakdown|broke down|puncture|no staff|short[- ]staffed|not sure|maybe|may be|might|try)/i;

// ---- spoken times ("made at 7", "safe till 10:30") ----

interface SpokenTime { hour: number; minute: number; meridiem: "am" | "pm" | null }

function parseSpokenTime(s: string): SpokenTime | null {
  const m = s.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  const meridiem = m[3] ? (m[3].toLowerCase().startsWith("a") ? "am" : "pm") : null;
  return { hour, minute, meridiem };
}

function hourCandidates(t: SpokenTime): number[] {
  if (t.meridiem === "am") return [t.hour % 12];
  if (t.meridiem === "pm") return [(t.hour % 12) + 12];
  if (t.hour > 12 || t.hour === 0) return [t.hour];
  return [t.hour % 12, (t.hour % 12) + 12];
}

function resolvePast(t: SpokenTime, ref: number): string {
  const opts: number[] = [];
  for (const day of [0, -1]) for (const h of hourCandidates(t)) opts.push(istToMs(day, h, t.minute, ref));
  const ok = opts.filter((x) => x <= ref + 15 * 60000).sort((a, b) => b - a);
  return new Date(ok[0] ?? opts[0]).toISOString();
}

function resolveFuture(t: SpokenTime, ref: number): string {
  const opts: number[] = [];
  for (const day of [0, 1]) for (const h of hourCandidates(t)) opts.push(istToMs(day, h, t.minute, ref));
  const ok = opts.filter((x) => x > ref).sort((a, b) => a - b);
  return new Date(ok[0] ?? opts[opts.length - 1]).toISOString();
}

// ---- offers ----

const VEG_FOODS = [
  "biryani", "veg biryani", "pulao", "raita", "dal", "rice", "roti", "chapati", "chapathi", "naan", "sabzi", "paneer",
  "curry", "idli", "dosa", "sambar", "khichdi", "upma", "poha", "noodles", "pasta", "sandwich", "chole", "rajma",
  "bisi bele bath", "curd rice", "lemon rice", "puri", "paratha", "halwa", "kheer", "salad", "fried rice", "meals",
];
const NONVEG_FOODS = ["chicken", "mutton", "fish", "egg", "prawn", "keema", "chicken biryani", "egg curry"];

const OFFER_FIELDS: OfferMissingField[] = ["estimated_meals", "diet", "cooked_at", "safe_until"];
const OFFER_QUESTION: Record<OfferMissingField, string> = {
  safe_until: "Until what time is the food safe to eat?",
  estimated_meals: "Roughly how many plates or meals is that?",
  diet: "Is everything vegetarian, or does any item have meat, fish or egg?",
  cooked_at: "What time was the food cooked?",
};

function findItems(t: string, meals: number | null): OfferItem[] {
  const found: string[] = [];
  for (const f of [...NONVEG_FOODS, ...VEG_FOODS].sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${f}\\b`).test(t) && !found.some((x) => x.includes(f))) found.push(f);
  }
  return found.map((name) => ({ name: name.replace(/\b\w/g, (c) => c.toUpperCase()), quantity: meals ?? 1, unit: "plates" }));
}

export function mockParseOffer(transcript: string, ref = Date.now()): Omit<ParsedOffer, "guardrail"> {
  const t = transcript.toLowerCase();
  const mealsM = t.match(/(\d+)\s*(plates?|meals?|portions?|packets?|boxes|box|people|servings?|thalis?)/);
  const meals = mealsM ? Number(mealsM[1]) : null;
  const items = findItems(t, meals);
  const diet: "veg" | "nonveg" | null = NONVEG_RE.test(t)
    ? "nonveg"
    : VEG_RE.test(t) || (items.length > 0 && items.every((i) => VEG_FOODS.includes(i.name.toLowerCase())))
      ? "veg"
      : null;

  const cookedM = t.match(/(?:made|cooked|prepared|ready)\s*(?:at|around|by)?\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/);
  const cooked = cookedM ? parseSpokenTime(cookedM[1]) : null;
  const safeM = t.match(/(?:safe|good|fresh|okay|ok|fine)\s*(?:till|until|upto|up to|to)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/);
  const safe = safeM ? parseSpokenTime(safeM[1]) : null;
  const notesM = t.match(/((?:back|front|side|rear|main)\s+(?:gate|door|entrance)|(?:pick ?up|collect)\s+(?:from|at)\s+[^,.]+|ask for\s+[^,.]+)/);

  const parsed = {
    items,
    estimated_meals: meals,
    diet,
    cooked_at: cooked ? resolvePast(cooked, ref) : null,
    safe_until: safe ? resolveFuture(safe, ref) : null,
    pickup_notes: notesM ? notesM[1].replace(/^\w/, (c) => c.toUpperCase()) : null,
    photo_check: null,
  };
  const missing = OFFER_FIELDS.filter((f) => parsed[f] === null);
  const followup = missing.length ? OFFER_QUESTION[missing.includes("safe_until") ? "safe_until" : missing[0]] : null;
  return { ...parsed, missing_fields: missing, followup_question: followup };
}

/** Same thresholds as backend/src/ai/guardrail.ts. Laya can only add a confirmation step. */
export function mockGuardrail(transcript: string, items: OfferItem[], extractedDiet: "veg" | "nonveg" | null): IntakeGuardrail {
  const text = `${transcript} ${JSON.stringify(items)}`;
  const [label, p]: ["veg" | "nonveg", number] = NONVEG_RE.test(text)
    ? ["nonveg", 0.97]
    : VEG_RE.test(text) ? ["veg", 0.97] : ["veg", 0.71];
  const safety = SAFETY_RE.test(text) ? 0.8 : 0.06;
  const agrees = label === extractedDiet;
  const word = (d: string) => (d === "veg" ? "veg" : "non-veg");
  const reasons: string[] = [];
  if (p < 0.95) reasons.push(`Diet unclear: ${word(label)} ${pct(p)}`);
  if (extractedDiet === null) reasons.push("Diet wasn't stated — please confirm veg or non-veg");
  else if (!agrees) reasons.push(`Diet check reads this as ${word(label)} (${pct(p)}) but the note was read as ${word(extractedDiet)}`);
  if (safety > 0.3) reasons.push(`Message suggests the food may be unsafe (safety concern ${pct(safety)})`);
  // backend's plain-code keyword floor adds its own reason
  const keyword = transcript.match(SAFETY_RE)?.[0];
  if (keyword) reasons.push(`Message mentions "${keyword}" (keyword check)`);
  return {
    source: "mock",
    diet_check: { label, probability: p, agrees_with_extraction: agrees },
    safety_concern_probability: safety,
    needs_confirmation: p < 0.95 || !agrees || safety > 0.3,
    reasons,
  };
}

// ---- demands ----

const DEMAND_FIELDS: DemandMissingField[] = ["people_count", "diet", "needed_by"];
const DEMAND_QUESTION: Record<DemandMissingField, string> = {
  needed_by: "By what time do you need the food?",
  people_count: "How many people do you need food for?",
  diet: "Do you need vegetarian food only, or is anything fine?",
};

export function mockParseDemand(transcript: string, ref = Date.now()): ParsedDemand {
  const t = transcript.toLowerCase();
  const peopleM = t.match(/(\d+)\s*(people|persons?|kids|children|residents|members|elders|men|women|boys|girls|meals|plates)/);
  const diet = /\b(non[- ]?veg|nonveg)\b/.test(t) && !/\bno non/.test(t)
    ? (/\b(any|anything|either)\b/.test(t) ? "any" : "nonveg")
    : /\b(veg only|only veg|vegetarian|pure veg|veg)\b/.test(t)
      ? "veg"
      : /\b(any|anything|either|no preference|all food)\b/.test(t) ? "any" : null;
  const byM = t.match(/(?:by|before|till|until|around)\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/);
  const by = byM ? parseSpokenTime(byM[1]) : null;
  const kmM = t.match(/(?:within|upto|up to|max|maximum)?\s*(\d+(?:\.\d+)?)\s*(?:km|kms|kilomet)/);
  const parsed = {
    people_count: peopleM ? Number(peopleM[1]) : null,
    diet: diet as ParsedDemand["diet"],
    needed_by: by ? resolveFuture(by, ref) : null,
    max_distance_km: kmM ? Number(kmM[1]) : null,
    notes: null,
  };
  const missing = DEMAND_FIELDS.filter((f) => parsed[f] === null);
  const followup = missing.length ? DEMAND_QUESTION[missing.includes("needed_by") ? "needed_by" : missing[0]] : null;
  return { ...parsed, missing_fields: missing, followup_question: followup };
}

// ---- replies ----

function mockIntent(text: string): { choice: ReplyIntent; p: number } {
  const t = text.toLowerCase();
  if (/\b(only|just|can take|we can take|take)\s+(\d+)/.test(t) && !/\b(all|everything)\b/.test(t)) return { choice: "accept_partial", p: 0.9 };
  if (/(can'?t come|cannot come|won'?t (make|come)|not coming|cancel|have to drop|can'?t make it)/.test(t)) return { choice: "cancel", p: 0.88 };
  if (/(no thanks|can'?t take|cannot take|not today|decline|don'?t need|no need|we'?re full|\bno\b)/.test(t)) return { choice: "decline", p: 0.88 };
  if (/(late|traffic|stuck|delay|reaching (by|at)?|in \d+ ?min)/.test(t)) return { choice: "running_late", p: 0.9 };
  if (/(on the way|on our way|coming|omw|leaving now|left now|almost there|still on)/.test(t)) return { choice: "still_coming", p: 0.88 };
  if (/\b(yes|yeah|yep|ok|okay|sure|accept|we'?ll take|will collect|haan|ha|done|confirmed?)\b/.test(t)) return { choice: "accept_full", p: 0.9 };
  if (t.includes("?")) return { choice: "question", p: 0.85 };
  return { choice: "question", p: 0.55 };
}

function replyDetails(text: string, ref: number): { meals: number | null; eta: string | null } {
  const t = text.toLowerCase();
  const mealsM = t.match(/(?:only|just|take|takes|need|for)\s+(\d+)(?!\s*(?:min|:|\.\d|am|pm))/) ?? t.match(/\b(\d+)\s*(?:meals?|plates?|people|packets?)/);
  let eta: string | null = null;
  const inM = t.match(/in\s+(\d+)\s*(?:min|mins|minutes)/);
  if (inM) eta = new Date(ref + Number(inM[1]) * 60000).toISOString();
  else {
    const atM = t.match(/(?:by|at|around|reaching|reach|arrive|arriving|there)\s*(?:by|at|around)?\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/);
    const st = atM ? parseSpokenTime(atM[1]) : null;
    if (st) eta = resolveFuture(st, ref);
  }
  return { meals: mealsM ? Number(mealsM[1]) : null, eta };
}

/** Intent + at-risk (Laya role) and numbers/times (LLM role). No state changes here. */
export function mockUnderstand(text: string, assignedMeals: number, ref = Date.now()): Omit<ReplyUnderstanding, "action_taken"> {
  const { choice, p } = mockIntent(text);
  const rest = Math.round(((1 - p) / (REPLY_INTENTS.length - 1)) * 1000) / 1000;
  const probabilities = Object.fromEntries(REPLY_INTENTS.map((k) => [k, k === choice ? p : rest])) as Record<ReplyIntent, number>;
  const atRisk = AT_RISK_RE.test(text) ? 0.78 : 0.08;

  let meals: number | null = null;
  let eta: string | null = null;
  if (choice === "accept_partial" || choice === "running_late") ({ meals, eta } = replyDetails(text, ref));

  let needs = p < 0.7;
  let question: string | null = null;
  if (needs) {
    question = `Sorry, I didn't quite get that. Can you still collect the ${assignedMeals} meals? Reply "yes", "no", or e.g. "only 10".`;
  } else if (choice === "accept_partial" && meals === null) {
    needs = true;
    question = `How many of the ${assignedMeals} meals can you take?`;
  }
  return {
    text, source: "mock", intent: choice, intent_probability: p, probabilities,
    at_risk_probability: atRisk, meals, eta, needs_clarification: needs, clarification_question: question,
  };
}
