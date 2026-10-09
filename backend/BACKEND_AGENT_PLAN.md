# AnnaRelay — Backend + AI Build Plan v2 (for the backend coding agent)

## 0. HARD RULES — read before doing anything

1. **You work ONLY inside the `backend/` folder.** Create, edit and delete files only under `backend/`.
2. **Never touch `frontend/`.** Do not edit it, do not run commands that write into it, do not add root-level files. You may *read* `frontend/INTEGRATION_NOTES.md` to see what the frontend needs.
3. **Never edit `contract/API_CONTRACT.md`.** It is the single source of truth. Proposals go in `backend/CONTRACT_CHANGES.md`; keep building to the current contract until a human confirms.
4. No root `package.json`, no monorepo tooling. `backend/` is a standalone project.
5. Git: only stage `backend/` (`git add backend/`). `git pull --rebase` before pushing.
6. Honesty: seeded data is flagged (`is_simulated_history`, `is_simulated`). Never present simulated numbers as real.
7. **AI never makes a safety or matching decision on its own.** Laya and the LLM produce probabilities and extracted fields; plain, tested TypeScript decides what happens.

## 1. What we are building (plain English)

AnnaRelay rescues surplus cooked food and makes sure it is actually collected before it stops being safe.

- **Recipients** (shelters, orphanages, NGOs that collect for their own people) say by voice what they need today.
- **Restaurants** say by voice what's left, add a photo, say until when it's safe, and tick a short safety checklist.
- A generative LLM turns both transcripts into structured data. **Laya**, a decision model, double-checks diet and flags food-safety concerns with probabilities.
- The engine offers food only to recipients who already need it, ranked by a **Bayesian reliability estimate**, with **Thompson sampling** so newer recipients occasionally get a chance when there's time to spare.
- A **risk model** watches every accepted pickup. If the chance of failure gets too high, for example a shaky track record or a reply like "stuck in traffic" (understood by Laya), it asks the next-best recipient to **stand by**. If the first recipient drops out, the standby takes over instantly.
- Recipients can reply in **free text** on Telegram ("we can only take 12"); Laya classifies the intent and the engine applies it through a fixed rule table.
- If nobody can make it in time: animal feed or compost, recorded. Every offer ends with a recorded outcome.

Headline metric: **share of offers collected within their safe window.**

## 2. Stack

- Node.js 20+, TypeScript, Express, `tsx` for dev
- SQLite via `better-sqlite3`
- `zod` (validate every request body and every AI output)
- `multer` (photos in `backend/uploads/`, served at `/uploads/*`)
- `grammy` (Telegram bot, long polling)
- `cors`, `vitest`
- Generative LLM: adapter in `src/ai/llm.ts`, one real provider chosen by `LLM_PROVIDER` (gemini | openai | anthropic) using that provider's official SDK — **read its current docs for JSON output and image input before coding; don't guess method names** — plus `mock`.
- **Laya decision model:** called over HTTP at `https://ai-gateway.vercel.sh/v1/evaluate` with a Vercel AI Gateway API key. Model `convaiinnovations/laya-free` (free through 31 Oct 2026; text-only; 8K context). Full client code in §6.2.

## 3. Folder structure

