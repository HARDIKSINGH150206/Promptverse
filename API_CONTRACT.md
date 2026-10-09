# AnnaRelay — API Contract v2 (single source of truth)

> Both the backend and frontend build against THIS file. Neither coding agent edits it.
> If a change is needed, propose it in `backend/CONTRACT_CHANGES.md` or `frontend/INTEGRATION_NOTES.md`; a human updates this file and tells both sides.
>
> **v2 adds:** Bayesian reliability with uncertainty, Thompson-sampling exploration, risk-aware standby backups, free-text reply understanding, and Laya decision-model guardrails at intake.
>
> **v2.1 (additive, approved by the team):** `POST /api/transcribe` (multilingual speech-to-text) and the `stt` field on `GET /api/health`. Nothing existing changed.

- Backend base URL (local): `http://localhost:4000`
- Frontend (local): `http://localhost:3000`
- All bodies are JSON unless marked `multipart/form-data`.
- All timestamps are ISO 8601 strings in UTC. The frontend displays them in IST.
- All IDs are strings. All JSON keys are `snake_case`.
- Errors always look like: `{ "error": { "code": "VALIDATION_ERROR", "message": "human readable" } }` with a 4xx/5xx status.

---

## 1. Roles (only two)

| Role | Who | How they interact |
| --- | --- | --- |
| **Restaurant** (donor) | Restaurant, caterer, cafeteria | Web app: voice note + photo + "safe until" + safety checklist |
| **Recipient-collector** | Shelter / orphanage / NGO that picks up food for its own people | Web app to post demand by voice; Telegram (or web inbox fallback) to accept, reconfirm, stand by, reply in free text, mark collected |

No separate volunteer drivers in this MVP. The recipient collects.

---

## 2. Where AI is used (both sides must describe it the same way)

| Job | Model type | Can it change state on its own? |
| --- | --- | --- |
| Turn voice transcripts into structured offers/demands | Generative LLM (configurable provider) | No — user reviews and confirms |
| Intake guardrail: diet check + food-safety concern | **Laya** decision model (probabilities) | No — it can only *add* a confirmation step, never remove one |
| Understand free-text replies ("can only take 12", "stuck in traffic") | **Laya** (intent + at-risk probability) + generative LLM (extract numbers/times) | Only through a fixed rule table, and only when intent probability ≥ 0.70 |
| Who to offer to | **Bayesian reliability + Thompson sampling** (code, no LLM) | Yes — deterministic, logged, explained |
| When to call a backup | **Risk model** (code, no LLM) | Yes — deterministic, logged, explained |

Safety windows, deadlines, matching rules and fallbacks are always plain code.

---

## 3. Shared types (TypeScript notation)

