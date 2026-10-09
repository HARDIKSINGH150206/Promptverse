import { z } from "zod";
import { config } from "../config";
import { nowMs } from "../domain/clock";
import type { DemandMissingField, ParsedDemand, ParsedOffer, OfferItem, OfferMissingField } from "../domain/types";
import { cacheGet, cacheSet, hashKey } from "./cache";
import { completeJson, extractJson, llmModel, type ImageInput } from "./llm";
import { NONVEG_RE, VEG_RE } from "./mock";
import { demandSystemPrompt, offerSystemPrompt, replyDetailsSystemPrompt, RETRY_SUFFIX } from "./prompts";
import { parseSpokenTime, resolveFuture, resolvePast } from "./time";

const isoOrNull = z
  .string()
  .nullable()
  .transform((s) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null));
const posIntOrNull = z.number().nullable().transform((n) => (n !== null && n > 0 ? Math.round(n) : null));

const OfferSchema = z.object({
  items: z.array(z.object({ name: z.string(), quantity: z.number(), unit: z.string() })).default([]),
  estimated_meals: posIntOrNull,
  diet: z.enum(["veg", "nonveg"]).nullable(),
  cooked_at: isoOrNull,
  safe_until: isoOrNull,
  pickup_notes: z.string().nullable(),
  photo_check: z.object({ matches_description: z.boolean().nullable(), note: z.string() }).nullable().default(null),
  missing_fields: z.array(z.string()).default([]),
  followup_question: z.string().nullable(),
});

const DemandSchema = z.object({
  people_count: posIntOrNull,
  diet: z.enum(["veg", "nonveg", "any"]).nullable(),
  needed_by: isoOrNull,
  max_distance_km: z.number().nullable(),
  notes: z.string().nullable(),
  missing_fields: z.array(z.string()).default([]),
  followup_question: z.string().nullable(),
});

const ReplyDetailsSchema = z.object({ meals: posIntOrNull, eta_iso: isoOrNull });

export type ParsedOfferNoGuard = Omit<ParsedOffer, "guardrail">;
export type ReplyDetails = z.infer<typeof ReplyDetailsSchema>;

// ---- generic call -> JSON.parse -> zod, retry once, cache ----

async function callStructured<T>(
  kind: string, system: string, user: string, schema: z.ZodType<T>, image?: ImageInput
): Promise<T | null> {
  const key = JSON.stringify({ kind, p: config.LLM_PROVIDER, m: llmModel(), user, img: image ? hashKey(image.base64) : null });
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await completeJson(system, attempt ? user + RETRY_SUFFIX : user, image);
      const parsed = schema.safeParse(extractJson(raw));
      if (parsed.success) {
        cacheSet(key, parsed.data);
        return parsed.data;
      }
      lastErr = parsed.error;
    } catch (err) {
      lastErr = err;
      // timeouts / provider errors: serve the cache rather than retrying the same failure
      const cached = cacheGet<T>(key);
      if (cached) return cached;
    }
  }
  console.warn(`[llm] ${kind} failed:`, lastErr instanceof Error ? lastErr.message : lastErr);
  return cacheGet<T>(key) ?? null;
}

// ---- time sanity (code, not the model, has the last word) ----
// Spoken times are 12-hour-ambiguous ("11 baje"). If the model lands a future time in the past,
// move it forward 12 h (then 24 h); if it lands a past time in the future, move it back.
const H12 = 12 * 3600_000;
export function fixFuture(iso: string | null, ref = nowMs()): string | null {
  if (!iso) return iso;
  let t = Date.parse(iso);
  for (let i = 0; i < 2 && t <= ref; i++) t += H12;
  return t > ref ? new Date(t).toISOString() : null;
}
export function fixPast(iso: string | null, ref = nowMs()): string | null {
  if (!iso) return iso;
  let t = Date.parse(iso);
  const grace = 15 * 60000;
  for (let i = 0; i < 2 && t > ref + grace; i++) t -= H12;
  return t <= ref + grace ? new Date(t).toISOString() : null;
}

// ---- offers ----

const OFFER_FIELDS: OfferMissingField[] = ["estimated_meals", "diet", "cooked_at", "safe_until"];

function finishOffer(p: Omit<ParsedOfferNoGuard, "missing_fields" | "followup_question"> & { followup_question?: string | null }): ParsedOfferNoGuard {
  const missing = OFFER_FIELDS.filter((f) => p[f] === null);
  let q = p.followup_question ?? null;
  if (!q && missing.length) q = OFFER_QUESTION[missing.includes("safe_until") ? "safe_until" : missing[0]];
  if (!missing.length) q = null;
  return { ...p, missing_fields: missing, followup_question: q };
}

const OFFER_QUESTION: Record<OfferMissingField, string> = {
  safe_until: "Until what time is the food safe to eat?",
  estimated_meals: "Roughly how many plates or meals is that?",
  diet: "Is everything vegetarian, or does any item have meat, fish or egg?",
  cooked_at: "What time was the food cooked?",
};

