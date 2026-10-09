# Integration notes (frontend → backend)

The frontend builds strictly to `API_CONTRACT.md` v2. This file is how the frontend tells the backend what it needs. The backend reads it and never edits `frontend/`.

## Env values the backend must set for us

| Backend env | Value | Why |
| --- | --- | --- |
| `FRONTEND_ORIGIN` | `http://localhost:3000` (add `http://<laptop-ip>:3000` for cross-laptop demos, comma-separated) | CORS for every call, including multipart `/parse` and `/transcribe` |
| `TELEGRAM_BOT_USERNAME` | same value as our `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | "Link Telegram" builds `https://t.me/<bot>?start=<link_code>` |

## Status per endpoint (checked against the running backend, all 4 demo scenarios pass)

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/health` | OK | We also read the additive `stt` field (CONTRACT_CHANGES #2). Missing `stt` is handled. |
| `GET /api/restaurants`, `/api/recipients` | OK | |
| `POST /api/offers/parse` (multipart) | OK | `photo_url` is sent back unchanged in `POST /api/offers`; we prefix it with the base URL only for display. |
| `POST /api/offers`, `GET /api/offers/:id` | OK | `400 CONFIRMATION_REQUIRED` highlights the safety checklist. |
| `POST /api/demands/parse`, `POST /api/demands` | OK | |
| `GET /api/board` | OK | `server_time` is used to correct countdowns for clock skew. |
| `POST /api/assignments/:id/<action>` | OK | `409 INVALID_TRANSITION` shows "Someone already updated this" and refreshes. |
| `POST /api/assignments/:id/reply` | OK | |
| `GET /api/collector/:id/inbox` | OK | |
| `GET /api/impact/:id` | OK | |
| `POST /api/demo/reset`, `/api/demo/fast-forward/:id` | OK | Both are labelled "Demo control". |
| `POST /api/transcribe` (CONTRACT_CHANGES #1, optional) | Used when `health.stt === "ready"` | Otherwise we use the browser Web Speech API. On `503 STT_UNAVAILABLE` we switch to Web Speech for the session. Nothing blocks the demo. |

## Open items

- None blocking. `OfferDetail` has no field for the intake guardrail, so the Offer Timeline shows the `guardrail_flag` timeline event instead. That's enough for the demo.
- Request to humans: please fold CONTRACT_CHANGES #1 and #2 (`/api/transcribe`, `health.stt`) into `API_CONTRACT.md` so both sides officially agree on them.
