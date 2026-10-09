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

**Demo day, one command:** `npm run demo`. It starts local Laya and the backend if they aren't running, waits for both, does a real AI round trip, and prints a ready/not-ready table for llm, laya, stt and telegram. Ctrl+C stops what it started. Add `--scenarios` to also run the 4 scenarios. The frontend is started separately (`cd ../frontend && npm run dev`).

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

## Decision model: local Laya + LLM (free, no card)

Vercel's AI Gateway needs a credit card on file even for `laya-free`, so Laya runs **locally** from its open weights (Apache 2.0, ~0.4B params; CPU is fine):

```bash
npm run laya:setup   # once: Python venv + CPU PyTorch + laya[serve]; first start downloads ~1.5 GB
npm run laya         # keep running: http://127.0.0.1:8000 (english + multilingual + typed-decisions, ~5 GB RAM)
npm run laya:check   # demo sentences through the configured decision provider, with timings
```

`DECISION_PROVIDER=hybrid` (default) asks local Laya **and** the LLM in parallel:
- **Yes/no risk signals** (food-safety concern, at-risk) take the **higher** of the two probabilities: either model can raise a flag, neither can clear one.
- **Choices** (diet, reply intent) come from the LLM. Laya's answer is kept as a second check: if Laya reads the diet differently with > 60 %, the restaurant is asked to confirm.
- If Laya is down, the LLM answers alone; if both are down, the conservative fallbacks apply.

Why: measured on a laptop CPU, the base Laya checkpoints classified almost every reply as `accept_full` (including "sorry we can't come today") and missed "sitting out since afternoon" (17 %). Hybrid gets all demo replies right and flags that sentence at 60 %. Latency is about 2–4.5 s per call, mostly Laya on CPU.

Other values: `laya_local` (Laya only), `llm` (LLM only), `laya` (Vercel gateway), `mock`.

