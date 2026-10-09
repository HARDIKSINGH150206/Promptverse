# AnnaRelay — Connection Plan v2 (frontend ↔ backend)

Written from the frontend side, for both agents and the humans running them: how the mock-backed frontend switches to the real backend one piece at a time, and what the backend must provide at each step.

**Rules still apply:** the frontend agent changes only `frontend/`, the backend agent only `backend/`. Issues go in `frontend/INTEGRATION_NOTES.md` (frontend → backend) or `backend/CONTRACT_CHANGES.md` (backend → humans). Only humans edit `contract/API_CONTRACT.md`.

---

## 1. Local setup

| | Backend | Frontend |
| --- | --- | --- |
| Port | 4000 | 3000 |
| Start | `cd backend && npm run dev` | `cd frontend && npm run dev` |
| Env | `FRONTEND_ORIGIN=http://localhost:3000` | `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000` |

Run both on one laptop for the demo. Across laptops on the same Wi-Fi: `NEXT_PUBLIC_API_BASE_URL=http://<backend-ip>:4000` and add the frontend origin to `FRONTEND_ORIGIN`.

**Backend must provide at every step:** CORS for the frontend origin (incl. `OPTIONS`, `Content-Type`, multipart), `snake_case` keys, ISO UTC times, `{ error: { code, message } }`, photos at `/uploads/<file>`.

---

## 2. Keys to get before the hackathon (one person, 20 minutes)

| Key | Where | Used for | If missing |
| --- | --- | --- | --- |
| Generative LLM key | Your provider's console | Transcript → fields | `LLM_PROVIDER=mock` |
| `AI_GATEWAY_API_KEY` | Vercel dashboard → AI Gateway → API keys | Laya decision model (`convaiinnovations/laya-free`) | `DECISION_PROVIDER=mock` |
| Telegram bot token | @BotFather | Recipient messages | Web inbox only |

