# AnnaRelay — backend

Express + TypeScript + SQLite. Matches leftover restaurant food to shelters that need it, ranks collectors by a Bayesian reliability estimate (with Thompson sampling), watches every pickup for risk, puts a backup on standby, and records an outcome for every offer.

It builds against [`../API_CONTRACT.md`](../API_CONTRACT.md). Contract change proposals go in [`CONTRACT_CHANGES.md`](CONTRACT_CHANGES.md).

## Quick start

```bash
cd backend
npm install
cp .env.example .env      # already done if .env exists
npm run dev               # http://localhost:4000, seeds demo data on first run
```

With no keys at all, it runs fully on mocks (`LLM_PROVIDER=mock`, `DECISION_PROVIDER=mock`) and without Telegram; the web inbox still works.

| Command | What it does |
| --- | --- |
| `npm run dev` | Server with reload (API + scheduler every 2 s + Telegram bot if a token is set) |
| `npm test` | Vitest suite (Thompson sampling off, mocks only, in-memory DB) |
| `npm run scenarios` | Runs the 4 demo scenarios + parse checks against a **running** server (`API=http://host:port` to override; `ROUNDS=5` to repeat) |
| `npm run seed` | Re-seed the database (also: `POST /api/demo/reset`) |
| `npm run typecheck` | `tsc --noEmit` |

## Keys (all optional)

| Key | Where to get it | `.env` |
| --- | --- | --- |
| Generative LLM | **Groq** (in use): <https://console.groq.com/keys>. Also supported: Gemini, OpenAI, Anthropic. | `LLM_PROVIDER=groq`, `LLM_API_KEY=gsk_...`, `LLM_MODEL=openai/gpt-oss-120b` (text-only, so `photo_check` stays null; use gemini for photo checks) |
| Speech-to-text | **Sarvam** (in use): <https://dashboard.sarvam.ai>. Groq Whisper is the automatic fallback. | `STT_PROVIDER=sarvam`, `SARVAM_API_KEY=...`, `SARVAM_MODEL=saaras:v4`, `GROQ_API_KEY=gsk_...` |
| Vercel AI Gateway (Laya) | vercel.com → Dashboard → **AI Gateway** → **API Keys** → Create key. Laya (`convaiinnovations/laya-free`) is free through 31 Oct 2026, **but the Vercel account must have a credit card on file** or every call returns `customer_verification_required`. | `DECISION_PROVIDER=laya`, `AI_GATEWAY_API_KEY=...` |
| Telegram bot | In Telegram, message **@BotFather** → `/newbot` → pick a name and a username ending in `bot` → copy the token | `TELEGRAM_BOT_TOKEN=...`, `TELEGRAM_BOT_USERNAME=...` |

Test Laya directly:

```bash
curl https://ai-gateway.vercel.sh/v1/evaluate \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"convaiinnovations/laya-free","state":"traffic is really bad, may be late",
       "questions":{"at_risk":{"type":"boolean","instructions":"Is there any sign this collector might not arrive in time?"}},
       "providerOptions":{"gateway":{"only":["boundless"]}}}'
```

`GET /api/health` reports `llm` / `laya` as `ready | mock | missing_key` (Laya also `unavailable` after a failed call) and `telegram` as `ready | disabled`.

**Telegram linking:** each recipient has a link code (`HOPE1`, `SUN1`, `STAR1`, `SAATHI1`, `DAWN1`). Open `t.me/<bot_username>?start=HOPE1` on a phone, or send `/start HOPE1` to the bot. `POST /api/demo/reset` keeps existing chat links.

## Voice (multilingual speech-to-text)

`POST /api/transcribe` (multipart): `audio` (webm/ogg/wav/mp3/m4a, < 30 s), optional `language_code` (default `unknown` = auto-detect across 23 Indian languages incl. en-IN, hi-IN, kn-IN, ta-IN; code-mixed speech works), optional `mode` (saaras:v3 only: transcribe | translate | codemix ...). Returns `{ text, language_code, language_probability, source: "sarvam" | "groq" }`. Send `text` to `/api/offers/parse` or `/api/demands/parse` as `transcript`; the LLM reads Hindi / Hinglish / Kannada directly. Spoken 12-hour times ("11 baje") are corrected in code so `safe_until` / `needed_by` never land in the past.

## Environment

See [`.env.example`](.env.example). Timers are demo-scaled: accept 45 s, reconfirm 20 s after accept, reconfirm timeout 30 s, standby timeout 45 s. `RISK_THRESHOLD=0.25`, `INTENT_MIN_PROBABILITY=0.70`, `EXPLORE_MIN_SLACK_MINS=90`, `DEMO_SEED=42`. `FRONTEND_ORIGIN` accepts a comma-separated list (add `http://<laptop-ip>:3000` for cross-laptop demos).

