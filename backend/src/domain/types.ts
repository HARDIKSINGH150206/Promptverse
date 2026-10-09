// Copy of the shared types in API_CONTRACT.md. Keep in sync with the contract; do not diverge.

export type Diet = "veg" | "nonveg" | "any";

export type OfferStatus =
  | "open" | "matching" | "assigned" | "collected"
  | "partially_collected" | "fallback" | "expired";

export type AssignmentStatus =
  | "offered" | "accepted" | "reconfirm_sent" | "confirmed" | "declined" | "cancelled"
  | "no_response" | "collected" | "standby_requested" | "on_standby" | "released";

export type DemandStatus = "open" | "partially_matched" | "matched" | "fulfilled" | "expired";
export type FallbackRoute = "people" | "animal_feed" | "compost";
export type AiSource = "laya" | "llm" | "mock" | "fallback_rules";

export interface OfferItem { name: string; quantity: number; unit: string }

export interface IntakeGuardrail {
  source: AiSource;
  diet_check: { label: "veg" | "nonveg"; probability: number; agrees_with_extraction: boolean } | null;
  safety_concern_probability: number | null;
  needs_confirmation: boolean;
  reasons: string[];
}

export type OfferMissingField = "estimated_meals" | "diet" | "cooked_at" | "safe_until";
export type DemandMissingField = "people_count" | "diet" | "needed_by";

export interface ParsedOffer {
  items: OfferItem[];
  estimated_meals: number | null;
  diet: "veg" | "nonveg" | null;
  cooked_at: string | null;
  safe_until: string | null;
  pickup_notes: string | null;
  photo_check: { matches_description: boolean | null; note: string } | null;
  missing_fields: OfferMissingField[];
  followup_question: string | null;
  guardrail: IntakeGuardrail;
}

export interface ParsedDemand {
  people_count: number | null;
  diet: Diet | null;
  needed_by: string | null;
  max_distance_km: number | null;
  notes: string | null;
  missing_fields: DemandMissingField[];
  followup_question: string | null;
}

export interface Restaurant { id: string; name: string; area: string; lat: number; lng: number }

export interface ReliabilityScore {
  p_complete: number;
  interval_90: [number, number];
  observations: number;
  proximity: number;
  responsiveness: number;
  total: number;
  explanation: string;
  is_simulated_history: boolean;
}

export type RecipientType = "shelter" | "orphanage" | "old_age_home" | "ngo";

export interface Recipient {
  id: string; name: string; type: RecipientType;
  area: string; lat: number; lng: number;
  telegram_linked: boolean; link_code: string;
  stats: { completed: number; cancelled: number; no_show: number; avg_response_secs: number };
  reliability: ReliabilityScore;
}

export interface Demand {
  id: string; recipient_id: string; recipient_name: string;
  people_count: number; meals_matched: number;
  diet: Diet; needed_by: string; max_distance_km: number;
  notes: string | null; status: DemandStatus; raw_transcript: string | null; created_at: string;
}

export type ReplyIntent =
  | "accept_full" | "accept_partial" | "decline" | "cancel"
  | "still_coming" | "running_late" | "question";

export const REPLY_INTENTS: ReplyIntent[] = [
  "accept_full", "accept_partial", "decline", "cancel", "still_coming", "running_late", "question",
];

export interface ReplyUnderstanding {
  text: string;
  source: AiSource;
  intent: ReplyIntent;
  intent_probability: number;
  probabilities: Record<ReplyIntent, number>;
  at_risk_probability: number;
  meals: number | null;
  eta: string | null;
  needs_clarification: boolean;
  clarification_question: string | null;
  action_taken: string;
}

export interface SelectionInfo {
  method: "thompson" | "mean";
  sampled_p_complete: number | null;
  explored: boolean;
  reason: string;
}

export interface Assignment {
  id: string; offer_id: string; recipient_id: string; recipient_name: string; demand_id: string;
  meals: number; status: AssignmentStatus;
  reliability_at_assignment: number;
  selection: SelectionInfo;
  distance_km: number;
  offered_at: string;
  respond_by: string;
  accepted_at: string | null;
  reconfirm_by: string | null;
  collected_at: string | null;
  eta_promised: string | null;
  p_fail: number | null;
  is_standby: boolean;
  standby_for_assignment_id: string | null;
  last_reply: ReplyUnderstanding | null;
}