export async function parseOffer(transcript: string, image?: ImageInput): Promise<ParsedOfferNoGuard & { source: "llm" | "mock" }> {
  if (config.LLM_PROVIDER === "mock") return { ...mockParseOffer(transcript), source: "mock" };
  const now = nowMs();
  const res = await callStructured("offer", offerSystemPrompt(now), `Restaurant's note:\n"""${transcript}"""`, OfferSchema, image);
  if (!res) {
    return {
      items: [], estimated_meals: null, diet: null, cooked_at: null, safe_until: null, pickup_notes: null,
      photo_check: null, missing_fields: [...OFFER_FIELDS],
      followup_question: "Sorry, I couldn't read that. Please type the dishes, number of plates, and until when it's safe.",
      source: "llm",
    };
  }
  return {
    ...finishOffer({
      items: res.items.filter((i) => i.name.trim()),
      estimated_meals: res.estimated_meals, diet: res.diet,
      cooked_at: fixPast(res.cooked_at), safe_until: fixFuture(res.safe_until),
      pickup_notes: res.pickup_notes, photo_check: image ? res.photo_check : null,
      followup_question: res.followup_question,
    }),
    source: "llm",
  };
}

const VEG_FOODS = [
  "biryani", "veg biryani", "pulao", "raita", "dal", "rice", "roti", "chapati", "chapathi", "naan", "sabzi", "paneer",
  "curry", "idli", "dosa", "sambar", "khichdi", "upma", "poha", "noodles", "pasta", "sandwich", "chole", "rajma",
  "bisi bele bath", "curd rice", "lemon rice", "puri", "paratha", "halwa", "kheer", "salad", "fried rice", "meals",
];
const NONVEG_FOODS = ["chicken", "mutton", "fish", "egg", "prawn", "keema", "chicken biryani", "egg curry"];

function findItems(text: string, meals: number | null): OfferItem[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  for (const f of [...NONVEG_FOODS, ...VEG_FOODS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${f}\\b`);
    if (re.test(t) && !found.some((x) => x.includes(f))) found.push(f);
  }
  // "veg biryani" style: keep the adjective with the dish
  return found.map((name) => ({ name: name.replace(/\b\w/g, (c) => c.toUpperCase()), quantity: meals ?? 1, unit: "plates" }));
}

export function mockParseOffer(transcript: string, ref = nowMs()): ParsedOfferNoGuard {
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

  return finishOffer({
    items,
    estimated_meals: meals,
    diet,
    cooked_at: cooked ? resolvePast(cooked, ref) : null,
    safe_until: safe ? resolveFuture(safe, ref) : null,
    pickup_notes: notesM ? notesM[1].replace(/^\w/, (c) => c.toUpperCase()) : null,
    photo_check: null,
  });
}

// ---- demands ----

const DEMAND_FIELDS: DemandMissingField[] = ["people_count", "diet", "needed_by"];
const DEMAND_QUESTION: Record<DemandMissingField, string> = {
  needed_by: "By what time do you need the food?",
  people_count: "How many people do you need food for?",
  diet: "Do you need vegetarian food only, or is anything fine?",
};

function finishDemand(p: Omit<ParsedDemand, "missing_fields" | "followup_question"> & { followup_question?: string | null }): ParsedDemand {
  const missing = DEMAND_FIELDS.filter((f) => p[f] === null);
  let q = p.followup_question ?? null;
  if (!q && missing.length) q = DEMAND_QUESTION[missing.includes("needed_by") ? "needed_by" : missing[0]];
  if (!missing.length) q = null;
  return { ...p, missing_fields: missing, followup_question: q };
}

export async function parseDemand(transcript: string): Promise<ParsedDemand & { source: "llm" | "mock" }> {
  if (config.LLM_PROVIDER === "mock") return { ...mockParseDemand(transcript), source: "mock" };
  const res = await callStructured("demand", demandSystemPrompt(nowMs()), `Recipient's note:\n"""${transcript}"""`, DemandSchema);
  if (!res) {
    return {
      people_count: null, diet: null, needed_by: null, max_distance_km: null, notes: null,
      missing_fields: [...DEMAND_FIELDS],
      followup_question: "Sorry, I couldn't read that. Please type how many people, veg or any, and by what time.",
      source: "llm",
    };
  }
  return { ...finishDemand({ ...res, needed_by: fixFuture(res.needed_by) }), source: "llm" };
}

export function mockParseDemand(transcript: string, ref = nowMs()): ParsedDemand {
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
  return finishDemand({
    people_count: peopleM ? Number(peopleM[1]) : null,
    diet: diet as ParsedDemand["diet"],
    needed_by: by ? resolveFuture(by, ref) : null,
    max_distance_km: kmM ? Number(kmM[1]) : null,
    notes: null,
  });
}

// ---- reply details (numbers / times inside a reply) ----

export async function extractReplyDetails(text: string): Promise<ReplyDetails> {
  if (config.LLM_PROVIDER === "mock") return mockReplyDetails(text);
  const res = await callStructured("reply", replyDetailsSystemPrompt(nowMs()), `Reply:\n"""${text}"""`, ReplyDetailsSchema);
  return res ? { ...res, eta_iso: fixFuture(res.eta_iso) } : mockReplyDetails(text);
}

export function mockReplyDetails(text: string, ref = nowMs()): ReplyDetails {
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
  return { meals: mealsM ? Number(mealsM[1]) : null, eta_iso: eta };
}