```ts
type Diet = "veg" | "nonveg" | "any";            // "any" only valid on a Demand

type OfferStatus =
  | "open" | "matching" | "assigned" | "collected"
  | "partially_collected" | "fallback" | "expired";

type AssignmentStatus =
  | "offered"            // sent, waiting for Accept/Decline
  | "accepted"
  | "reconfirm_sent"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "no_response"        // timed out -> counts against reliability if at reconfirm
  | "collected"
  | "standby_requested"  // backup asked to stand by (risk was high)
  | "on_standby"         // backup said yes, waiting
  | "released";          // standby no longer needed, or standby declined/timed out

type DemandStatus = "open" | "partially_matched" | "matched" | "fulfilled" | "expired";
type FallbackRoute = "people" | "animal_feed" | "compost";
type AiSource = "laya" | "llm" | "mock" | "fallback_rules";

interface OfferItem { name: string; quantity: number; unit: string }

interface IntakeGuardrail {
  source: AiSource;
  diet_check: { label: "veg" | "nonveg"; probability: number; agrees_with_extraction: boolean } | null;
  safety_concern_probability: number | null;   // 0..1; > 0.30 shows a warning
  needs_confirmation: boolean;                 // true -> UI shows a prominent warning with reasons
  reasons: string[];                           // e.g. "Diet unclear (veg 71%)", "Message mentions food left out since afternoon"
}

interface ParsedOffer {
  items: OfferItem[];
  estimated_meals: number | null;
  diet: "veg" | "nonveg" | null;
  cooked_at: string | null;
  safe_until: string | null;
  pickup_notes: string | null;
  photo_check: { matches_description: boolean | null; note: string } | null; // advisory only
  missing_fields: ("estimated_meals" | "diet" | "cooked_at" | "safe_until")[];
  followup_question: string | null;
  guardrail: IntakeGuardrail;
}

interface ParsedDemand {
  people_count: number | null;
  diet: Diet | null;
  needed_by: string | null;
  max_distance_km: number | null;
  notes: string | null;
  missing_fields: ("people_count" | "diet" | "needed_by")[];
  followup_question: string | null;
}

interface Restaurant { id: string; name: string; area: string; lat: number; lng: number }

interface ReliabilityScore {
  p_complete: number;           // Bayesian mean: (completed + 1) / (completed + failures + 2)
  interval_90: [number, number];// 90% credible interval, e.g. [0.73, 0.96]
  observations: number;         // completed + cancelled + no_show
  proximity: number;            // 0..1
  responsiveness: number;       // 0..1
  total: number;                // 0.60*p_complete + 0.25*proximity + 0.15*responsiveness
  explanation: string;          // "18 of 20 pickups completed (86%, likely 73–96%), 1.2 km, replies in ~2 min"
  is_simulated_history: boolean;
}

interface Recipient {
  id: string; name: string; type: "shelter" | "orphanage" | "old_age_home" | "ngo";
  area: string; lat: number; lng: number;
  telegram_linked: boolean; link_code: string;
  stats: { completed: number; cancelled: number; no_show: number; avg_response_secs: number };
  reliability: ReliabilityScore;
}

interface Demand {
  id: string; recipient_id: string; recipient_name: string;
  people_count: number; meals_matched: number;
  diet: Diet; needed_by: string; max_distance_km: number;
  notes: string | null; status: DemandStatus; raw_transcript: string | null; created_at: string;
}

type ReplyIntent =
  | "accept_full" | "accept_partial" | "decline" | "cancel"
  | "still_coming" | "running_late" | "question";

interface ReplyUnderstanding {
  text: string;
  source: AiSource;
  intent: ReplyIntent;
  intent_probability: number;                 // probability of the chosen intent
  probabilities: Record<ReplyIntent, number>;
  at_risk_probability: number;                // chance the reply signals they may not make it in time
  meals: number | null;                       // extracted for accept_partial
  eta: string | null;                         // extracted for running_late (ISO)
  needs_clarification: boolean;               // true when intent_probability < 0.70
  clarification_question: string | null;
  action_taken: string;                       // "Accepted 12 of 20 meals; re-matching 8" | "No change — asked to clarify"
}

interface SelectionInfo {
  method: "thompson" | "mean";                // mean when time is short or THOMPSON_SAMPLING=off
  sampled_p_complete: number | null;          // the random draw used for ranking (thompson only)
  explored: boolean;                          // true if picked over a candidate with a higher mean
  reason: string;                             // human sentence
}

interface Assignment {
  id: string; offer_id: string; recipient_id: string; recipient_name: string; demand_id: string;
  meals: number; status: AssignmentStatus;
  reliability_at_assignment: number;          // p_complete at the time
  selection: SelectionInfo;
  distance_km: number;
  offered_at: string;
  respond_by: string;
  accepted_at: string | null;
  reconfirm_by: string | null;
  collected_at: string | null;
  eta_promised: string | null;
  p_fail: number | null;                      // current failure risk for active assignments
  is_standby: boolean;
  standby_for_assignment_id: string | null;   // set on standby assignments
  last_reply: ReplyUnderstanding | null;
}

interface TimelineEvent {
  id: string; offer_id: string; at: string;
  type:
    | "offer_created" | "guardrail_flag" | "matching_started" | "offered" | "exploration"
    | "accepted" | "declined" | "reconfirm_sent" | "confirmed" | "cancelled" | "no_response"
    | "reply_understood" | "risk_check" | "backup_alerted" | "standby_ready"
    | "standby_promoted" | "standby_released"
    | "rematch" | "split" | "collected" | "fallback" | "expired" | "note";
  message: string;
  assignment_id: string | null;
}

interface Offer {
  id: string; restaurant_id: string; restaurant_name: string;
  items: OfferItem[]; meal_count: number; meals_assigned: number; meals_collected: number;
  diet: "veg" | "nonveg"; cooked_at: string; safe_until: string;
  photo_url: string | null; raw_transcript: string | null; pickup_notes: string | null;
  status: OfferStatus; fallback_route: FallbackRoute | null; created_at: string;
}

interface OfferDetail extends Offer {
  assignments: Assignment[];                  // includes standby assignments
  timeline: TimelineEvent[];                  // oldest first
  minutes_left: number;
  risk: { highest_p_fail: number; threshold: number; standby_active: boolean };
}

interface BoardStats {
  offers_total: number;
  offers_collected_within_window: number;
  share_collected_within_window: number;      // headline metric
  meals_rescued: number;
  dropouts_caught: number;                    // cancelled + no_response that were re-matched or covered by standby
  backups_promoted: number;
  replies_understood: number;
  fallback_count: number;
  is_simulated: boolean;
}

interface Board {
  offers: Offer[]; demands: Demand[]; recipients: Recipient[];
  stats: BoardStats; server_time: string;
  ai_status: { llm: "ready" | "mock" | "missing_key"; laya: "ready" | "mock" | "missing_key" | "unavailable" };
}

interface CreateOfferBody {
  restaurant_id: string; items: OfferItem[]; meal_count: number; diet: "veg" | "nonveg";
  cooked_at: string; safe_until: string; photo_url: string | null;
  raw_transcript: string | null; pickup_notes: string | null;
  confirmations: {
    diet_confirmed: boolean;                  // must be true
    safety_checklist_confirmed: boolean;      // must be true: covered, kept hot or chilled, never served on plates
  };
}

interface CreateDemandBody {
  recipient_id: string; people_count: number; diet: Diet; needed_by: string;
  max_distance_km: number; notes: string | null; raw_transcript: string | null;
}

interface ImpactCard {
  restaurant_id: string; restaurant_name: string; period_label: string;
  meals_rescued: number; offers_made: number; share_collected_within_window: number;
  fallback_count: number; is_simulated: boolean;
}

type AssignmentAction =
  | "accept" | "decline" | "reconfirm" | "cancel" | "collected"
  | "standby_accept" | "standby_decline";
```