Check the Laya free period still covers your hackathon date (free through 31 Oct 2026 per Vercel's announcement), and test one call with `curl` the day before.

---

## 3. Connect in phases (`NEXT_PUBLIC_API_MODE=mixed` + `NEXT_PUBLIC_LIVE_GROUPS`)

### Phase 1 — ~0:45–1:00: read-only data
`NEXT_PUBLIC_LIVE_GROUPS=health,directory,board`
```bash
curl -s localhost:4000/api/health
curl -s localhost:4000/api/recipients
curl -s localhost:4000/api/board
```
Check: Live Board shows five recipients; New Dawn's reliability band is visibly wider than Hope's; "Simulated" badge shows; AI status pill reads the backend's `llm` / `laya` values.

### Phase 2 — ~2:00–2:30: AI parsing + Laya guardrail
`NEXT_PUBLIC_LIVE_GROUPS=health,directory,board,parse`
```bash
# clear veg -> no confirmation needed
curl -s -F restaurant_id=<r_id> -F "transcript=around 40 plates veg biryani made at 7 safe till 10 back gate" localhost:4000/api/offers/parse
# ambiguous diet -> guardrail.needs_confirmation true
curl -s -F restaurant_id=<r_id> -F "transcript=30 plates pulao and raita made at 8 safe till 11" localhost:4000/api/offers/parse
# safety concern -> safety_concern_probability high
curl -s -F restaurant_id=<r_id> -F "transcript=20 plates dal rice, it has been sitting out since afternoon, safe till 10" localhost:4000/api/offers/parse
```
Check: GuardrailPanel shows Laya's probabilities and reasons; follow-up question appears when `safe_until` is missing.

Also verify Laya directly (backend person):
```bash
curl https://ai-gateway.vercel.sh/v1/evaluate \
  -H "Authorization: Bearer $AI_GATEWAY_API_KEY" -H "Content-Type: application/json" \
  -d '{"model":"convaiinnovations/laya-free","state":"traffic is really bad, may be late",
       "questions":{"at_risk":{"type":"boolean","instructions":"Is there any sign this collector might not arrive in time?"}},
       "providerOptions":{"gateway":{"only":["boundless"]}}}'
```

### Phase 3 — ~3:45–4:45: full loop (SYNC 2)
`NEXT_PUBLIC_LIVE_GROUPS=health,directory,board,parse,offers,demands,assignments,collector` → then `NEXT_PUBLIC_API_MODE=live`.

Smoke test (run `Demo control → Reset` first):
1. Restaurant: 40 veg meals, safe until ~75 min away, tick checklist → Offer Timeline shows Hope 20 + Sunrise 20 with "Ranked by reliability" notes.
2. Inbox (Hope) → Accept. Inbox (Sunrise) → Accept. Both → Still coming → Collected → headline metric updates.
3. Reset. 20 veg meals → Hope offered → Accept.
4. Inbox (Hope) → reply via buttons only for now. Wait for reconfirm → do nothing → "Skip wait" → `no_response` → `rematch` → Sunrise offered.

### Phase 4 — ~4:45–6:00: risk, standby and free-text replies
`replies` group live.
1. Reset. 20 veg meals → Hope accepts.
2. Hope's inbox ReplyBox: "traffic is really bad, may be late" → UnderstoodCard: running late (~90%), at-risk high → Offer Timeline: `risk_check` → `backup_alerted` for Sunrise; RiskMeter above threshold.
3. Sunrise's inbox → "I can stand by" → `standby_ready`.
4. Hope reconfirm → do nothing → "Skip wait" → **`standby_promoted`**: Sunrise takes over instantly, no new offer round.
5. Sunrise → Collected → "collected with N min to spare".
6. Partial: reset → 15 non-veg meals → Little Stars offered → reply "we can only take 8" → 8 accepted, 7 re-matched to New Dawn.
7. Unclear: reply "hmm let me check" → `needs_clarification`, no state change.

### Phase 5 — Telegram on real phones
Backend sets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`; frontend sets `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Link via `t.me/<bot>?start=<link_code>`. Repeat Phase 4 using Telegram buttons and **typed Telegram messages**. The web timeline must update within ~2–3 s.

### Phase 6 — demo controls (and impact if built)

---

## 4. Mismatch checklist

| Symptom | Likely cause | Fix side |
| --- | --- | --- |
| CORS error | Origin/preflight not allowed | Backend |
| `400 CONFIRMATION_REQUIRED` | Checklist/diet not sent as `true` | Frontend |
| Guardrail always "needs confirmation" with reason "Automatic check unavailable" | Laya key missing, quota, or network | Backend (check `/api/health` → `laya`) |
| Reply understood but nothing changed | Intent probability < 0.70 (by design) or invalid for the current status | Show clarification; check the reply table |
| Standby never requested | `p_fail` under 0.25, or no eligible candidate left | Expected for reliable recipients; check RiskMeter |
| Times off by 5:30 h | UTC treated as local | Frontend formats; backend always sends UTC |
| Photo missing | Relative `photo_url` not prefixed | Frontend |
| 409 on buttons | Status already changed | Frontend refreshes |
| Board frozen | Scheduler crashed | Backend (try/catch per step) |
| Telegram silent | Token/link/bot not started | Backend; use web inbox meanwhile |

---

## 5. Stage fallbacks (decide before the 7:00 freeze)

1. **LLM down:** cache, then `LLM_PROVIDER=mock`.
2. **Laya down:** cache, then `DECISION_PROVIDER=mock` — the UI must show source "Mock" honestly.
3. **Telegram down:** web inbox on a phone.
4. **Backend down:** frontend `NEXT_PUBLIC_API_MODE=mock`.
5. **Wi-Fi bad:** phone hotspot.
6. **Everything down:** recorded backup video (record at 7:30).

---

## 6. Sign-off before freeze

- [ ] Scenario 1 (split + collected) live, 3× in a row
- [ ] Scenario 2 (risk → standby → dropout → promotion) live, 3× in a row
- [ ] Scenario 3 (free-text partial) live, 3×
- [ ] Scenario 4 (too late → fallback) live, 3×
- [ ] Telegram buttons and typed replies update the web timeline in under 3 s
- [ ] Guardrail flags the ambiguous-diet and safety-concern demo sentences
- [ ] Mock mode runs all four scenarios with the backend stopped
- [ ] All simulated data labelled; AI outputs show confidence and source
- [ ] AI cache warmed with every exact demo sentence (LLM and Laya)
