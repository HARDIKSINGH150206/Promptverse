// Streams a WAV file to /api/transcribe/stream in real time (like a microphone) and prints partials as they arrive.
// Usage: npx tsx scripts/stt-stream-check.ts <file.wav> [language_code]    (backend must be running)
import fs from "node:fs";
import WebSocket from "ws";

const [file, lang = "auto"] = process.argv.slice(2);
if (!file) {
  console.error("usage: tsx scripts/stt-stream-check.ts <file.wav> [language_code]");
  process.exit(1);
}

// --- minimal WAV reader -> mono 16 kHz int16 ---
function toPcm16k(buf: Buffer): Buffer {
  let off = 12, channels = 1, rate = 16000, bits = 16, data: Buffer | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") data = buf.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!data || bits !== 16) throw new Error("need a 16-bit PCM WAV");
  const frames = data.length / 2 / channels;
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += data.readInt16LE((i * channels + c) * 2);
    mono[i] = s / channels;
  }
  const outLen = Math.floor((frames * 16000) / rate);
  const out = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const x = (i * rate) / 16000, i0 = Math.floor(x), f = x - i0;
    const v = (mono[i0] ?? 0) * (1 - f) + (mono[i0 + 1] ?? mono[i0] ?? 0) * f;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), i * 2);
  }
  return out;
}

const pcm = toPcm16k(fs.readFileSync(file));
const CHUNK = 16000 * 2 * 0.2; // 200 ms
const port = process.env.PORT ?? "4000";
const ws = new WebSocket(`ws://localhost:${port}/api/transcribe/stream?language_code=${lang}`);
const t0 = Date.now();
const at = () => `${String(Date.now() - t0).padStart(5)} ms`;

ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "ready") {
    console.log(`${at()}  ready, streaming ${(pcm.length / 32000).toFixed(1)} s of audio`);
    let i = 0;
    const timer = setInterval(() => {
      if (i >= pcm.length) {
        clearInterval(timer);
        console.log(`${at()}  (audio finished, sending end)`);
        ws.send(JSON.stringify({ event: "end" }));
        return;
      }
      ws.send(pcm.subarray(i, i + CHUNK));
      i += CHUNK;
    }, 200);
  } else if (m.type === "partial") console.log(`${at()}  partial  ${m.text}`);
  else if (m.type === "final") console.log(`${at()}  FINAL    ${m.text}`);
  else if (m.type === "done") console.log(`${at()}  DONE     ${m.text}  [${m.language}]`);
  else console.log(`${at()}  ${JSON.stringify(m)}`);
});
ws.on("close", (code) => {
  console.log(`${at()}  closed ${code}`);
  process.exit(0);
});
ws.on("error", (e) => {
  console.error("ws error:", e.message);
  process.exit(1);
});