## Where the AI is (and isn't)

| Job | Who | Can it change state alone? |
| --- | --- | --- |
| Transcript → offer / demand fields | Generative LLM (`src/ai/parse.ts`), zod-validated, 1 retry, cached | No, the user reviews and confirms |
| Diet double-check + food-safety concern | Laya (`src/ai/guardrail.ts`) | No, it can only *add* a confirmation step |
| Reply intent + at-risk signal | Laya (`src/ai/understandReply.ts`) | Only through the fixed table in `src/domain/replies.ts`, and only at ≥ 70 % |
| Numbers / times inside replies | Generative LLM (`extractReplyDetails`) | No |
| Who gets the food | Bayesian reliability + Thompson sampling (`src/domain/matching.ts`) | Yes, deterministic code, logged |
| When to call a backup | Risk model (`src/domain/risk.ts`) | Yes, deterministic code, logged |

Every successful AI response is cached in `data/ai_cache.json`. On timeout or error the cache is served; if there is no cache hit, the intake guardrail falls back to "please confirm manually" and replies fall back to "needs clarification" (no state change).

## Demo scenarios

Run `POST /api/demo/reset` before each one. `npm run scenarios` runs all four automatically.

1. **Happy path + split:** a 40-meal veg offer, safe for 75 min, splits 20 to Hope Shelter and 20 to Sunrise Elders Home. Both accept and collect.
2. **Risk → standby → dropout caught:** a 20-meal veg offer goes to Hope, who accepts. Hope replies "traffic is really bad, may be late" (running late, at-risk 78 %), so p_fail jumps to 81 % and Sunrise is asked to stand by. Sunrise taps "I can stand by". Hope goes silent at reconfirm ("Skip wait" = `POST /api/demo/fast-forward/:id`), and Sunrise is promoted instantly and collects.
3. **Free-text partial:** a 15-meal non-veg offer goes to Little Stars (Hope and Sunrise are veg-only). Little Stars replies "we can only take 8", so 8 are accepted and 7 are re-matched to New Dawn Shelter.
4. **Too late:** with `safe_until` 25 min away, nobody can reach it, so the meals go to the animal feed partner (simulated).

Exploration: an offer with 3+ hours of slack ranks by Thompson draws and may log an `exploration` event (seeded by `DEMO_SEED`, so it is repeatable after a reset).

**Warm the AI cache before the demo:** with real keys set, run `npm run scenarios` and the curl parse examples from `CONNECTION_PLAN.md`. Every exact demo sentence then has a cached LLM and Laya response.

## Implementation notes (backend decisions within the contract)

- **Fallback trigger.** The plan says to fall back when `now + PICKUP_BUFFER_MINS >= safe_until`. Because the fastest possible ETA is 10 min (`etaMins(0)`), the backend falls back as soon as `now + 10 + PICKUP_BUFFER_MINS >= safe_until`, since nobody could make it anyway. This is why scenario 4 resolves immediately instead of after a 5-minute wait.
- **Headline metric denominator.** `share_collected_within_window` = offers collected within their window ÷ offers that have *finished* (collected / partially_collected / fallback / expired). In-flight offers don't drag it down mid-demo.
- **Seeded demand deadline.** Demands are due at 21:30 IST tonight, or about 4 h from now if 21:30 is less than 2 h away (late rehearsals).
- **Standby meals.** A standby is asked for `min(primary meals, its remaining demand)`. Any shortfall after promotion is re-matched.
- **`avg_response_secs`** updates as an exponential moving average (20 % weight on the newest response).
- **Board proximity** is measured from the most recent open offer's restaurant; with no open offer it is 0.5.
- Photos are stored in `uploads/` and returned as relative `photo_url` (`/uploads/<file>`).

## Layout

```
src/
  index.ts  config.ts  scheduler.ts  replyFlow.ts
  db/        schema.sql db.ts repo.ts seed.ts
  domain/    types.ts bayes.ts reliability.ts matching.ts risk.ts transitions.ts replies.ts
             offerState.ts fallback.ts timeline.ts board.ts geo.ts clock.ts format.ts notify.ts ids.ts
  ai/        llm.ts laya.ts mock.ts cache.ts prompts.ts parse.ts guardrail.ts understandReply.ts status.ts time.ts
  routes/    http.ts misc.ts offers.ts demands.ts assignments.ts
  telegram/  bot.ts
tests/       bayes reliability matching risk transitions replies parse
scripts/     scenarios.ts
```

All seeded recipients, histories and partners are **simulated** (`is_simulated_history`, `is_simulated`).
