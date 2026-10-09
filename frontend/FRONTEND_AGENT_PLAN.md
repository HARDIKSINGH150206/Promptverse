# AnnaRelay — Frontend Build Plan v2 (for the frontend coding agent)

## 0. HARD RULES — read before doing anything

1. **You work ONLY inside the `frontend/` folder.** Create, edit and delete files only under `frontend/`.
2. **Never touch `backend/`.** Do not edit it or run commands that write into it. No root-level files.
3. **Never edit `contract/API_CONTRACT.md`.** Build exactly to it (v2). Problems go in `frontend/INTEGRATION_NOTES.md`; keep building to the current contract.
4. No root `package.json`, no monorepo tooling. `frontend/` is a standalone Next.js app.
5. Git: only stage `frontend/` (`git add frontend/`). `git pull --rebase` before pushing.
6. **Build everything against mock endpoints first.** Never wait on the backend.
7. Honesty in the UI: simulated data shows a visible **"Simulated"** badge; demo buttons say **"Demo control"**; AI outputs show their confidence and source ("Laya", "LLM", "Mock").

## 1. What we are building (plain English)

AnnaRelay rescues surplus cooked food and makes sure it's actually collected before it stops being safe.

- **Recipients** (shelters, orphanages, NGOs that collect for their own people) say by voice what they need today.
- **Restaurants** say by voice what's left, add a photo and a "safe until" time, and tick a short safety checklist.
- AI structures both. **Laya**, a decision model, double-checks diet and flags safety concerns with probabilities.
- The engine offers food only to recipients who need it, ranked by a **Bayesian reliability estimate** (a probability *and* how sure we are).
- A **risk model** watches accepted pickups. When the chance of failure gets high, it asks a backup to **stand by**; if the first recipient drops out, the backup takes over instantly.
- Recipients can reply in **free text** ("we can only take 12", "stuck in traffic"); Laya works out what they mean.

The judges must *see* the AI decide. Your most important screens: **Live Board** and **Offer Timeline** on a projector.

## 2. Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Plain `fetch` + a polling hook (`usePoll(fn, 2000)`); no heavy state libraries
- Voice: Web Speech API (`window.SpeechRecognition || window.webkitSpeechRecognition`), Chrome/Edge; always an editable textarea fallback
- Port **3000**

## 3. Folder structure

```
frontend/
  package.json  tsconfig.json  next.config.*  tailwind/postcss config  .env.example  README.md
  INTEGRATION_NOTES.md
  src/
    app/
      layout.tsx                          # nav + global "Simulated data" badge + AI status pill (LLM / Laya)
      page.tsx                            # hub: Restaurant / Recipient / Live Board
      restaurant/page.tsx                 # offer intake + guardrail + safety checklist
      recipient/page.tsx                  # demand intake + Telegram link + inbox link
      board/page.tsx                      # LIVE BOARD (projector)
      offers/[id]/page.tsx                # OFFER TIMELINE (risk + standby story)
      collector/[recipientId]/page.tsx    # recipient web inbox (buttons + free-text reply)
      impact/[restaurantId]/page.tsx      # stretch
    components/
      VoiceInput.tsx  PhotoInput.tsx
      ParsedOfferForm.tsx                 # incl. GuardrailPanel + SafetyChecklist
      GuardrailPanel.tsx                  # Laya diet/safety result with probabilities and reasons
      SafetyChecklist.tsx                 # 3 required ticks
      ParsedDemandForm.tsx
      Countdown.tsx  StatusChip.tsx  StatTile.tsx  Timeline.tsx  DemoControl.tsx
      ReliabilityBar.tsx                  # mean dot + 90% interval band + "n pickups"
      RiskMeter.tsx                       # p_fail vs threshold line
      SelectionNote.tsx                   # "Picked by: mean / exploration" with reason
      ReplyBox.tsx                        # free-text reply + "understood as" result card
      UnderstoodCard.tsx                  # intent, probability bars, at-risk %, action taken, source
      AiBadge.tsx                         # "Laya 92%" / "LLM" / "Mock"
    lib/
      api/ types.ts  client.ts  live.ts  mock.ts  mockData.ts  mockAi.ts
      time.ts  usePoll.ts
```

