# AnnaRelay

**Leftover food, matched to people who need it, collected before it spoils.**

*Anna* (अन्न) means food; *Relay* is the handoff that keeps going even when someone drops the baton.

AnnaRelay matches restaurant leftovers to shelters and NGOs that have already said what they need, picks the collector most likely to show up, watches every pickup for signs of trouble, and puts a backup on standby before anyone drops out.

Alternative names: **LastPlate**, **PlateRelay**.

---

## Where the AI is (and isn't)

| Job | Technique | Why it's there |
| --- | --- | --- |
| Turn messy voice notes into structured offers and demands | Generative LLM | Restaurants and shelters speak naturally, in mixed languages |
| Double-check diet and flag food-safety concerns | **Laya decision model** (probabilities) | A veg-only shelter must never get non-veg food; unsafe food must be caught |
| Understand free-text replies ("only 12", "stuck in traffic") | **Laya** intent + at-risk probability, LLM extracts numbers/times | Real people don't press buttons; replies change what should happen |
| Decide who gets the food | **Bayesian reliability** with uncertainty + **Thompson sampling** | Picks who's most likely to show up, while giving new shelters a fair chance when time allows |
| Decide when to call a backup | **Risk model** combining track record and reply signals | Acts *before* a dropout, not after |
| Deadlines, safety windows, matching rules, fallbacks | Plain, tested code | AI never makes these calls alone |

No RAG: there's nothing to look up mid-rescue, so it would be decoration.

---

## How to use these files

| File | Who | How |
| --- | --- | --- |
| `contract/API_CONTRACT.md` | Everyone | Commit first. Both agents build against it. Only humans edit it. |
| `BACKEND_AGENT_PLAN.md` | Backend + AI teammate(s) | Paste into the coding agent with the contract |
| `FRONTEND_AGENT_PLAN.md` | Frontend teammate | Paste into the coding agent with the contract |
| `CONNECTION_PLAN.md` | Both, at sync points | Follow phase by phase |

Opening line for each agent:
> "Read `contract/API_CONTRACT.md` and `<YOUR_PLAN>.md` fully. Follow the HARD RULES at the top. Start with the first row of the build schedule."

---

## Step 0 — before the hackathon

1. **Repo layout** (one person, 5 min):
   ```
   promptverse/
     README.md  .gitignore   # node_modules, .env, .env.local, backend/data/*, backend/uploads/*, .next
     contract/API_CONTRACT.md
     backend/   frontend/    # empty; each agent fills its own
   ```
2. **Keys** (20 min): generative LLM key, Vercel AI Gateway key for Laya, Telegram bot token. Test one Laya call with the curl in `CONNECTION_PLAN.md`.
3. **Check the Laya free period** covers your hackathon date (free through 31 Oct 2026).
4. **Call one food-rescue coordinator** and ask how many offers they miss and why. Put the answer on your first slide.

Git: everyone on `main`, stage only your own folder, `git pull --rebase` before every push.

---

## Shared timeline (9 hours)

| Time | Backend + AI | Frontend |
| --- | --- | --- |
| 0:00 | Scaffold, seed, Bayesian model, `/board` | Scaffold, mock API layer |
| ~0:45 | **SYNC 1** — read-only endpoints live | Board + directory to live |
| 0:45–4:45 | Parsing + Laya guardrail → matching + Thompson → risk + standby → Telegram | Intake + guardrail UI → Live Board → Offer Timeline → Inbox (on mocks) |
| **4:45** | **SYNC 2** — full loop live | |
| 4:45–6:00 | Free-text replies via Laya; tests | Reply box + design pass |
| 6:00–7:00 | Integration fixes | Integration fixes |
| **7:00** | **FEATURE FREEZE** | |
| 7:00–8:00 | Run the 4 scenarios; warm AI caches; record backup video | |
| 8:00–9:00 | Rehearse the pitch three times | |

## The four demo scenarios
1. **Happy path + split:** 40 meals → two shelters, ranked by reliability → collected.
2. **Risk → standby → dropout caught (the climax):** collector replies "stuck in traffic" → Laya flags risk → backup stands by → collector goes silent → backup takes over instantly → collected in time.
3. **Free-text partial:** "we can only take 8" → 8 accepted, the rest re-matched.
4. **Too late:** nobody can make it → animal feed or compost (simulated partner), recorded.

## Honesty rules (judges will check)
- Seeded recipients, histories and partners are labelled **Simulated**.
- AI outputs show confidence and source (Laya / LLM / Mock). Laya's probabilities aren't guaranteed to be calibrated, so thresholds lean cautious.
- Demo buttons say **Demo control**.
- We claim one demo metric: **share of offers collected within their safe window.** No real-world waste-reduction numbers.
