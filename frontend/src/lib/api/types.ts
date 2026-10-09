// Shared types from API_CONTRACT.md v2. Keep in sync with the contract; never diverge.

export type Diet = "veg" | "nonveg" | "any";

export type OfferStatus =
  | "open" | "matching" | "assigned" | "collected"
  | "partially_collected" | "fallback" | "expired";

export type AssignmentStatus =
  | "offered"
  | "accepted"
  | "reconfirm_sent"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "no_response"
  | "collected"
  | "standby_requested"
  | "on_standby"
  | "released";

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

export interface CreateOfferBody {
  restaurant_id: string; items: OfferItem[]; meal_count: number; diet: "veg" | "nonveg";
  cooked_at: string; safe_until: string; photo_url: string | null;
  raw_transcript: string | null; pickup_notes: string | null;
  confirmations: {
    diet_confirmed: boolean;
    safety_checklist_confirmed: boolean;
  };
}

export interface CreateDemandBody {
  recipient_id: string; people_count: number; diet: Diet; needed_by: string;
  max_distance_km: number; notes: string | null; raw_transcript: string | null;
}

export interface ImpactCard {
  restaurant_id: string; restaurant_name: string; period_label: string;
  meals_rescued: number; offers_made: number; share_collected_within_window: number;
  fallback_count: number; is_simulated: boolean;
}

export type AssignmentAction =
  | "accept" | "decline" | "reconfirm" | "cancel" | "collected"
  | "standby_accept" | "standby_decline";

export interface Health {
  ok: boolean;
  llm: LlmStatus;
  laya: LayaStatus;
  telegram: "ready" | "disabled";
  /** Additive field proposed in backend/CONTRACT_CHANGES.md; absent on older backends. */
  stt?: "ready" | "missing_key" | "disabled";
}

/** POST /api/transcribe (backend/CONTRACT_CHANGES.md #1, optional). */
export interface Transcription {
  text: string;
  language_code: string | null;
  language_probability: number | null;
  source: string;
}

export type InboxEntry = Assignment & { offer: Offer };

export interface Inbox { recipient: Recipient; assignments: InboxEntry[] }

export interface Api {
  health(): Promise<Health>;
  restaurants(): Promise<Restaurant[]>;
  recipients(): Promise<Recipient[]>;
  parseOffer(input: { restaurant_id: string; transcript: string; photo?: File }): Promise<{ parsed: ParsedOffer; photo_url: string | null }>;
  createOffer(body: CreateOfferBody): Promise<OfferDetail>;
  getOffer(id: string): Promise<OfferDetail>;
  parseDemand(input: { recipient_id: string; transcript: string }): Promise<{ parsed: ParsedDemand }>;
  createDemand(body: CreateDemandBody): Promise<Demand>;
  board(): Promise<Board>;
  assignmentAction(id: string, action: AssignmentAction): Promise<OfferDetail>;
  reply(id: string, text: string): Promise<{ understood: ReplyUnderstanding; offer: OfferDetail }>;
  collectorInbox(recipientId: string): Promise<Inbox>;
  impact(restaurantId: string): Promise<ImpactCard>;
  demoReset(): Promise<{ ok: true }>;
  demoFastForward(assignmentId: string): Promise<OfferDetail>;
  transcribe(input: { audio: Blob; language_code?: string }): Promise<Transcription>;
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 0) {
    super(message);
    this.name = "ApiError";
  }
}

/** Human message for any thrown value, with the contract's special cases. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "INVALID_TRANSITION") return "Someone already updated this. Showing the latest state.";
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
