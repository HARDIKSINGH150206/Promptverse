# AnnaRelay — frontend

Next.js (App Router) + TypeScript + Tailwind CSS v4, on port **3000**. Built strictly to [`../API_CONTRACT.md`](../API_CONTRACT.md) and [`FRONTEND_AGENT_PLAN.md`](FRONTEND_AGENT_PLAN.md). Notes for the backend live in [`INTEGRATION_NOTES.md`](INTEGRATION_NOTES.md).

## Setup

```bash
cd frontend
npm install
cp .env.example .env.local   # pick mock / live / mixed
npm run dev                  # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build / serve on :3000 |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |

`NEXT_PUBLIC_*` values are read at build time, so restart `npm run dev` (or rebuild) after changing them.

## Environment

| Variable | Values | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_API_MODE` | `mock` (default) · `live` · `mixed` | Where API calls go |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | Backend address (use the backend laptop's IP across Wi-Fi) |
| `NEXT_PUBLIC_LIVE_GROUPS` | e.g. `health,directory,board` | `mixed` only. Groups: `health, directory, parse, offers, demands, board, assignments, replies, collector, impact, demo` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | bot username without `@` | Enables "Link Telegram" on the recipient page |

**Mock mode** runs the whole demo in the browser with no backend. `src/lib/api/mock.ts` is a port of the backend engine: same seed, matching, Bayesian reliability, Thompson sampling, risk and standby rules, reply table and timers. State is kept in `localStorage`, so the board and inbox tabs share one world. It's the stage fallback if the backend dies. The header shows "Mock mode" or "Mixed mode" whenever any data is mocked.

## Architecture

- The UI never calls `fetch` directly. Everything goes through `api` in `src/lib/api/client.ts`, which picks `live.ts` or `mock.ts` per endpoint group.
- Polling uses `usePoll(fn, 2000)`. Countdowns share one 1-second clock (`useNow`), corrected to the backend clock via `board.server_time`.
- Voice uses the backend's `/api/transcribe` when `health.stt` is `ready` (multilingual), otherwise the browser Web Speech API (Chrome/Edge). The textarea is always editable.
- Every button maps to a contract endpoint; there are no decorative actions.

## Design rules

- Exactly four colours, defined as tokens in `src/app/globals.css`: white `#F9F9F9`, blue `#004E72`, orange `#FF6E42`, navy `#092634`. Tailwind's default palette is switched off; tints are opacity variants of these four.
- Orange is reserved for primary actions and attention. Text on orange is navy (white on orange fails contrast).
- Flat fills, no gradients, rounded corners (16–24px). Icons come from `lucide-react`; no emojis.
- Status is never colour-only: every chip, meter and timeline event has an icon and a text label.
- Honesty: seeded data shows a **Simulated** badge, demo buttons say **Demo control**, and AI outputs show source and confidence (Laya / LLM / Mock / Rules).

## Screens

| Route | What |
| --- | --- |
| `/` | Hub: live headline numbers, three entry tiles, where the AI is (and isn't) |
| `/restaurant` | Voice offer intake → parsed form → Laya guardrail (diet question) → safety checklist → send |
| `/recipient` | Pick home (reliability bar), Telegram link / web inbox, voice demand intake |
| `/board` | Live Board for the projector: headline metric, offers with risk, recipients ranked by reliability, demand board |
| `/offers/[id]` | Offer Timeline: assignments with selection reason, risk meter, backup tags, understood replies, "Skip wait"; full event timeline |
| `/collector/[recipientId]` | Web inbox (Telegram fallback): status buttons + free-text reply box |
| `/impact/[restaurantId]` | Impact card (stretch) |

## Demo click-path

Click **Demo control → Reset demo** on the Live Board before each scenario. Keep the board on the projector and open inboxes on a phone or in another tab.

1. **Happy path + split.** On `/restaurant`, pick Koramangala Kitchen and say *"40 plates veg biryani, made at 7, safe till"* a time about 75 minutes from now. Answer "Yes, all veg", tick all 3 checks, then send. The timeline shows Hope 20 + Sunrise 20, each with a "Ranked by reliability" note. In each inbox, tap Accept, then Collected.
2. **Risk → standby → takeover.** Offer 20 veg meals; Hope's inbox → Accept. Reply *"traffic is really bad, may be late"*. The reply is read as running late with high at-risk, the risk meter goes above 25%, and Sunrise is asked to stand by. In Sunrise's inbox, tap "I can stand by". On the timeline, click "Skip wait" on Hope twice (reconfirm, then silence). Sunrise takes over instantly. Then Collected.
3. **Free-text partial.** Offer 15 non-veg meals (e.g. chicken curry). Little Stars → reply *"we can only take 8"*. 8 are accepted and 7 re-matched to New Dawn. *"hmm let me check"* asks for clarification and changes nothing.
4. **Too late.** Set `safe_until` about 25 minutes away. Nobody can reach it, so it goes to the animal feed partner (simulated).

Sentences that trigger the guardrail: *"30 plates pulao and raita made at 8 safe till 11"* (diet unclear) and *"20 plates dal rice, it has been sitting out since afternoon, safe till 10"* (safety concern).