## 4. The API layer (most important architectural rule)

The UI never calls `fetch` directly. It imports `api` from `src/lib/api/client.ts`:

```ts
export interface Api {
  health(): Promise<{ ok: boolean; llm: string; laya: string; telegram: string }>;
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
  collectorInbox(recipientId: string): Promise<{ recipient: Recipient; assignments: (Assignment & { offer: Offer })[] }>;
  impact(restaurantId: string): Promise<ImpactCard>;
  demoReset(): Promise<{ ok: true }>;
  demoFastForward(assignmentId: string): Promise<OfferDetail>;
}
```

`client.ts` picks `live` or `mock` per endpoint group:
```
NEXT_PUBLIC_API_MODE=mock | live | mixed
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
NEXT_PUBLIC_LIVE_GROUPS=health,directory,board          # only for mode=mixed
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
```
Groups: `health`, `directory`, `parse`, `offers`, `demands`, `board`, `assignments`, `replies`, `collector`, `impact`, `demo`.

`live.ts` rules:
- Parse calls send `multipart/form-data` (`transcript`, `photo`, `restaurant_id` / `recipient_id`).
- Errors are `{ error: { code, message } }`. Throw `ApiError` with `code`. `409 INVALID_TRANSITION` → "Someone already updated this" + refresh. `400 CONFIRMATION_REQUIRED` → highlight the checklist.
- Prefix relative `photo_url` with `NEXT_PUBLIC_API_BASE_URL`.

## 5. The mock (must behave like the real backend)

`mock.ts` + `mockAi.ts` keep an in-memory store seeded from `mockData.ts` and implement the **same status rules as contract §5**, so the whole demo runs with no backend.

Seed (identical to backend):

| Recipient | completed / cancelled / no_show | p_complete | ≈ km | Open demand |
| --- | --- | --- | --- | --- |
| Hope Shelter | 18 / 1 / 1 | 0.86 (0.73–0.96) | 1.2 | 20 veg |
| Sunrise Elders Home | 12 / 0 / 0 | 0.93 (0.79–1.00) | 3.8 | 20 veg |
| Little Stars Home | 9 / 3 / 2 | 0.63 (0.42–0.81) | 2.5 | 15 any |
| Saathi NGO | 4 / 2 / 3 | 0.45 (0.22–0.70) | 1.0 | 25 any |
| New Dawn Shelter | 0 / 0 / 0 | 0.50 (0.05–0.95) | 2.0 | 15 any |

Restaurants: `Koramangala Kitchen`, `Indiranagar Tiffins`. All `is_simulated_history: true`.
(90% intervals of a Beta(1 + completed, 1 + cancelled + no_show) posterior; hard-coding them in the mock is fine.)

Mock behaviour:
- `parseOffer`: regex parse (numbers + plates/people/kg; veg / non-veg / chicken / egg; "till 10"; "made at 7"). Guardrail via `mockAi`: "chicken|egg|mutton|fish" → nonveg 0.97; ambiguous words like "pulao, raita" without "veg" → veg 0.71 (needs confirmation); "smell|left out|since afternoon|uncovered" → safety concern 0.8. 600 ms delay.
- `createOffer`: rank by `total`, split meals (40 veg → Hope 20, Sunrise 20), timeline events with reasons.
- Timers via `setInterval(1000)`: accept timeout 45 s; reconfirm sent 20 s after accept; reconfirm timeout 30 s; standby timeout 45 s.
- Risk: `p_fail = 1 − p_complete × (1 − at_risk)`; if > 0.25 → create a standby assignment for the next-best recipient with `backup_alerted` event.
- `reply`: `mockAi` intent rules ("only N" → accept_partial 0.9; "traffic|late|stuck" → running_late 0.88 with at_risk 0.78; "yes|coming|ok" → still_coming 0.9; "can't|cannot|sorry" → cancel/decline 0.85; anything else → question 0.5 → needs clarification). Apply the same table as the backend plan §7.6.
- Silence at reconfirm with an `on_standby` backup → promote instantly with `standby_promoted` event.