**Demo sentence for the diet guardrail:** `30 plates of biryani made at 8 safe till 11` (biryani can be veg or chicken: LLM 50 %, Laya's second check leans non-veg). "Pulao and raita" is correctly read as veg by the real models, so it no longer triggers a warning.

## Decision model: local Laya + LLM (free, no card)

Vercel's AI Gateway needs a credit card on file even for , so Laya runs **locally** from its open weights (Apache 2.0, ~0.4B params, CPU is fine):

\
> annarelay-backend@1.0.0 laya:setup
> powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-laya.ps1

Requirement already satisfied: pip in .laya-local.venvLibsite-packages (26.2.1)
Looking in indexes: https://download.pytorch.org/whl/cpu
Requirement already satisfied: torch in .laya-local.venvLibsite-packages (2.14.1+cpu)
Requirement already satisfied: filelock in .laya-local.venvLibsite-packages (from torch) (3.32.3)
Requirement already satisfied: typing-extensions>=4.10.0 in .laya-local.venvLibsite-packages (from torch) (4.16.0)
Requirement already satisfied: setuptools>=77.0.3 in .laya-local.venvLibsite-packages (from torch) (78.1.0)
Requirement already satisfied: sympy>=1.13.3 in .laya-local.venvLibsite-packages (from torch) (1.14.0)
Requirement already satisfied: networkx>=2.5.1 in .laya-local.venvLibsite-packages (from torch) (3.6.1)
Requirement already satisfied: jinja2 in .laya-local.venvLibsite-packages (from torch) (3.1.6)
Requirement already satisfied: fsspec>=0.8.5 in .laya-local.venvLibsite-packages (from torch) (2026.7.0)
Requirement already satisfied: mpmath<1.4,>=1.1.0 in .laya-local.venvLibsite-packages (from sympy>=1.13.3->torch) (1.3.0)
Requirement already satisfied: MarkupSafe>=2.0 in .laya-local.venvLibsite-packages (from jinja2->torch) (3.0.3)
Requirement already satisfied: laya[serve] in .laya-local.venvLibsite-packages (0.4.1)
Requirement already satisfied: torch>=2.0.0 in .laya-local.venvLibsite-packages (from laya[serve]) (2.14.1+cpu)
Requirement already satisfied: transformers>=4.48.0 in .laya-local.venvLibsite-packages (from laya[serve]) (5.19.0)
Requirement already satisfied: safetensors>=0.4.0 in .laya-local.venvLibsite-packages (from laya[serve]) (0.8.0)
Requirement already satisfied: huggingface_hub>=0.20.0 in .laya-local.venvLibsite-packages (from laya[serve]) (1.33.0)
Requirement already satisfied: numpy>=1.20.0 in .laya-local.venvLibsite-packages (from laya[serve]) (2.5.3)
Requirement already satisfied: fastapi>=0.110.0 in .laya-local.venvLibsite-packages (from laya[serve]) (0.143.0)
Requirement already satisfied: uvicorn>=0.27.0 in .laya-local.venvLibsite-packages (from laya[serve]) (0.54.0)
Requirement already satisfied: python-multipart>=0.0.9 in .laya-local.venvLibsite-packages (from laya[serve]) (0.0.32)
Requirement already satisfied: starlette>=0.46.0 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (1.7.0)
Requirement already satisfied: pydantic>=2.9.0 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (2.14.0)
Requirement already satisfied: typing-extensions>=4.8.0 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (4.16.0)
Requirement already satisfied: typing-inspection>=0.4.2 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (0.4.4)
Requirement already satisfied: annotated-doc>=0.0.2 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (0.0.5)
Requirement already satisfied: opentelemetry-api>=1.44.0 in .laya-local.venvLibsite-packages (from fastapi>=0.110.0->laya[serve]) (1.45.1)
Requirement already satisfied: click<9.0.0,>=8.4.2 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (8.5.0)
Requirement already satisfied: filelock>=3.10.0 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (3.32.3)
Requirement already satisfied: fsspec>=2023.5.0 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (2026.7.0)
Requirement already satisfied: hf-xet<2.0.0,>=1.6.0 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (1.7.0)
Requirement already satisfied: httpx<1,>=0.23.0 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (0.28.1)
Requirement already satisfied: packaging>=20.9 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (26.3)
Requirement already satisfied: pyyaml>=5.1 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (6.0.3)
Requirement already satisfied: tqdm>=4.42.1 in .laya-local.venvLibsite-packages (from huggingface_hub>=0.20.0->laya[serve]) (4.70.1)
Requirement already satisfied: anyio in .laya-local.venvLibsite-packages (from httpx<1,>=0.23.0->huggingface_hub>=0.20.0->laya[serve]) (4.15.1)
Requirement already satisfied: certifi in .laya-local.venvLibsite-packages (from httpx<1,>=0.23.0->huggingface_hub>=0.20.0->laya[serve]) (2026.7.22)
Requirement already satisfied: httpcore==1.* in .laya-local.venvLibsite-packages (from httpx<1,>=0.23.0->huggingface_hub>=0.20.0->laya[serve]) (1.0.9)
Requirement already satisfied: idna in .laya-local.venvLibsite-packages (from httpx<1,>=0.23.0->huggingface_hub>=0.20.0->laya[serve]) (3.20)
Requirement already satisfied: h11>=0.16 in .laya-local.venvLibsite-packages (from httpcore==1.*->httpx<1,>=0.23.0->huggingface_hub>=0.20.0->laya[serve]) (0.16.0)
Requirement already satisfied: annotated-types>=0.6.0 in .laya-local.venvLibsite-packages (from pydantic>=2.9.0->fastapi>=0.110.0->laya[serve]) (0.8.0)
Requirement already satisfied: pydantic-core==2.50.0 in .laya-local.venvLibsite-packages (from pydantic>=2.9.0->fastapi>=0.110.0->laya[serve]) (2.50.0)
Requirement already satisfied: setuptools>=77.0.3 in .laya-local.venvLibsite-packages (from torch>=2.0.0->laya[serve]) (78.1.0)
Requirement already satisfied: sympy>=1.13.3 in .laya-local.venvLibsite-packages (from torch>=2.0.0->laya[serve]) (1.14.0)
Requirement already satisfied: networkx>=2.5.1 in .laya-local.venvLibsite-packages (from torch>=2.0.0->laya[serve]) (3.6.1)
Requirement already satisfied: jinja2 in .laya-local.venvLibsite-packages (from torch>=2.0.0->laya[serve]) (3.1.6)
Requirement already satisfied: mpmath<1.4,>=1.1.0 in .laya-local.venvLibsite-packages (from sympy>=1.13.3->torch>=2.0.0->laya[serve]) (1.3.0)
Requirement already satisfied: colorama in .laya-local.venvLibsite-packages (from tqdm>=4.42.1->huggingface_hub>=0.20.0->laya[serve]) (0.4.6)
Requirement already satisfied: regex>=2025.10.22 in .laya-local.venvLibsite-packages (from transformers>=4.48.0->laya[serve]) (2026.9.29)
Requirement already satisfied: tokenizers<0.24.0,>=0.23.1 in .laya-local.venvLibsite-packages (from transformers>=4.48.0->laya[serve]) (0.23.2)
Requirement already satisfied: typer in .laya-local.venvLibsite-packages (from transformers>=4.48.0->laya[serve]) (0.27.3)
Requirement already satisfied: MarkupSafe>=2.0 in .laya-local.venvLibsite-packages (from jinja2->torch>=2.0.0->laya[serve]) (3.0.3)
Requirement already satisfied: shellingham>=1.3.0 in .laya-local.venvLibsite-packages (from typer->transformers>=4.48.0->laya[serve]) (1.5.4)
Requirement already satisfied: rich>=13.8.0 in .laya-local.venvLibsite-packages (from typer->transformers>=4.48.0->laya[serve]) (15.0.0)
Requirement already satisfied: markdown-it-py>=2.2.0 in .laya-local.venvLibsite-packages (from rich>=13.8.0->typer->transformers>=4.48.0->laya[serve]) (4.2.0)
Requirement already satisfied: pygments<3.0.0,>=2.13.0 in .laya-local.venvLibsite-packages (from rich>=13.8.0->typer->transformers>=4.48.0->laya[serve]) (2.21.0)
Requirement already satisfied: mdurl~=0.1 in .laya-local.venvLibsite-packages (from markdown-it-py>=2.2.0->rich>=13.8.0->typer->transformers>=4.48.0->laya[serve]) (0.1.2)
Laya installed. Start it with: npm run laya

> annarelay-backend@1.0.0 laya
> powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-laya.ps1


> annarelay-backend@1.0.0 laya:check
> tsx scripts/laya-check.ts

Decision provider: hybrid

Intake guardrail
   5708 ms  around 40 plates veg biryani made at 7 safe till 10 back gate
         diet veg 0.98  safety 0.082  confirm=false  [laya]
   3470 ms  30 plates pulao and raita made at 8 safe till 11
         diet veg 0.99  safety 0.129  confirm=false  [laya]
   3373 ms  20 plates dal rice, it has been sitting out since afternoon, safe till 10
         diet veg 0.99  safety 0.6  confirm=true  [laya]
   3855 ms  15 plates chicken curry and rice, made at 6, safe till 10
         diet nonveg 1  safety 0.115  confirm=false  [laya]

Replies
   6375 ms  traffic is really bad, may be late
         running_late 0.8  at_risk 0.92  clarify=false  [llm]
   5660 ms  we can only take 8
         accept_partial 0.88  at_risk 0.223  clarify=false  [llm]
   4830 ms  yes we will collect
         accept_full 0.7  at_risk 0.247  clarify=false  [llm]
   5624 ms  sorry we can't come today
         cancel 0.9  at_risk 0.95  clarify=false  [llm]
   5645 ms  on the way, 10 minutes
         still_coming 0.9  at_risk 0.337  clarify=false  [llm]
   2824 ms  hmm let me check
         question 0.8  at_risk 0.6  clarify=false  [llm]
   3025 ms  haan bhai aa rahe hai, thoda late hoga
         running_late 0.6  at_risk 0.7  clarify=true  [llm]
 (default) asks local Laya **and** the LLM in parallel:
- **Yes/no risk signals** (food-safety concern, at-risk) take the **higher** of the two probabilities: either model can raise a flag, neither can clear one.
- **Choices** (diet, reply intent) come from the LLM. Laya's answer is kept as a second check: if Laya reads the diet differently with > 60 %, the restaurant is asked to confirm.
- If Laya is down, the LLM answers alone; if both are down, the existing conservative fallbacks apply.

Why: measured on this laptop's CPU, the base Laya checkpoints classified almost every reply as "accept_full" (including "sorry we can't come today") and missed "sitting out since afternoon" (17 %). Hybrid gets all demo replies right and flags that sentence at 60 %. Latency is ~2–4.5 s per call, mostly Laya on CPU.

Other values:  (Laya only),  (LLM only),  (Vercel gateway), .

**Demo sentence for the diet guardrail:**  (biryani can be veg or chicken: LLM 50 %, Laya second check leans non-veg). "Pulao and raita" is correctly read as veg by the real models, so it no longer triggers a warning.

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