---

## 4. Endpoints

### Health
`GET /api/health` → `{ "ok": true, "llm": "ready"|"mock"|"missing_key", "laya": "ready"|"mock"|"missing_key"|"unavailable", "telegram": "ready"|"disabled", "stt": "ready"|"missing_key"|"disabled" }`

`stt` (added in v2.1) reports server-side speech-to-text for `POST /api/transcribe`. Clients must tolerate it being absent.

### Directory
- `GET /api/restaurants` → `Restaurant[]`
- `GET /api/recipients` → `Recipient[]`

### Offers
1. `POST /api/offers/parse` — `multipart/form-data`: `transcript` (required), `photo` (optional), `restaurant_id` → `200 { "parsed": ParsedOffer, "photo_url": string | null }`
2. `POST /api/offers` — `CreateOfferBody` → `201 OfferDetail` (starts matching automatically)
   - `400 VALIDATION_ERROR`: `safe_until` past or before `cooked_at`, `meal_count < 1`
   - `400 CONFIRMATION_REQUIRED`: either confirmation is not `true`
3. `GET /api/offers/:id` → `OfferDetail`

### Demands
1. `POST /api/demands/parse` — `multipart/form-data`: `transcript`, `recipient_id` → `200 { "parsed": ParsedDemand }`
2. `POST /api/demands` — `CreateDemandBody` → `201 Demand` (triggers matching for offers still `matching`)