Keep `mock.ts` permanently. It's the stage fallback if the backend dies.

## 6. Screens

### 6.1 Hub `/`
Three large tiles and a one-line promise. Small AI status pill in the header: "LLM: ready · Laya: ready" (or "Mock").

### 6.2 Restaurant intake `/restaurant` (mobile-first)
1. Restaurant picker.
2. `VoiceInput`: big mic, live transcript, English-India / Hindi toggle, editable textarea. Example placeholder: "Around 40 plates veg biryani, made at 7, safe till 10, pick up from back gate."
3. `PhotoInput` (optional).
4. "Understand my message" → `api.parseOffer` → `ParsedOfferForm`:
   - All fields editable; missing fields highlighted; `followup_question` as a chat bubble with a voice/text answer that re-parses `original + " " + answer`.
   - **`GuardrailPanel`**: shows Laya's diet answer ("Vegetarian — 97% (Laya)") and safety-concern probability. If `needs_confirmation`, show an amber panel listing `reasons` and ask the explicit question ("Is every item vegetarian?" Yes / No — No switches diet to non-veg).
   - **`SafetyChecklist`** (always shown, required): "Kept covered", "Kept hot or refrigerated", "Not served on plates / untouched". Submitting sets `confirmations.safety_checklist_confirmed`; the diet answer sets `diet_confirmed`.
   - `safe_until` required, must be in the future.
5. "Send to recipients" → `api.createOffer` → `/offers/[id]`.

### 6.3 Recipient intake `/recipient` (mobile-first)
1. Recipient picker with `ReliabilityBar` and the explanation sentence.
2. Telegram link: `https://t.me/{username}?start={link_code}`; "Linked" when `telegram_linked`. Link to `/collector/[id]` ("No Telegram? Use the web inbox").
3. Voice demand → parse → `ParsedDemandForm` → `api.createDemand` → toast + link to Live Board.

### 6.4 Live Board `/board` (projector; polls every 2 s)
- **Headline StatTiles:** Collected within safe window (big %), Meals rescued, Dropouts caught, Backups promoted, Replies understood, Sent to fallback. "Simulated" badge when `stats.is_simulated`.
- **Left: Offers** — card per offer: restaurant, dish, segmented bar (collected / assigned / unassigned), `Countdown`, `StatusChip`, a small `RiskMeter` showing `highest_p_fail` vs threshold when an offer is active, latest event text. Click → `/offers/[id]`.
- **Right: Recipients** sorted by `reliability.total` with `ReliabilityBar` (dot = p_complete, band = 90% interval, label "18 of 20 pickups") — New Dawn's wide band must be visibly different from Hope's narrow band. Below it, the **Demand board**.
- New events animate in subtly.

### 6.5 Offer Timeline `/offers/[id]` (the story; polls every 2 s)
- Header: dish, meals, photo, big `Countdown`, status, AI guardrail summary if it flagged anything.
- **Assignments strip** — one card per assignment:
  - Recipient, meals, distance, status chip, live countdown for the active deadline.
  - `SelectionNote` ("Ranked by reliability" or "Exploration: no history yet").
  - `RiskMeter` with `p_fail` and the threshold line; turns amber above it.
  - If `is_standby`: a "Backup" tag linking to the assignment it covers.
  - If `last_reply`: an `UnderstoodCard` (quoted text, intent + probability, at-risk %, action taken, source badge).
  - `DemoControl` "Skip wait" → `api.demoFastForward`.