```
backend/
  package.json  tsconfig.json  .env.example  .gitignore  README.md  CONTRACT_CHANGES.md
  data/                      # sqlite db + ai_cache.json
  uploads/
  src/
    index.ts                 # express app, scheduler, bot
    config.ts
    db/ schema.sql  db.ts  seed.ts
    domain/
      types.ts               # copy of contract types
      geo.ts                 # haversine, ETA
      bayes.ts               # Beta posterior, seeded RNG, Thompson draws, intervals
      reliability.ts         # ReliabilityScore
      matching.ts            # core engine
      risk.ts                # p_fail + standby trigger
      transitions.ts         # state machine (primary + standby)
      replies.ts             # intent x status -> action table
      fallback.ts  timeline.ts  board.ts
    ai/
      llm.ts                 # generative adapter
      laya.ts                # decision-model client
      mock.ts                # offline keyword versions of both
      cache.ts               # response cache (stage safety net)
      prompts.ts
      parse.ts               # parseOffer, parseDemand, extractReplyDetails
      guardrail.ts           # intake guardrail with Laya
      understandReply.ts     # Laya intent + at-risk, then LLM extraction
    routes/ health directory offers demands board assignments replies collector impact demo
    telegram/bot.ts
    scheduler.ts
  tests/ bayes.test.ts reliability.test.ts matching.test.ts risk.test.ts transitions.test.ts replies.test.ts
```

## 4. Environment (`.env.example`)

```
PORT=4000
FRONTEND_ORIGIN=http://localhost:3000
TZ_NAME=Asia/Kolkata

# Generative LLM (extraction)
LLM_PROVIDER=mock            # gemini | openai | anthropic | mock
LLM_API_KEY=
LLM_MODEL=                   # a current fast model from your provider's docs

# Laya decision model (via Vercel AI Gateway)
DECISION_PROVIDER=mock       # laya | mock
AI_GATEWAY_API_KEY=
LAYA_MODEL=convaiinnovations/laya-free

TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=

ACCEPT_TIMEOUT_SECS=45
RECONFIRM_AFTER_SECS=20
RECONFIRM_TIMEOUT_SECS=30
STANDBY_TIMEOUT_SECS=45
PICKUP_BUFFER_MINS=20
AVG_SPEED_KMPH=20
RISK_THRESHOLD=0.25
INTENT_MIN_PROBABILITY=0.70
THOMPSON_SAMPLING=on         # on | off  (tests use off)
EXPLORE_MIN_SLACK_MINS=90    # explore only if this much time remains before safe_until
DEMO_SEED=42                 # makes Thompson draws repeatable for rehearsals
FALLBACK_ORDER=animal_feed,compost
```

## 5. Data model (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, area TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS recipients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, area TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, telegram_chat_id TEXT, link_code TEXT UNIQUE NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0,
  no_show INTEGER NOT NULL DEFAULT 0, avg_response_secs REAL NOT NULL DEFAULT 300,
  is_simulated_history INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS demands (
  id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES recipients(id),
  people_count INTEGER NOT NULL, meals_matched INTEGER NOT NULL DEFAULT 0,
  diet TEXT NOT NULL, needed_by TEXT NOT NULL, max_distance_km REAL NOT NULL DEFAULT 5,
  notes TEXT, status TEXT NOT NULL DEFAULT 'open', raw_transcript TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  items_json TEXT NOT NULL, meal_count INTEGER NOT NULL,
  meals_assigned INTEGER NOT NULL DEFAULT 0, meals_collected INTEGER NOT NULL DEFAULT 0,
  diet TEXT NOT NULL, cooked_at TEXT NOT NULL, safe_until TEXT NOT NULL,
  photo_url TEXT, raw_transcript TEXT, pickup_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open', fallback_route TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES offers(id),
  recipient_id TEXT NOT NULL REFERENCES recipients(id), demand_id TEXT NOT NULL REFERENCES demands(id),
  meals INTEGER NOT NULL, status TEXT NOT NULL,
  reliability_at_assignment REAL NOT NULL, selection_json TEXT NOT NULL, distance_km REAL NOT NULL,
  offered_at TEXT NOT NULL, respond_by TEXT NOT NULL,
  accepted_at TEXT, reconfirm_by TEXT, collected_at TEXT,
  eta_promised TEXT, p_fail REAL,
  is_standby INTEGER NOT NULL DEFAULT 0, standby_for_assignment_id TEXT,
  last_reply_json TEXT,
  was_rematched INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, offer_id TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL,
  message TEXT NOT NULL, assignment_id TEXT
);
```
IDs: `r_`, `rc_`, `d_`, `o_`, `a_`, `e_` + short random id.

## 6. The AI layer

### 6.1 Division of labour
| Task | Who | Output |
| --- | --- | --- |
| Transcript → offer/demand fields | Generative LLM (`parse.ts`) | JSON validated by zod |
| Diet double-check + food-safety concern | **Laya** (`guardrail.ts`) | Probabilities → `IntakeGuardrail` |
| Reply intent + "might not make it" signal | **Laya** (`understandReply.ts`) | Probabilities |
| Numbers/times inside a reply ("12", "9:45") | Generative LLM (`extractReplyDetails`) | JSON |
| Everything else | Code | — |

### 6.2 Laya client (`src/ai/laya.ts`) — use as written

```ts
import { config } from "../config";
import { mockEvaluate } from "./mock";
import { cacheGet, cacheSet } from "./cache";

