// Shapes of the generated paperwork. Builders take plain data (no database), so the same documents
// can come from a voice call, a web form, a test or a script.
import type { Assignment, Diet, IntakeGuardrail, Offer, OfferItem, RecipientType } from "../domain/types";
import type { FssaiCheck } from "./fssai";

/** What we know about a party's food-safety registration. Not stored in the DB yet: passed in. */
export interface ComplianceInfo {
  fssai_number?: string | null;
  /** true only after someone checked the number on FSSAI's portal; a format check isn't verification */
  verified?: boolean;
  address?: string | null;
  contact_person?: string | null;
}

export interface ComplianceLookup {
  restaurant: (id: string) => ComplianceInfo | null;
  recipient: (id: string) => ComplianceInfo | null;
}

export const NO_COMPLIANCE: ComplianceLookup = { restaurant: () => null, recipient: () => null };

export interface Party {
  id: string;
  name: string;
  area: string;
  type: "restaurant" | RecipientType;
  address: string | null;
  contact_person: string | null;
  fssai: { number: string | null; check: FssaiCheck; verified: boolean };
}

export type ConfirmMethod = "voice_call" | "web_form" | "telegram" | "unknown";

/** One statement the donor or collector confirmed, how, and when. */
export interface Confirmation {
  statement: string;
  confirmed: boolean;
  method: ConfirmMethod;
  at: string | null;
  evidence: string | null; // e.g. the call id the answer was given on
}

/** Details of the voice call, when the offer came from one (passed in by the call, not from the DB). */
export interface CallRecord {
  call_id: string;
  language: string | null;
  transcript: string | null;
  diet_confirmed_at: string | null;
  safety_confirmed_at: string | null;
}

export interface DonationDeclaration {
  kind: "donation_declaration";
  doc_no: string;
  generated_at: string;
  offer_id: string;
  donor: Party;
  food: {
    items: OfferItem[];
    meal_count: number;
    diet: "veg" | "nonveg";
    cooked_at: string;
    safe_until: string;
    hold_hours: number; // cooked -> safe until
    pickup_notes: string | null;
  };
  confirmations: Confirmation[];
  ai_check: {
    source: string;
    needs_confirmation: boolean;
    diet_label: "veg" | "nonveg" | null;
    diet_probability: number | null;
    safety_concern_probability: number | null;
    notes: string[];
  } | null;
  call: CallRecord | null;
  /** the donor's own words: the call transcript, or what the offer stored */
  donor_words: string | null;
  status: "awaiting_pickup" | "collected" | "partially_collected" | "not_collected";
  sample: boolean;
  fingerprint: string;
}

export interface HandoverNote {
  kind: "handover_note";
  doc_no: string;
  declaration_no: string;
  generated_at: string;
  offer_id: string;
  assignment_id: string;
  donor: Party;
  recipient: Party;
  food: { items: OfferItem[]; meals: number; diet: "veg" | "nonveg"; cooked_at: string; safe_until: string };
  picked_up_at: string;
  within_safe_window: boolean;
  minutes_to_spare: number; // safe_until - pickup
  confirmations: Confirmation[];
  sample: boolean;
  fingerprint: string;
}

export interface RegisterRow {
  date: string; // YYYY-MM-DD, local
  doc_no: string;
  offer_id: string;
  donor: string;
  donor_fssai: string | null;
  food: string;
  diet: Diet;
  meals_offered: number;
  meals_collected: number;
  cooked_at: string;
  safe_until: string;
  collected_by: string; // recipient names, "; "-separated
  picked_up_at: string | null; // the last pickup
  outcome: string;
  safety_confirmed: boolean;
}

export interface Register {
  kind: "register";
  period: string; // YYYY-MM
  donor_id: string | null; // null = every donor
  generated_at: string;
  rows: RegisterRow[];
  totals: { donations: number; meals_offered: number; meals_collected: number; collected_in_window: number };
  sample: boolean;
  fingerprint: string;
}

export type Paperwork = DonationDeclaration | HandoverNote | Register;

export interface DeclarationInput {
  offer: Offer;
  donor: { id: string; name: string; area: string };
  compliance?: ComplianceInfo | null;
  guardrail?: IntakeGuardrail | null;
  method: ConfirmMethod;
  /** fallback time for both confirmations when no call record says exactly */
  confirmed_at?: string | null;
  call?: CallRecord | null;
  sample?: boolean;
  now?: number;
}

export interface HandoverInput {
  declaration: DonationDeclaration;
  assignment: Assignment;
  recipient: { id: string; name: string; area: string; type: RecipientType };
  compliance?: ComplianceInfo | null;
  /** how the collector confirmed the pickup (e.g. the Telegram "collected" tap) */
  received?: { at: string; method: ConfirmMethod } | null;
  now?: number;
}
