// Drives a voice-agent call in text mode (no microphone) and watches the live SSE stream alongside.
// Usage: npx tsx scripts/agent-check.ts [restaurant|recipient|unsafe|hindi]    (backend must be running)
import WebSocket from "ws";

const PORT = process.env.PORT ?? "4000";
const kind = process.argv[2] ?? "restaurant";
const scripts: Record<string, { role: string; lines: string[] }> = {
  restaurant: { role: "restaurant", lines: [
    "Hi, this is Koramangala Kitchen. We have about 40 plates of veg biryani left.",
    "It was made at 2 and it's safe till 10 tonight. Pickup from the back gate.",
    "yes that's right",
    "yes, all covered and kept hot",
  ] },
  unsafe: { role: "restaurant", lines: [
    "Indiranagar Tiffins here, 20 plates dal rice, it has been sitting out since afternoon",
    "cooked at 1, safe till 9",
    "yes",
    "no, it was not covered",
  ] },
  hindi: { role: "restaurant", lines: [
    "नमस्ते, कोरमंगला किचन से बोल रहा हूँ, तीस प्लेट वेज पुलाव बचा है",
    "दो बजे बनाया था, रात दस बजे तक ठीक है",
    "हाँ सही है",
    "हाँ, सब ढका हुआ था और गरम रखा था",
  ] },
  recipient: { role: "recipient", lines: [
    "Hello, this is New Dawn Shelter. We need food for 25 people tonight.",
    "Anything is fine, veg or non veg. By 9 pm.",
    "yes please",
  ] },
};
const s = scripts[kind];
const t0 = Date.now();
const at = () => `${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s`;

// live stream alongside the call
const sse = await fetch(`http://localhost:${PORT}/api/stream`);
const reader = sse.body!.getReader();
const dec = new TextDecoder();
let sseBuf = "";
const seen: Record<string, number> = {};
void (async () => {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    sseBuf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = sseBuf.indexOf("\n\n")) >= 0) {
      const chunk = sseBuf.slice(0, i);
      sseBuf = sseBuf.slice(i + 2);
      const ev = chunk.match(/^event: (.+)$/m)?.[1];
      if (!ev) continue;
      seen[ev] = (seen[ev] ?? 0) + 1;
      if (ev === "timeline") {
        const d = JSON.parse(chunk.match(/^data: (.+)$/m)![1]);
        console.log(`${at()}   [stream] timeline ${d.event.type}: ${d.event.message.slice(0, 90)}`);
      }
    }
  }
})();

const ws = new WebSocket(`ws://localhost:${PORT}/api/agent/call?role=${s.role}`);
let line = 0;
let audio = 0;
let lastAgentAt = 0;
let sentAt = 0;
const next = () => {
  if (line >= s.lines.length) return;
  const text = s.lines[line++];
  console.log(`${at()}  CALLER: ${text}`);
  sentAt = Date.now();
  ws.send(JSON.stringify({ event: "text", text }));
};

ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  switch (m.type) {
    case "ready":
      console.log(`${at()}  ready ${m.call_id} (stt ${m.stt}, tts ${m.tts})`);
      break;
    case "agent":
      lastAgentAt = Date.now();
      console.log(`${at()}  AGENT [${m.phase}]${sentAt ? ` (+${((Date.now() - sentAt) / 1000).toFixed(1)}s)` : ""}: ${m.text}`);
      break;
    case "audio":
      audio++;
      if (m.index === 0) console.log(`${at()}    first audio for turn ${m.turn} (+${((Date.now() - lastAgentAt) / 1000).toFixed(1)}s after text)`);
      break;
    case "audio_end":
      ws.send(JSON.stringify({ event: "playback_done" })); // simulate the browser finishing playback
      setTimeout(next, 200);
      break;
    case "draft":
      console.log(`${at()}    draft [${m.phase}] missing=${JSON.stringify(m.missing)} confirmed=${JSON.stringify(m.confirmations)}${m.guardrail ? ` guardrail=${m.guardrail.needs_confirmation ? "CONFIRM" : "ok"}:${m.guardrail.reasons.join("; ")}` : ""}`);
      break;
    case "offer_created":
      console.log(`${at()}  >>> OFFER CREATED ${m.offer.id}: ${m.offer.meal_count} ${m.offer.diet}, safe until ${m.offer.safe_until}`);
      break;
    case "demand_created":
      console.log(`${at()}  >>> DEMAND CREATED ${m.demand.id}: ${m.demand.people_count} ${m.demand.diet} by ${m.demand.needed_by}`);
      break;
    case "ended":
      console.log(`${at()}  ENDED: ${m.outcome}  | audio clips: ${audio} | stream events: ${JSON.stringify(seen)}`);
      setTimeout(() => process.exit(0), 300);
      break;
    case "caption":
    case "thinking":
      break;
    default:
      console.log(`${at()}  ${JSON.stringify(m).slice(0, 160)}`);
  }
});
ws.on("error", (e) => {
  console.error("ws error", e.message);
  process.exit(1);
});
setTimeout(() => {
  console.log("timeout");
  process.exit(1);
}, 150000);

export {};