### Speech-to-text (v2.1, optional)
`POST /api/transcribe`: `multipart/form-data` with `audio` (required; webm / ogg / wav / mp3 / m4a, under 30 s), `language_code` (optional, default `"unknown"` = auto-detect; e.g. `en-IN`, `hi-IN`, `kn-IN`, `ta-IN`), and `mode` (optional, provider-specific).
→ `200 { "text": string, "language_code": string | null, "language_probability": number | null, "source": "sarvam" | "groq" }`
- `400 VALIDATION_ERROR`: no audio, or not an audio file
- `503 STT_UNAVAILABLE`: every provider failed. The client falls back to the browser Web Speech API or the editable textarea.

Multilingual and code-mixed speech is supported (Sarvam first, Groq Whisper as fallback). The client puts `text` into the editable transcript box and sends it to the existing `/parse` call as `transcript`. Transcription never creates or changes anything by itself.

### Live board (polled every 2 s)
`GET /api/board` → `Board`

### Assignment actions (Telegram handlers and the web inbox both use these)
`POST /api/assignments/:id/<action>` where `<action>` is one of `accept | decline | reconfirm | cancel | collected | standby_accept | standby_decline` → `200 OfferDetail`, or `409 INVALID_TRANSITION`.

### Free-text reply (new)
`POST /api/assignments/:id/reply` — `{ "text": "traffic is bad, reaching by 9:45" }` → `200 { "understood": ReplyUnderstanding, "offer": OfferDetail }`
Telegram free-text messages from a linked chat go through the same logic (applied to that recipient's most recent active or standby assignment).

### Recipient web inbox
`GET /api/collector/:recipientId/inbox` → `{ "recipient": Recipient, "assignments": (Assignment & { offer: Offer })[] }` — statuses `offered`, `accepted`, `reconfirm_sent`, `confirmed`, `standby_requested`, `on_standby`.

### Impact card (stretch)
`GET /api/impact/:restaurantId` → `ImpactCard`

### Demo controls (labelled "Demo control" in the UI)
- `POST /api/demo/reset` → `{ "ok": true }`
- `POST /api/demo/fast-forward/:assignmentId` → moves the active deadline (`respond_by` or `reconfirm_by`) to now → `OfferDetail`

### Static files
`GET /uploads/<file>`

---

## 5. Status rules

```
Primary:   offered --accept--> accepted --(RECONFIRM_AFTER)--> reconfirm_sent --reconfirm--> confirmed --collected--> collected
           offered --decline/timeout--> declined/no_response            => re-match meals
           accepted|reconfirm_sent|confirmed --cancel--> cancelled      => promote standby if on_standby, else re-match
           reconfirm_sent --timeout--> no_response (no_show++)          => promote standby if on_standby, else re-match

Standby:   standby_requested --standby_accept--> on_standby
           standby_requested --standby_decline/timeout--> released       (no penalty)
           on_standby --(primary fails)--> accepted  (skips the offer step; event "standby_promoted")
           on_standby|standby_requested --(primary collected / offer done)--> released

Risk:      for each active primary (accepted|reconfirm_sent|confirmed):
             p_fail = 1 if eta_promised > safe_until - PICKUP_BUFFER
                      else 1 - p_complete * (1 - latest_reply_at_risk)
             if p_fail > RISK_THRESHOLD (0.25) and no standby exists for it -> request standby
             from the next best eligible recipient for the same meals

Reply:     apply only if intent_probability >= 0.70, using the fixed table in the backend plan;
           otherwise no state change and ask a clarification question

Offer:     open -> matching -> assigned -> collected ; any stage -> fallback / partially_collected when nobody can make it in time
```

Timers (demo-scaled backend env): `ACCEPT_TIMEOUT_SECS=45`, `RECONFIRM_AFTER_SECS=20`, `RECONFIRM_TIMEOUT_SECS=30`, `STANDBY_TIMEOUT_SECS=45`, `PICKUP_BUFFER_MINS=20`, `RISK_THRESHOLD=0.25`, `EXPLORE_MIN_SLACK_MINS=90`.
