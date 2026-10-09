# Contract change proposals (backend → humans)

Nothing here changes the contract until a human updates `API_CONTRACT.md`. The backend keeps building to the current contract.

## Accepted

- **#1 `POST /api/transcribe`**: accepted into `API_CONTRACT.md` v2.1 (2026-10-09).
- **#2 `GET /api/health` → `stt`**: accepted into `API_CONTRACT.md` v2.1 (2026-10-09).

## Open

### #3 Live speech-to-text WebSocket: `ws://<backend>/api/transcribe/stream` (already live, additive)

Words appear on screen while the person is still speaking, instead of after they stop. The backend relays the audio to Sarvam's realtime STT, so the key stays server-side. `POST /api/transcribe` stays as the fallback.

**Connect:** `ws://localhost:4000/api/transcribe/stream?language_code=auto` (`auto` = detect; or `en-IN`, `hi-IN`, `kn-IN`, ...). Only origins in the backend's `FRONTEND_ORIGIN` are accepted.

**Client → server**
- **Binary frames:** raw PCM, **16-bit signed little-endian, mono, 16 000 Hz**, in chunks of about 100–250 ms. Audio sent before `ready` is buffered.
- **Text frame `{"event":"end"}`** when the user taps stop.

**Server → client** (JSON text frames)

| `type` | Fields | Meaning |
| --- | --- | --- |
| `ready` | | Sarvam session is open. |
| `partial` | `text`, `final_text`, `language` | `text` = whole transcript so far **including** the live, still-changing words; show it greyed or italic. `final_text` = the committed part only. Partials may revise earlier words. |
| `final` | `text`, `language` | A segment was committed; `text` = whole committed transcript. |
| `done` | `text`, `language` | Sent after `end`: the full final transcript. The socket then closes (1000). |
| `error` | `code: "STT_UNAVAILABLE"`, `message` | Fall back to recording a blob and calling `POST /api/transcribe`. |

**Suggested browser implementation**
1. `getUserMedia({ audio: true })` → `AudioContext` → an `AudioWorkletNode` that receives Float32 frames at the context's rate (usually 48 kHz).
2. Downsample to 16 kHz (average each block of `rate/16000` samples), convert to Int16 (`Math.max(-1, Math.min(1, x)) * 0x7fff`), and send an `Int16Array.buffer` every ~100 ms with `ws.send(buffer)`.
3. Render `partial.text` live in the transcript box. On stop: stop the mic, send `{"event":"end"}`, wait for `done`, put `done.text` into the **editable** textarea, then call `/api/offers/parse` or `/api/demands/parse` as today.
4. On `error`, or if the socket fails to open, use the existing `POST /api/transcribe` path.

Verified with `npx tsx scripts/stt-stream-check.ts <file.wav>`: first words appear about 1 s after speech starts; the final transcript arrives about 0.4 s after the audio ends.