export type BooleanQ = { type: "boolean"; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type ScoreQ = { type: "score"; instructions: string; criteria: string[] };
export type Question = BooleanQ | ChoiceQ | ScoreQ;

export type BooleanA = { type: "boolean"; probability: number };
export type ChoiceA = { type: "choice"; choice: string; probabilities: Record<string, number> };
export type ScoreA = { type: "score"; score: number; probabilities: Record<string, number> };
export type Answer = BooleanA | ChoiceA | ScoreA;

export class DecisionUnavailable extends Error {}

export async function evaluate(
  state: unknown,
  questions: Record<string, Question>,
  timeoutMs = 6000
): Promise<{ answers: Record<string, Answer>; source: "laya" | "mock" }> {
  if (config.DECISION_PROVIDER === "mock") {
    return { answers: mockEvaluate(state, questions), source: "mock" };
  }
  if (!config.AI_GATEWAY_API_KEY) throw new DecisionUnavailable("AI_GATEWAY_API_KEY missing");

  const cacheKey = JSON.stringify({ m: config.LAYA_MODEL, state, questions });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/evaluate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.AI_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.LAYA_MODEL,
        state,
        questions,
        providerOptions: { gateway: { only: ["boundless"] } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new DecisionUnavailable(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { answers: Record<string, Answer> };
    cacheSet(cacheKey, body.answers);
    return { answers: body.answers, source: "laya" };
  } catch (err) {
    const cached = cacheGet<Record<string, Answer>>(cacheKey);
    if (cached) return { answers: cached, source: "laya" };
    throw err instanceof DecisionUnavailable ? err : new DecisionUnavailable(String(err));
  } finally {
    clearTimeout(timer);
  }
}
```

Notes:
- The response contains `answers` keyed by your question names: boolean → `{ probability }`, choice → `{ choice, probabilities }`, score → `{ score, probabilities }`.
- Laya's probabilities are not guaranteed to be calibrated. That's why every threshold leans cautious and Laya can only **add** a confirmation step, never skip one.
- `mockEvaluate` (in `mock.ts`): keyword rules returning the same shapes (e.g. "chicken|egg|mutton|fish" → nonveg 0.97; "smell|since afternoon|left out|uncovered" → safety 0.8; "traffic|late|stuck" → at_risk 0.75; "only \d+" → accept_partial 0.9).
- If Laya throws `DecisionUnavailable` and there's no cache hit, fall back conservatively: intake → `needs_confirmation: true` with reason "Automatic check unavailable — please confirm manually"; replies → `needs_clarification: true` (no state change). Report `laya: "unavailable"` in `/api/health` and the board.

### 6.3 Intake guardrail (`guardrail.ts`) — one Laya call per parsed offer
State: `{ transcript, items, extracted_diet }`. Questions:
```ts
{
  diet: {
    type: "choice",
    instructions: "Based on the food items described, is this food vegetarian or non-vegetarian?",
    criteria: { veg: "no meat, fish or egg in any item", nonveg: "at least one item contains meat, fish or egg" },
  },
  safety_concern: {
    type: "boolean",
    instructions: "Does the message suggest the food might be unsafe to eat?",
    criteria: {
      true: "spoiled, smells off, left out unrefrigerated or uncovered for long, reheated repeatedly, or partly eaten / served on plates",
      false: "no sign of a safety problem",
    },
  },
}
```
Rules (code):
- `agrees_with_extraction = diet.choice === parsed.diet`
- `needs_confirmation = true` if `probabilities[choice] < 0.95` OR not agreeing OR `safety_concern.probability > 0.30`
- Fill `reasons` with plain sentences ("Diet unclear: veg 71%", "Message suggests food was left out (safety concern 82%)").
- `POST /api/offers` always requires `confirmations.diet_confirmed` and `confirmations.safety_checklist_confirmed` to be `true` (`400 CONFIRMATION_REQUIRED` otherwise). The guardrail decides how loudly the UI asks, not whether.
- If `safety_concern > 0.30`, add a `guardrail_flag` timeline event when the offer is created.

### 6.4 Reply understanding (`understandReply.ts`)
State: `{ reply_text, assignment: { status, meals, safe_until_ist, distance_km } }`. One Laya call:
```ts
{
  intent: {
    type: "choice",
    instructions: "What does this food-pickup reply mean?",
    criteria: {
      accept_full: "agrees to collect all the offered meals",
      accept_partial: "agrees, but only for some of the meals",
      decline: "cannot take this food",
      cancel: "had agreed earlier but now cannot come",
      still_coming: "confirms they are coming / on the way",
      running_late: "will come but later than expected",
      question: "asks a question or the meaning is unclear",
    },
  },
  at_risk: {
    type: "boolean",
    instructions: "Is there any sign this collector might not arrive in time?",
    criteria: { true: "traffic, vehicle trouble, no staff, uncertainty, or a late arrival", false: "no sign of a problem" },
  },
}
```
Then:
- `intent_probability = probabilities[choice]`. If `< INTENT_MIN_PROBABILITY` → `needs_clarification`, no state change; Telegram replies with the clarification question plus the normal buttons.
- If intent is `accept_partial` or `running_late`, call `extractReplyDetails` (generative LLM → `{ meals: number|null, eta_iso: string|null }`, zod-validated; mock = regex).
- Apply via the table in §7.6. Store `last_reply_json`. Add a `reply_understood` event: `"Hope Shelter: 'traffic is bad, reaching 9:45' → running late (92%), at-risk 78%."`
- Recompute risk immediately (§7.4).

### 6.5 Generative prompts (`prompts.ts`)
Include the current time and timezone so "made at 7" becomes today 19:00 IST in ISO UTC.

Offer prompt rules:
- Return only JSON for `items, estimated_meals, diet, cooked_at, safe_until, pickup_notes, photo_check, missing_fields, followup_question` (the guardrail is added by code).
- Use only what is said or clearly visible in the photo. **Never guess `safe_until`.**
- `diet` is `nonveg` if any item has meat, fish or egg.
- `followup_question`: one short polite question for the most important missing field, else null.

Demand prompt: same pattern for `people_count, diet (veg|nonveg|any), needed_by, max_distance_km, notes`. Never invent `needed_by`.

`parse.ts`: call → `JSON.parse` → zod. On failure retry once ("Return only valid JSON for the schema"). On second failure return all-null fields with every field in `missing_fields` and a followup asking the user to type details. Cache every successful response in `data/ai_cache.json` keyed by input hash; on timeout (> 8 s) or error, serve the cache if present.

## 7. Core engine

### 7.1 Geo
`distanceKm` = haversine. `etaMins(km) = ceil(km / AVG_SPEED_KMPH * 60) + 10`.

### 7.2 Bayesian reliability (`bayes.ts`) — use as written

```ts
export type Rng = () => number;

// Seeded RNG so rehearsals are repeatable (mulberry32)
export function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
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

// Marsaglia–Tsang gamma sampler
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
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

// Beta(1,1) prior: 50% with no history, very uncertain
export function posterior(completed: number, failures: number) {
  return { a: 1 + completed, b: 1 + failures };
}

export function posteriorMean(completed: number, failures: number): number {
  const { a, b } = posterior(completed, failures);
  return a / (a + b);
}

export function interval90(completed: number, failures: number, rng: Rng, draws = 2000): [number, number] {
  const { a, b } = posterior(completed, failures);
  const xs = Array.from({ length: draws }, () => sampleBeta(a, b, rng)).sort((p, q) => p - q);
  return [xs[Math.floor(draws * 0.05)], xs[Math.floor(draws * 0.95)]];
}
```
`failures = cancelled + no_show`. Cache each recipient's interval and recompute only when their stats change.

### 7.3 Reliability score (`reliability.ts`)
```
p_complete     = posteriorMean(completed, failures)
proximity      = max(0, 1 - distance_km / demand.max_distance_km)
responsiveness = clamp(1 - avg_response_secs / 600, 0, 1)
total          = 0.60 * p_complete + 0.25 * proximity + 0.15 * responsiveness
explanation    = "18 of 20 pickups completed (86%, likely 73–96%), 1.2 km away, replies in ~2 min"
               | "No pickups yet (50%, could be anywhere from 5% to 95%)"
```
For the board without a specific demand, compute proximity against the most recent open offer's restaurant, or 0.5.

### 7.4 Risk model (`risk.ts`) — runs after every accept, reply, reconfirm and on every scheduler tick
For each primary assignment in `accepted | reconfirm_sent | confirmed`:
```
latest_risk = last_reply.at_risk_probability ?? 0
p_fail = (eta_promised && eta_promised > safe_until - PICKUP_BUFFER_MINS) ? 1
       : 1 - p_complete(recipient) * (1 - latest_risk)
save p_fail on the assignment
if p_fail > RISK_THRESHOLD and no standby exists for this assignment:
   find the best eligible candidate (same rules as matching, excluding everyone already involved in this offer)
   if found: create assignment { is_standby: 1, standby_for_assignment_id, status: "standby_requested",
                                 meals: same, respond_by: now + STANDBY_TIMEOUT_SECS }
             event "risk_check": "Failure risk for Little Stars Home is 38% (9 of 14 past pickups completed) — above 25%."
             event "backup_alerted": "Asked Sunrise Elders Home to stand by for 10 meals."
             notify via Telegram with buttons "I can stand by" / "Not today"
```
`OfferDetail.risk = { highest_p_fail, threshold: RISK_THRESHOLD, standby_active }`.

### 7.5 Matching (`matching.ts`) — `runMatching(offerId)`
Called on offer creation, demand creation, after any decline / cancel / no_response without a standby, and each tick for offers in `matching`.
```
remaining = meal_count - sum(meals of PRIMARY assignments in [offered, accepted, reconfirm_sent, confirmed, collected])
if remaining <= 0: return
excluded = recipients with any assignment on this offer (any status except released standby)
candidates = demands where
  status in (open, partially_matched), recipient not excluded,
  diet compatible (veg offer -> veg|any ; nonveg -> nonveg|any),
  distance <= max_distance_km,
  now + etaMins(distance) + PICKUP_BUFFER_MINS <= safe_until,
  now + etaMins(distance) <= needed_by,
  people_count - meals_matched > 0

minutes_left = (safe_until - now) in minutes
use_thompson = THOMPSON_SAMPLING == "on" and minutes_left >= EXPLORE_MIN_SLACK_MINS
for each candidate:
  p = use_thompson ? sampleBeta(a, b, rng) : posteriorMean
  rank_score = 0.60 * p + 0.25 * proximity + 0.15 * responsiveness
sort by rank_score DESC, then distance ASC

for each candidate while remaining > 0:
  meals = min(remaining, people_count - meals_matched)
  explored = use_thompson and some candidate ranked lower has a higher posterior mean
  create PRIMARY assignment { status: offered, respond_by: now + ACCEPT_TIMEOUT_SECS,
                               reliability_at_assignment: posteriorMean, selection: {...} }
  demand.meals_matched += meals; remaining -= meals
  event "offered" (with reason), plus "exploration" event if explored:
     "Exploration: offered to New Dawn Shelter (no history yet) to learn its reliability — 3 h 10 min of slack."
  notify via Telegram
if more than one assignment was created -> event "split"
if remaining > 0 and no candidates:
  if now + PICKUP_BUFFER_MINS >= safe_until -> applyFallback(offer, remaining)
  else -> status stays "matching"; event "note" once: "Waiting for a matching demand — 70 min left."
```
The rng is `makeRng(DEMO_SEED)` created once at start-up (reset on `/api/demo/reset`).
Offer status: `matching` while meals unassigned; `assigned` when all primary meals are accepted/reconfirm_sent/confirmed/collected.

### 7.6 State machine (`transitions.ts`) and reply table (`replies.ts`)
Each action is one function used by REST, Telegram buttons and replies. Invalid → `409 INVALID_TRANSITION`.

| Action | From | Result |
| --- | --- | --- |
| accept | offered | accepted; update avg_response_secs; run risk |
| decline | offered | declined; release meals; runMatching |
| reconfirm | reconfirm_sent | confirmed; run risk |
| cancel | accepted, reconfirm_sent, confirmed | cancelled; cancelled++; **promoteStandbyOrRematch** |
| collected | accepted, reconfirm_sent, confirmed | collected; completed++; meals_collected += meals; release its standby; maybe offer collected |
| standby_accept | standby_requested | on_standby; event "standby_ready" |
| standby_decline | standby_requested | released (no penalty); run risk again to try the next candidate |
| timeout: offer | offered past respond_by | no_response (no penalty); release; runMatching |
| timeout: reconfirm | reconfirm_sent past reconfirm_by | no_response; no_show++; **promoteStandbyOrRematch** |
| timeout: standby | standby_requested past respond_by | released |

`promoteStandbyOrRematch(failed)`:
- If an `on_standby` assignment exists for it → status `accepted`, `accepted_at = now`, `is_standby` stays 1, move the demand bookkeeping, event `"standby_promoted"`: "Hope Shelter dropped out. Sunrise Elders Home was already on standby — took over 20 meals instantly." Mark `was_rematched = 1` on the failed one.
- Else → release meals, `was_rematched = 1`, event `"rematch"`, `runMatching`.
- Any `standby_requested` for the failed one → released.

Reply table (`replies.ts`), applied only when `intent_probability >= INTENT_MIN_PROBABILITY`:

| Intent | offered | accepted / reconfirm_sent / confirmed | standby_requested | on_standby |
| --- | --- | --- | --- | --- |
| accept_full | accept | reconfirm if reconfirm_sent, else note | standby_accept | note |
| accept_partial (meals m < assigned) | accept with meals = m; release the rest → runMatching | reduce to m; release the rest → runMatching | standby_accept | note |
| decline | decline | cancel | standby_decline | release |
| cancel | decline | cancel | standby_decline | release |
| still_coming | accept | reconfirm if reconfirm_sent, else note | standby_accept | note |
| running_late (eta e) | accept, set eta_promised = e | set eta_promised = e; run risk | standby_accept | note |
| question | no change; forward the text into a `note` event | same | same | same |

If `accept_partial` has no extractable number, treat as `needs_clarification`.

### 7.7 Scheduler (`scheduler.ts`) — every 2 s, each step in try/catch
1. Offer timeouts. 2. Accepted past `RECONFIRM_AFTER_SECS` → `reconfirm_sent` + message. 3. Reconfirm timeouts. 4. Standby timeouts. 5. Risk check for all active primaries. 6. `runMatching` for offers in `matching`. 7. Past `safe_until` → fallback / expired; release standbys.

### 7.8 Fallback
First route in `FALLBACK_ORDER`; partners are **simulated** and the event says so: "No recipient can reach it before 10:00 pm. 15 meals routed to animal feed partner (simulated)."

### 7.9 Board stats
- `offers_collected_within_window`: fully collected offers where every `collected_at <= safe_until`.
- `dropouts_caught`: assignments with `was_rematched = 1`.
- `backups_promoted`: `standby_promoted` events.
- `replies_understood`: `reply_understood` events that changed state.
- `ai_status` from config + last Laya call result.

## 8. Telegram bot (`telegram/bot.ts`)
- Disabled with a warning if no token; web inbox still works.
- `/start <link_code>` links the chat.
- Messages with inline buttons: offer (`Accept` / `Decline`), reconfirm (`Still coming` / `Cancel`), confirmed (`Collected` / `Cancel`), standby (`I can stand by` / `Not today`). Callback data `acc:`, `dec:`, `rec:`, `can:`, `col:`, `sba:`, `sbd:` + assignment id.
- **Free text** from a linked chat → `understandReply` on that recipient's most recent active or standby assignment → reply with what was understood: "Got it: running late, arriving 9:45 pm (92% sure). We've asked a backup to stand by just in case." If clarification is needed, ask the question and resend the buttons.
- After any callback: `answerCallbackQuery` and edit the message to show the new state.
- Long polling via `bot.start()` from `index.ts`.

## 9. Seed data (`seed.ts`) — all flagged simulated
Restaurants: `Koramangala Kitchen` (Koramangala), `Indiranagar Tiffins` (Indiranagar). Fictional names, real Bengaluru coordinates.

| Recipient | link_code | completed / cancelled / no_show | avg reply | ≈ km from Koramangala Kitchen | Open demand (needed by 21:30 IST tonight) |
| --- | --- | --- | --- | --- | --- |
| Hope Shelter | HOPE1 | 18 / 1 / 1 | 120 s | 1.2 | 20 veg |
| Sunrise Elders Home | SUN1 | 12 / 0 / 0 | 200 s | 3.8 | 20 veg |
| Little Stars Home | STAR1 | 9 / 3 / 2 | 400 s | 2.5 | 15 any |
| Saathi NGO | SAATHI1 | 4 / 2 / 3 | 500 s | 1.0 | 25 any |
| New Dawn Shelter | DAWN1 | 0 / 0 / 0 | 300 s | 2.0 | 15 any |

Expected posterior means: Hope ≈ 0.86, Sunrise ≈ 0.93, Little Stars ≈ 0.63, Saathi ≈ 0.45, New Dawn = 0.50 (very wide interval).
Plus a few past offers/events so the board isn't empty. `POST /api/demo/reset` reseeds and resets the RNG.

## 10. Build schedule (9 hours)

If the backend has **two people**, split by file ownership to avoid conflicts: **Engine owner** — `domain/*`, `scheduler.ts`, `routes/*` except replies; **AI owner** — `ai/*`, `telegram/*`, `routes/replies.ts`, `routes/offers.ts` parse handler. Agree on function signatures in `domain/types.ts` in the first 15 minutes.

| Time | Task | Done when |
| --- | --- | --- |
| 0:00–0:45 | Scaffold, config, schema, seed, `bayes.ts`, `/health`, `/restaurants`, `/recipients`, `/board` | **SYNC 1:** frontend can read the board |
| 0:45–2:00 | `llm.ts` + mock + cache, prompts, `/offers/parse`, `/demands/parse`; `laya.ts` + mock; **test Laya with a real key on 5 demo sentences** | Parse + guardrail return correct shapes |
| 2:00–3:30 | `POST /offers` (with confirmations), `POST /demands`, `GET /offers/:id`, reliability, matching with Thompson + exploration, transitions, timeline, assignment routes, inbox | Offer → assignments with reasons on the board |
| 3:30–4:45 | Scheduler, `risk.ts`, standby flow, `promoteStandbyOrRematch`, Telegram buttons | Standby promotion works via web inbox |
| **4:45** | **SYNC 2:** full loop with frontend (CONNECTION_PLAN Phase 3) | Judge path works end to end |
| 4:45–6:00 | `understandReply` + `/reply` + Telegram free text; tests | Free-text reply changes state correctly |
| 6:00–7:00 | Fix issues listed in `frontend/INTEGRATION_NOTES.md`; demo controls; impact card only if time | No blockers |
| **7:00** | **FEATURE FREEZE** | |
| 7:00–8:00 | Run the 4 demo scenarios 5× each; warm the AI cache with the exact demo sentences | Cache contains every demo input |

**Cut order if behind:** impact card → photo_check → exploration events (keep Thompson off) → free-text replies (keep buttons).
**Never cut:** matching, Bayesian reliability, reconfirm timeout, risk-triggered standby + promotion, re-match, fallback, intake guardrail, timeline events.

## 11. Tests (`vitest`, with `THOMPSON_SAMPLING=off`)
- bayes: `posteriorMean(18, 2)` ≈ 0.864; `interval90(0, 0)` is wide (roughly [0.05, 0.95]); `interval90(18, 2)` lies inside (0.6, 1).
- reliability: Hope's total beats Saathi's even though Saathi is closer.
- matching: a 40-meal veg offer splits 20 → Hope, 20 → Sunrise; a nonveg offer never goes to veg-only demands; a candidate whose ETA misses `safe_until - buffer` is skipped.
- risk: Little Stars with no reply → p_fail ≈ 0.37 → standby requested; Hope with a reply at_risk 0.78 → p_fail ≈ 0.81 → standby requested; Sunrise with no reply → p_fail ≈ 0.07 → no standby.
- transitions: cancel from `offered` → 409; reconfirm timeout with an `on_standby` backup → backup becomes `accepted` and no new offer is sent.
- replies: `accept_partial` 12 of 20 at `offered` → assignment 12, 8 re-matched; intent probability 0.55 → no state change.

## 12. Demo scenarios the backend must support
Run `POST /api/demo/reset` before each scenario. For scenarios 1–3, set `safe_until` less than `EXPLORE_MIN_SLACK_MINS` away (e.g. 75 min) so ranking uses the posterior mean and the outcome is repeatable; show exploration separately by creating an offer with 3+ hours of slack.

1. **Happy path + split:** 40 veg meals → Hope 20 + Sunrise 20 → both collected.
2. **Risk → standby → dropout caught (key moment):** 20 veg meals → Hope accepts → Hope replies on Telegram "traffic is really bad, may be late" → Laya: running late / at-risk → p_fail jumps above 25% → Sunrise asked to stand by and taps "I can stand by" → Hope goes silent at reconfirm → Sunrise promoted instantly → collected within the window.
3. **Free-text partial:** a 15-meal **non-veg** offer (Hope and Sunrise are veg-only, so it goes to Little Stars) → Little Stars replies "we can only take 8" → 8 accepted, the other 7 re-matched to New Dawn Shelter.
4. **Too late:** `safe_until` 25 minutes away, nobody reachable → fallback with simulated partner.

## 13. Definition of done
- `npm install && npm run dev` serves :4000 with seed data.
- Every endpoint matches the contract exactly.
- Runs fully with `LLM_PROVIDER=mock` and `DECISION_PROVIDER=mock`, and with no Telegram token.
- `backend/README.md` covers setup, how to get the AI Gateway key, env vars and the four demo scenarios.
