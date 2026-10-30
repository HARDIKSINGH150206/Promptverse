// Pure builders: plain data in, a paperwork record out. No database, no clock unless passed `now`.
import crypto from "node:crypto";
import { config } from "../config";
import type { Offer, RecipientType } from "../domain/types";
import { checkFssai } from "./fssai";
import type {
  ComplianceInfo, Confirmation, DeclarationInput, DonationDeclaration, HandoverInput, HandoverNote, Party, Register, RegisterRow,
} from "./types";

// The statements the voice agent's read-back and safety checklist ask the donor to confirm, worded
// as asked. One spoken "yes" to the checklist covers all three of its statements.
export const DIET_STATEMENT = "Food details read back to the donor and confirmed, including that it is";
export const CHECKLIST = [
  "The food was kept covered",
  "The food was kept hot or refrigerated",
  "The food was never served on anyone's plate",
] as const;

/** Stable JSON (sorted keys) so the same content always hashes the same. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/**
 * A short hash of the record's content (excluding when it was generated). Reprinting gives the same
 * fingerprint; any edit to the facts changes it. It shows tampering, it is not a signature.
 */
export function fingerprint(doc: Record<string, unknown>): string {
  const { fingerprint: _f, generated_at: _g, ...facts } = doc;
  void _f;
  void _g;
  const hex = crypto.createHash("sha256").update(canonical(facts)).digest("hex").slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join("-");
}

/** YYYYMMDD in the local time zone. */
export function localDate(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: config.TZ_NAME, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return p.replace(/-/g, "");
}

const tail = (id: string) => id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();

export function party(
  base: { id: string; name: string; area: string },
  type: "restaurant" | RecipientType,
  info: ComplianceInfo | null | undefined,
): Party {
  const check = checkFssai(info?.fssai_number);
  return {
    id: base.id, name: base.name, area: base.area, type,
    address: info?.address ?? null,
    contact_person: info?.contact_person ?? null,
    // a number that fails the format check is never shown as verified
    fssai: { number: check.normalized ?? info?.fssai_number ?? null, check, verified: !!info?.verified && check.valid },
  };
}

function statusOf(offer: Offer): DonationDeclaration["status"] {
  if (offer.status === "collected") return "collected";
  if (offer.status === "partially_collected") return "partially_collected";
  if (offer.status === "fallback" || offer.status === "expired") return "not_collected";
  return "awaiting_pickup";
}

/** The record made the moment a donation is listed: what was offered and what the donor confirmed. */
export function buildDeclaration(input: DeclarationInput): DonationDeclaration {
  const { offer, call, guardrail } = input;
  const now = input.now ?? Date.now();
  const evidence = call ? `voice call ${call.call_id}` : null;
  const dietAt = call?.diet_confirmed_at ?? input.confirmed_at ?? offer.created_at;
  const safetyAt = call?.safety_confirmed_at ?? input.confirmed_at ?? offer.created_at;
  // offers only exist once both confirmations were given (domain/intake enforces it)
  const confirmations: Confirmation[] = [
    {
      statement: `${DIET_STATEMENT} ${offer.diet === "veg" ? "vegetarian" : "non-vegetarian"}`,
      confirmed: true, method: input.method, at: dietAt, evidence,
    },
    ...CHECKLIST.map((statement) => ({ statement, confirmed: true, method: input.method, at: safetyAt, evidence })),
  ];
  const doc: DonationDeclaration = {
    kind: "donation_declaration",
    doc_no: `DD-${localDate(offer.created_at)}-${tail(offer.id)}`,
    generated_at: new Date(now).toISOString(),
    offer_id: offer.id,
    donor: party(input.donor, "restaurant", input.compliance),
    food: {
      items: offer.items,
      meal_count: offer.meal_count,
      diet: offer.diet,
      cooked_at: offer.cooked_at,
      safe_until: offer.safe_until,
      hold_hours: Math.round(((Date.parse(offer.safe_until) - Date.parse(offer.cooked_at)) / 3600_000) * 10) / 10,
      pickup_notes: offer.pickup_notes,
    },
    confirmations,
    ai_check: guardrail
      ? {
        source: guardrail.source,
        needs_confirmation: guardrail.needs_confirmation,
        diet_label: guardrail.diet_check?.label ?? null,
        diet_probability: guardrail.diet_check?.probability ?? null,
        safety_concern_probability: guardrail.safety_concern_probability,
        notes: guardrail.reasons,
      }
      : null,
    call: call ?? null,
    donor_words: call?.transcript ?? offer.raw_transcript ?? null,
    status: statusOf(offer),
    sample: !!input.sample,
    fingerprint: "",
  };
  doc.fingerprint = fingerprint(doc as unknown as Record<string, unknown>);
  return doc;
}

/** The record made when a collector picks the food up. Throws unless the pickup actually happened. */
export function buildHandover(input: HandoverInput): HandoverNote {
  const { declaration: d, assignment: a } = input;
  if (a.status !== "collected" || !a.collected_at) {
    throw new Error(`Assignment ${a.id} isn't collected yet (status ${a.status}), so there is no handover to record`);
  }
  if (a.offer_id !== d.offer_id) throw new Error(`Assignment ${a.id} belongs to offer ${a.offer_id}, not ${d.offer_id}`);
  const now = input.now ?? Date.now();
  const spare = Math.round((Date.parse(d.food.safe_until) - Date.parse(a.collected_at)) / 60000);
  const received = input.received ?? { at: a.collected_at, method: "unknown" as const };
  const doc: HandoverNote = {
    kind: "handover_note",
    doc_no: `HN-${localDate(a.collected_at)}-${tail(a.id)}`,
    declaration_no: d.doc_no,
    generated_at: new Date(now).toISOString(),
    offer_id: d.offer_id,
    assignment_id: a.id,
    donor: d.donor,
    recipient: party(input.recipient, input.recipient.type, input.compliance),
    food: { items: d.food.items, meals: a.meals, diet: d.food.diet, cooked_at: d.food.cooked_at, safe_until: d.food.safe_until },
    picked_up_at: a.collected_at,
    within_safe_window: spare >= 0,
    minutes_to_spare: spare,
    confirmations: [
      ...d.confirmations,
      { statement: `${a.meals} meals received by ${input.recipient.name}`, confirmed: true, method: received.method, at: received.at, evidence: null },
    ],
    sample: d.sample,
    fingerprint: "",
  };
  doc.fingerprint = fingerprint(doc as unknown as Record<string, unknown>);
  return doc;
}

/** A month's donations, one row each. `rows` come pre-built (see fromDb.ts or a test). */
export function buildRegister(period: string, rows: RegisterRow[], opts: { donorId?: string | null; sample?: boolean; now?: number } = {}): Register {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error(`period must be YYYY-MM, got ${period}`);
  const sorted = [...rows].sort((x, y) => x.cooked_at.localeCompare(y.cooked_at));
  const doc: Register = {
    kind: "register",
    period,
    donor_id: opts.donorId ?? null,
    generated_at: new Date(opts.now ?? Date.now()).toISOString(),
    rows: sorted,
    totals: {
      donations: sorted.length,
      meals_offered: sorted.reduce((n, r) => n + r.meals_offered, 0),
      meals_collected: sorted.reduce((n, r) => n + r.meals_collected, 0),
      collected_in_window: sorted.filter((r) => r.picked_up_at && r.picked_up_at <= r.safe_until).length,
    },
    sample: !!opts.sample,
    fingerprint: "",
  };
  doc.fingerprint = fingerprint(doc as unknown as Record<string, unknown>);
  return doc;
}