export type TimelineEventType =
  | "offer_created" | "guardrail_flag" | "matching_started" | "offered" | "exploration"
  | "accepted" | "declined" | "reconfirm_sent" | "confirmed" | "cancelled" | "no_response"
  | "reply_understood" | "risk_check" | "backup_alerted" | "standby_ready"
  | "standby_promoted" | "standby_released"
  | "rematch" | "split" | "collected" | "fallback" | "expired" | "note";

export interface TimelineEvent {
  id: string; offer_id: string; at: string;
  type: TimelineEventType;
  message: string;
  assignment_id: string | null;
}

export interface Offer {
  id: string; restaurant_id: string; restaurant_name: string;
  items: OfferItem[]; meal_count: number; meals_assigned: number; meals_collected: number;
  diet: "veg" | "nonveg"; cooked_at: string; safe_until: string;
  photo_url: string | null; raw_transcript: string | null; pickup_notes: string | null;
  status: OfferStatus; fallback_route: FallbackRoute | null; created_at: string;
}

export interface OfferDetail extends Offer {
  assignments: Assignment[];
  timeline: TimelineEvent[];
  minutes_left: number;
  risk: { highest_p_fail: number; threshold: number; standby_active: boolean };
}

export interface BoardStats {
  offers_total: number;
  offers_collected_within_window: number;
  share_collected_within_window: number;
  meals_rescued: number;
  dropouts_caught: number;
  backups_promoted: number;
  replies_understood: number;
  fallback_count: number;
  is_simulated: boolean;
}

export type LlmStatus = "ready" | "mock" | "missing_key";
export type LayaStatus = "ready" | "mock" | "missing_key" | "unavailable";

export interface Board {
  offers: Offer[]; demands: Demand[]; recipients: Recipient[];
  stats: BoardStats; server_time: string;
  ai_status: { llm: LlmStatus; laya: LayaStatus };
}

export interface ImpactCard {
  restaurant_id: string; restaurant_name: string; period_label: string;
  meals_rescued: number; offers_made: number; share_collected_within_window: number;
  fallback_count: number; is_simulated: boolean;
}

export type AssignmentAction =
  | "accept" | "decline" | "reconfirm" | "cancel" | "collected"
  | "standby_accept" | "standby_decline";

// ---- DB row shapes ----

export interface RestaurantRow { id: string; name: string; area: string; lat: number; lng: number }

export interface RecipientRow {
  id: string; name: string; type: RecipientType; area: string; lat: number; lng: number;
  telegram_chat_id: string | null; link_code: string;
  completed: number; cancelled: number; no_show: number; avg_response_secs: number;
  is_simulated_history: number;
}

export interface DemandRow {
  id: string; recipient_id: string; people_count: number; meals_matched: number;
  diet: Diet; needed_by: string; max_distance_km: number; notes: string | null;
  status: DemandStatus; raw_transcript: string | null; created_at: string;
}

export interface OfferRow {
  id: string; restaurant_id: string; items_json: string; meal_count: number;
  meals_assigned: number; meals_collected: number; diet: "veg" | "nonveg";
  cooked_at: string; safe_until: string; photo_url: string | null; raw_transcript: string | null;
  pickup_notes: string | null; status: OfferStatus; fallback_route: FallbackRoute | null; created_at: string;
}

export interface AssignmentRow {
  id: string; offer_id: string; recipient_id: string; demand_id: string;
  meals: number; status: AssignmentStatus;
  reliability_at_assignment: number; selection_json: string; distance_km: number;
  offered_at: string; respond_by: string;
  accepted_at: string | null; reconfirm_by: string | null; collected_at: string | null;
  eta_promised: string | null; p_fail: number | null;
  is_standby: number; standby_for_assignment_id: string | null;
  last_reply_json: string | null; was_rematched: number;
}

export interface EventRow {
  id: string; offer_id: string; at: string; type: TimelineEventType; message: string;
  assignment_id: string | null;
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
