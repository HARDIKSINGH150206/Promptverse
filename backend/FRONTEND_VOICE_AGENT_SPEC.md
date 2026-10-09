# Voice agent + live stream: frontend build spec

The backend is live and tested for everything below. The wire protocol is in `API_CONTRACT.md` v3 (sections "Live stream", "Voice agent call", "Speech-to-text"). This file is the UX and implementation guide for building against it.

**Goal:** no forms on stage. A restaurant (or shelter) taps **Call AnnaRelay**, talks, and watches the offer assemble itself, then the matching play out, on the same screen with no tab switching.

---

## 1. The call screen (`/call?role=restaurant` and `/call?role=recipient`)

Layout, desktop (stack on mobile):

```
┌──────────────── left: the call ────────────────┐┌──────────── right: the live card ─────────────┐
│   ( orb )  reacts to mic level + agent audio    ││  Koramangala Kitchen            [Veg]  [LIVE] │
│   "Listening…" / "Thinking…" / "Speaking…"      ││  40 plates · Veg biryani                       │
│                                                 ││  Cooked 2:00 pm · Safe until 10:00 pm          │
│   captions (last 3 turns, newest at bottom)     ││  Pickup: back gate                             │
│   AGENT  Let me read that back: …               ││  ── AI checks ─────────────────────────────    │
│   YOU    yes that's right ▍ (partial, greyed)   ││  Diet check   veg 98%   ✓                      │
│                                                 ││  Safety check 5%        ✓                      │
│   [ Hang up ]   [ ⌨ type instead ]              ││  Confirmed aloud: ☑ details  ☐ safety checklist │
└─────────────────────────────────────────────────┘└────────────────────────────────────────────────┘
```

- **Start:** `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`, then open `ws://<api>/api/agent/call?role=restaurant` (add `restaurant_id` if the user is already known).
- **Orb states** come from messages: `caption` with `final:false` = listening; `thinking` = thinking pulse; `audio` playing = speaking (scale the orb with playback volume).
- **Captions:** `agent.text` appears instantly, before the audio. `caption` (speaker user) partials update one line in place; `final:true` locks it.
- **Typed fallback:** a small input that sends `{"event":"text","text":...}`. Always offer it: noisy venues happen.

## 2. The live card: skeletons that fill in

Driven by `draft` messages (on the call socket) or `call.draft` (on `/api/stream`, so a second screen such as the projector can mirror the call).

- Every field in `missing` renders as a **skeleton bar**. When a field arrives, swap the skeleton for the value with a short fade or slide (150–250 ms) and a brief highlight.
- `guardrail` arrives in phase `confirm_details`: show the **AI checks** block. Each row shows a label, a probability bar and a ✓ or ⚠. If `needs_confirmation`, list `reasons` in an amber callout.
- `confirmations.diet_confirmed` / `safety_checklist_confirmed`: tick the boxes **when the caller says yes**. This is the visible proof that a human confirmed safety and the AI did not.
- Show `phase` as a small stepper: Details → Read-back → Safety check → Live.

## 3. The hand-off: card becomes the live offer (no tab switch)

On `offer_created` (restaurant) the card morphs in place into the offer view:

1. Badge flips from **DRAFT** to **LIVE**, and the "safe for" countdown starts (`safe_until`).
2. Open `EventSource(<api>/api/stream?offer_id=<id>)`.
3. `timeline` events: append each to a live timeline with an entrance animation. Optionally the agent's narration plays at the same time.
4. `offer` events: render assignments as cards that **appear one by one** (stagger 120 ms): recipient, meals, reliability %, distance, and `selection.reason`. While `status === "offered"` show a pulsing "waiting for reply" chip. Flip it to Accepted, Collected or Standby as updates arrive.
5. `ended` from the call: keep the screen. It stays live through `/api/stream`.

For recipients, `demand_created` shows the demand card; then watch `board` for offers to that recipient.

## 4. Live Board without polling

Replace the 2 s poll with `EventSource(<api>/api/stream)`:

- `hello` / `board` → replace the board state.
- `timeline` → toast or ticker ("Hope Shelter accepted 20 meals").
- `call.started` / `call.draft` / `call.ended` → a "📞 Live call" chip on the board, with the draft card mirrored. Great on a projector while someone calls from a phone.
- On `EventSource` error, fall back to polling `/api/board` until it reconnects (the browser retries automatically; the server sends `retry: 2000`).

Skeletons: show them on first load until `hello` arrives, and for any card whose data is still pending.

## 5. Audio: capture (mic to 16 kHz PCM) and playback

**Capture worklet** (`public/pcm-worklet.js`):

```js
class Pcm16k extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = []; this.pos = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    // naive decimation with averaging, good enough for speech
    for (let i = 0; i < ch.length; i++) {
      this.acc.push(ch[i]);
      if (this.acc.length >= this.ratio) {
        const v = this.acc.reduce((a, b) => a + b, 0) / this.acc.length;
        this.acc = [];
        this.buf = this.buf || new Int16Array(1600); // 100 ms
        this.buf[this.pos++] = Math.max(-1, Math.min(1, v)) * 0x7fff;
        if (this.pos === this.buf.length) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = null; this.pos = 0; }
      }
    }
    return true;
  }
}
registerProcessor("pcm16k", Pcm16k);
```

```ts
const ctx = new AudioContext();
await ctx.audioWorklet.addModule("/pcm-worklet.js");
const src = ctx.createMediaStreamSource(stream);
const node = new AudioWorkletNode(ctx, "pcm16k");
node.port.onmessage = (e) => ws.readyState === 1 && ws.send(e.data); // ArrayBuffer of Int16 PCM
src.connect(node); // do NOT connect to ctx.destination (no echo)
```

**Playback queue:** each `audio` message is a base64 WAV for one sentence. Play them in `index` order per `turn`:

```ts
const queue: AudioBuffer[] = []; let playing: AudioBufferSourceNode | null = null;
async function enqueue(b64: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  queue.push(await ctx.decodeAudioData(bytes.buffer));
  if (!playing) playNext();
}
function playNext() {
  const buf = queue.shift();
  if (!buf) { playing = null; ws.send(JSON.stringify({ event: "playback_done" })); return; }
  playing = ctx.createBufferSource(); playing.buffer = buf; playing.connect(ctx.destination);
  playing.onended = playNext; playing.start();
}
// on {"type":"interrupt"}: queue.length = 0; playing?.stop(); playing = null;
// on {"type":"audio_unavailable"}: speechSynthesis.speak(new SpeechSynthesisUtterance(msg.text))
```

Call `ctx.resume()` from the "Call" button's click handler (autoplay policy).

## 6. Demo script (about 45 s on stage)

1. Projector: Live Board (streaming). Phone or laptop: `/call?role=restaurant`.
2. Say: *"Hi, this is Koramangala Kitchen, we have about 40 plates of veg biryani, made at 2, safe till 10 tonight, pick up from the back gate."* The card fills in live.
3. The agent reads it back; say *"yes"*. It reads the safety checklist; say *"yes"*. Both boxes tick.
4. The card flips to LIVE, and the agent narrates: *"Offering 20 meals to Hope Shelter: 86 percent reliable, 1.2 km away…"*. The assignment cards pop in and the projector board updates at the same moment.
5. Hindi works too: *"नमस्ते, कोरमंगला किचन से बोल रहा हूँ, तीस प्लेट वेज पुलाव बचा है…"*

Backend test harness (no mic): `cd backend && npx tsx scripts/agent-check.ts restaurant|unsafe|hindi|recipient`.