- **Timeline:** every event as a sentence with IST time. Colours with text labels: neutral (offered, accepted), blue (reply_understood, risk_check, exploration), amber (backup_alerted, standby_ready, rematch, split, guardrail_flag), red (no_response, cancelled), green (standby_promoted, collected), grey (fallback). The `standby_promoted` moment must be unmistakable — this is the climax of the demo.
- When collected: "All 20 meals collected with 41 min to spare."

### 6.6 Collector inbox `/collector/[recipientId]` (mobile; Telegram fallback)
- Card per assignment with buttons for its status: Accept / Decline → Still coming / Cancel → Collected / Cancel; standby: "I can stand by" / "Not today".
- **`ReplyBox`** under each card: "Reply in your own words" → `api.reply` → `UnderstoodCard` showing what the AI understood and what happened. If `needs_clarification`, show the question and keep the buttons.
- Polls every 2 s. Must work perfectly — it's the stage backup for Telegram.

### 6.7 Impact card (stretch) `/impact/[restaurantId]`

## 7. Design direction
- Use the `frontend-design` skill if available. Calm, trustworthy "dispatch board": warm neutral background, one strong accent, large numbers, generous spacing, readable from the back of a room.
- Show uncertainty honestly and visually: interval bands, probability bars, threshold lines. No fake precision (round probabilities to whole percent).
- Never colour-only: every chip and meter has a text label.
- Mobile pages: one column, big buttons, mic as the hero.
- IST times (`9:40 pm`) and countdowns everywhere there's a deadline.
- Loading, empty and error states everywhere. No raw JSON on screen.

## 8. Build schedule (9 hours)

| Time | Task | Done when |
| --- | --- | --- |
| 0:00–0:45 | Scaffold, `types.ts` (contract v2), `client.ts` switch, `mockData.ts`, layout + hub | Runs on :3000 in mock mode |
| ~0:45–1:00 | **SYNC 1:** `mixed` with `health,directory,board` | Board shows real seeded data |
| 0:45–2:30 | `mock.ts` + `mockAi.ts` (full status machine, risk, standby, replies); `VoiceInput`, `PhotoInput`; restaurant intake with GuardrailPanel + SafetyChecklist; recipient intake | Intake flows work on mocks |
| 2:30–3:45 | Live Board with `ReliabilityBar`, `RiskMeter`; Offer Timeline with assignments strip | Risk → standby → promotion story visible on mocks |
| 3:45–4:45 | Collector inbox with `ReplyBox` + `UnderstoodCard`; demo controls | All core screens done on mocks |
| **4:45** | **SYNC 2:** switch to live group by group (CONNECTION_PLAN) | Judge path works live |
| 4:45–6:00 | Design pass, projector readability, empty/error states | |
| 6:00–7:00 | Integration fixes; confirm mock mode still runs everything | |
| **7:00** | **FEATURE FREEZE** | |
| 7:00–8:00 | Run the 4 demo scenarios 5× live and in mock mode | |

**Cut order if behind:** impact card → hub polish → photo preview → exploration styling.
**Never cut:** Live Board, Offer Timeline (risk + standby), Collector inbox (buttons + reply box), restaurant intake with guardrail + checklist.

## 9. INTEGRATION_NOTES.md (your channel to the backend)
For each item: endpoint, what the contract says, what you got, whether it blocks the demo. List the env values the backend must set for you (CORS origin, Telegram bot username). The backend reads this file; it never edits your folder.

## 10. Definition of done
- `npm install && npm run dev` runs on :3000.
- `NEXT_PUBLIC_API_MODE=mock` runs all four demo scenarios with no backend.
- `NEXT_PUBLIC_API_MODE=live` runs them against the backend.
- Every simulated element is labelled; every AI output shows confidence and source; every demo button says "Demo control".
- `frontend/README.md` explains setup, env vars and the demo click-path.
