// Live speech-to-text: browser <-> our WebSocket <-> Sarvam realtime STT (partials word by word).
// The Sarvam key never leaves the server.
//
// Client protocol (ws://<backend>/api/transcribe/stream?language_code=auto):
//   client -> server: binary frames of raw PCM, 16-bit little-endian, mono, 16 kHz (send ~100-250 ms chunks)
//                     text frame {"event":"end"} when the user stops recording
//   server -> client: {"type":"ready"}                                   Sarvam session open, start sending audio
//                     {"type":"partial","text","final_text","language"}   text = everything so far incl. the live partial
//                     {"type":"final","text","language"}                  a finished segment was committed
//                     {"type":"done","text","language"}                   after "end": the full transcript; socket then closes
//                     {"type":"error","code","message"}                   client should fall back to POST /api/transcribe
import type { IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { config } from "../config";
import { SARVAM_LANGUAGES } from "./stt";

const SARVAM_WS = "wss://api.sarvam.ai/speech-to-text-realtime/ws";

export const streamWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

function send(ws: WebSocket, msg: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

streamWss.on("connection", (client: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const requested = url.searchParams.get("language_code") ?? "auto";
  const lang = requested === "unknown" ? "auto" : SARVAM_LANGUAGES.includes(requested) ? requested : "auto";

  if (!config.SARVAM_API_KEY) {
    send(client, { type: "error", code: "STT_UNAVAILABLE", message: "SARVAM_API_KEY missing; use POST /api/transcribe" });
    client.close(1011);
    return;
  }

  const params = new URLSearchParams({
    language_code: lang,
    model: config.SARVAM_STREAM_MODEL,
    sample_rate: "16000",
    encoding: "linear16",
    stream_type: "balanced",
  });
  const upstream = new WebSocket(`${SARVAM_WS}?${params}`, { headers: { "api-subscription-key": config.SARVAM_API_KEY } });

  const finals: string[] = [];
  let language: string | null = lang === "auto" ? null : lang;
  let pending: Buffer[] = []; // audio that arrived before Sarvam was ready
  let ended = false;
  let doneSent = false;
  const fullText = (partial = "") => [...finals, partial].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const finish = () => {
    if (doneSent) return;
    doneSent = true;
    send(client, { type: "done", text: fullText(), language });
    client.close(1000);
  };
  const keepalive = setInterval(() => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ event: "ping" }));
  }, 15000);

  const sendAudio = (buf: Buffer) => {
    upstream.send(JSON.stringify({ event: "audio_input", audio: buf.toString("base64") }));
  };

  upstream.on("open", () => {
    for (const b of pending) sendAudio(b);
    pending = [];
    if (ended) upstream.send(JSON.stringify({ event: "end" }));
  });

  upstream.on("message", (data: RawData) => {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(data.toString());
    } catch {
      return;
    }
    const type = ev.event ?? ev.type;
    if (ev.language) language = ev.language;
    switch (type) {
      case "session.begin":
        send(client, { type: "ready" });
        break;
      case "transcript.partial":
        send(client, { type: "partial", text: fullText(ev.text ?? ""), final_text: fullText(), language });
        break;
      case "transcript.final":
        if (ev.text?.trim()) finals.push(ev.text.trim());
        send(client, { type: "final", text: fullText(), language });
        break;
      case "session.end":
        finish();
        break;
      case "error":
        console.warn("[stt-stream] Sarvam error:", ev.code, ev.message);
        if (ev.is_fatal !== false) {
          send(client, { type: "error", code: "STT_UNAVAILABLE", message: String(ev.message ?? "Sarvam error") });
          client.close(1011);
        }
        break;
    }
  });

  upstream.on("unexpected-response", (_req, res) => {
    console.warn("[stt-stream] Sarvam refused the connection:", res.statusCode);
    send(client, { type: "error", code: "STT_UNAVAILABLE", message: `Sarvam realtime HTTP ${res.statusCode}` });
    client.close(1011);
  });
  upstream.on("error", (err) => {
    console.warn("[stt-stream] upstream error:", err.message);
    send(client, { type: "error", code: "STT_UNAVAILABLE", message: err.message });
    client.close(1011);
  });
  upstream.on("close", (code, reason) => {
    clearInterval(keepalive);
    if (ended) finish();
    else if (client.readyState === WebSocket.OPEN) {
      send(client, { type: "error", code: "STT_UNAVAILABLE", message: `Sarvam closed (${code} ${reason.toString()})` });
      client.close(1011);
    }
  });

  client.on("message", (data: RawData, isBinary: boolean) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (upstream.readyState === WebSocket.OPEN) sendAudio(buf);
      else if (upstream.readyState === WebSocket.CONNECTING) pending.push(buf);
      return;
    }
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === "end" && !ended) {
        ended = true;
        if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify({ event: "end" }));
        // if Sarvam never confirms, still hand back what we have
        setTimeout(finish, 4000);
      }
    } catch {
      /* ignore non-JSON text */
    }
  });

  client.on("close", () => {
    clearInterval(keepalive);
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
  });
});
