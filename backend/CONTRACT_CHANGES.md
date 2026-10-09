# Contract change proposals (backend → humans)

Nothing here changes the contract until a human updates `API_CONTRACT.md`. The backend keeps building to the current contract. Both items below are **additive**, so nothing existing breaks.

## 1. `POST /api/transcribe` (new, already live, optional for the frontend)

Server-side multilingual speech-to-text, as an alternative to the browser Web Speech API. Web Speech is Chrome/Edge only and weak on Hindi/Kannada code-mixing.

- Request: `multipart/form-data` with `audio` (required; MediaRecorder webm/ogg is fine, < 30 s), `language_code` (optional, default `"unknown"` = auto-detect across 23 Indian languages), `mode` (optional; saaras:v3 only).
- Response `200`: `{ "text": string, "language_code": string | null, "language_probability": number | null, "source": "sarvam" | "groq" }`
- `503 STT_UNAVAILABLE` if both Sarvam and Groq Whisper fail; the UI should fall back to the editable textarea.
- Suggested frontend flow: record with MediaRecorder → `POST /api/transcribe` → put `text` in the editable textarea → existing `/parse` call.

## 2. `GET /api/health` gains `stt: "ready" | "missing_key" | "disabled"`

An extra key; existing fields are unchanged.
