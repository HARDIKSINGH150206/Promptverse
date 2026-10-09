// A reusable Sarvam realtime STT session (one per call). Emits partial/final transcripts and VAD
// boundaries. Audio: raw PCM 16-bit LE mono 16 kHz.
import { EventEmitter } from "node:events";
import { WebSocket, type RawData } from "ws";
import { config } from "../config";

const URL_BASE = "wss://api.sarvam.ai/speech-to-text-realtime/ws";

export interface SarvamRealtimeEvents {
  ready: [];
  partial: [text: string, language: string | null];
  final: [text: string, language: string | null];
  speech_start: [];
  error: [message: string];
  closed: [];
}

export class SarvamRealtime extends EventEmitter {
  private ws: WebSocket | null = null;
  private pending: Buffer[] = [];
  private keepalive: NodeJS.Timeout | null = null;
  ready = false;

  constructor(private language: string = "auto") {
    super();
  }

  start(): void {
    if (!config.SARVAM_API_KEY) {
      queueMicrotask(() => this.emit("error", "SARVAM_API_KEY missing"));
      return;
    }
    const params = new URLSearchParams({
      language_code: this.language,
      model: config.SARVAM_STREAM_MODEL,
      sample_rate: "16000",
      encoding: "linear16",
      stream_type: "balanced",
    });
    const ws = new WebSocket(`${URL_BASE}?${params}`, { headers: { "api-subscription-key": config.SARVAM_API_KEY } });
    this.ws = ws;
    ws.on("open", () => {
      for (const b of this.pending) this.sendNow(b);
      this.pending = [];
    });
    ws.on("message", (data: RawData) => {
      let ev: Record<string, any>;
      try {
        ev = JSON.parse(data.toString());
      } catch {
        return;
      }
      const type = ev.event ?? ev.type;
      const lang = (ev.language as string | undefined) ?? null;
      if (type === "session.begin") {
        this.ready = true;
        this.emit("ready");
      } else if (type === "transcript.partial") this.emit("partial", String(ev.text ?? ""), lang);
      else if (type === "transcript.final") {
        const t = String(ev.text ?? "").trim();
        if (t) this.emit("final", t, lang);
      } else if (type === "vad.speech_start") this.emit("speech_start");
      else if (type === "error" && ev.is_fatal !== false) this.emit("error", String(ev.message ?? "Sarvam error"));
    });
    ws.on("unexpected-response", (_req, res) => this.emit("error", `Sarvam realtime HTTP ${res.statusCode}`));
    ws.on("error", (err) => this.emit("error", err.message));
    ws.on("close", () => {
      if (this.keepalive) clearInterval(this.keepalive);
      this.ready = false;
      this.emit("closed");
    });
    this.keepalive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: "ping" }));
    }, 15000);
  }

  private sendNow(buf: Buffer): void {
    this.ws?.send(JSON.stringify({ event: "audio_input", audio: buf.toString("base64") }));
  }

  sendPcm(buf: Buffer): void {
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.sendNow(buf);
    else if (this.ws.readyState === WebSocket.CONNECTING && this.pending.length < 200) this.pending.push(buf);
  }

  close(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: "end" }));
    } catch {
      /* ignore */
    }
    setTimeout(() => ws.terminate(), 300);
  }
}
