"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import { api, isLive } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/types";
import { WS_BASE_URL } from "@/lib/api/live";
import { startMic, type Mic as MicHandle } from "@/lib/voice/audio";
import { useHealth } from "./providers";
import { cx, inputClass } from "./ui";

// Minimal Web Speech API types (not in the TS DOM lib).
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { results: ArrayLike<SpeechResult> }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;

function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noop = () => () => {};
function useCapabilities() {
  const browser = useSyncExternalStore(noop, () => !!speechCtor(), () => false);
  const recorder = useSyncExternalStore(
    noop,
    () => typeof window !== "undefined" && "MediaRecorder" in window && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  return { browser, recorder };
}

type Lang = "en-IN" | "hi-IN" | "unknown";
const MAX_RECORD_MS = 28_000;

/**
 * Voice note -> editable text. Uses the backend's multilingual speech-to-text when it reports `stt: ready`
 * (backend/CONTRACT_CHANGES.md #1), otherwise the browser's Web Speech API (Chrome/Edge).
 * The textarea is always there and always editable.
 */
export function VoiceInput({
  id, value, onChange, placeholder, disabled, label = "Your message",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}) {
  const { health } = useHealth();
  const caps = useCapabilities();
  const [serverFailed, setServerFailed] = useState(false);
  const [streamFailed, setStreamFailed] = useState(false);
  const useServer = caps.recorder && !serverFailed && isLive("parse") && health?.stt === "ready";
  // live word-by-word transcription over ws /api/transcribe/stream (contract v3); falls back to record-then-send
  const useStream = useServer && !streamFailed && typeof window !== "undefined" && "AudioWorkletNode" in window;
  const engine: "stream" | "server" | "browser" | "none" = useStream ? "stream" : useServer ? "server" : caps.browser ? "browser" : "none";

  const [lang, setLang] = useState<Lang>("en-IN");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  });

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const streamRef = useRef<{ ws: WebSocket; mic: MicHandle | null } | null>(null);

  useEffect(() => () => {
    recRef.current?.abort();
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    if (stopTimer.current) clearTimeout(stopTimer.current);
    streamRef.current?.mic?.stop();
    streamRef.current?.ws.close();
  }, []);

  /** Words appear as they're spoken; on stop the clean final transcript replaces the live one. */
  function startStream() {
    const base = valueRef.current.trimEnd();
    const show = (t: string) => onChangeRef.current(`${base ? `${base} ` : ""}${t.trim()}`);
    const ws = new WebSocket(`${WS_BASE_URL}/api/transcribe/stream?language_code=${lang === "unknown" ? "auto" : lang}`);
    ws.binaryType = "arraybuffer";
    const session: { ws: WebSocket; mic: MicHandle | null } = { ws, mic: null };
    streamRef.current = session;
    let gotText = false;
    const fail = (msg: string) => {
      session.mic?.stop();
      session.mic = null;
      setListening(false);
      setTranscribing(false);
      setStreamFailed(true);
      if (!gotText) setError(`${msg} Switched to record-then-send; tap the mic again.`);
    };
    ws.onmessage = (e) => {
      let m: { type: string; text?: string; message?: string };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.type === "partial" || m.type === "final") {
        if (m.text) {
          gotText = true;
          show(m.text);
        }
      } else if (m.type === "done") {
        if (m.text?.trim()) show(m.text);
        else if (!gotText) setError("Didn't catch any words. Try again or type below.");
        setTranscribing(false);
      } else if (m.type === "error") {
        fail(m.message ?? "Live transcription is unavailable.");
      }
    };
    ws.onerror = () => fail("Live transcription is unavailable.");
    ws.onclose = () => {
      session.mic?.stop();
      session.mic = null;
      setListening(false);
      setTranscribing(false);
    };
    ws.onopen = async () => {
      try {
        session.mic = await startMic((pcm) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        });
        setListening(true);
        stopTimer.current = setTimeout(stopStream, MAX_RECORD_MS);
      } catch {
        ws.close();
        setError("Microphone permission was denied. You can type instead.");
      }
    };
  }

  function stopStream() {
    const s = streamRef.current;
    if (!s) return;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    s.mic?.stop();
    s.mic = null;
    setListening(false);
    if (s.ws.readyState === WebSocket.OPEN) {
      setTranscribing(true);
      s.ws.send(JSON.stringify({ event: "end" }));
    }
  }

  const append = (text: string) => {
    const base = valueRef.current.trimEnd();
    onChangeRef.current(base ? `${base} ${text.trim()}` : text.trim());
  };

  function startBrowser() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang === "unknown" ? "en-IN" : lang;
    rec.continuous = true;
    rec.interimResults = true;
    const base = valueRef.current.trimEnd();
    rec.onresult = (e) => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript;
      onChangeRef.current(`${base ? `${base} ` : ""}${heard.replace(/\s+/g, " ").trimStart()}`);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(e.error === "not-allowed" ? "Microphone permission was denied. You can type instead." : `Voice input stopped (${e.error}). You can type instead.`);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function startServer() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission was denied. You can type instead.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (stopTimer.current) clearTimeout(stopTimer.current);
      setListening(false);
      if (!chunks.length) return;
      setTranscribing(true);
      try {
        const out = await api.transcribe({ audio: new Blob(chunks, { type: rec.mimeType || "audio/webm" }), language_code: lang });
        if (out.text.trim()) append(out.text);
        else setError("Didn't catch any words. Try again or type below.");
      } catch (err) {
        setError(`${errorMessage(err)} Switched to browser voice input; you can also type.`);
        setServerFailed(true);
      } finally {
        setTranscribing(false);
      }
    };
    mediaRef.current = rec;
    rec.start();
    setListening(true);
    stopTimer.current = setTimeout(() => {
      if (rec.state === "recording") rec.stop();
    }, MAX_RECORD_MS);
  }

  function toggle() {
    setError(null);
    if (listening) {
      recRef.current?.stop();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      stopStream();
      return;
    }
    if (engine === "stream") startStream();
    else if (engine === "server") void startServer();
    else if (engine === "browser") startBrowser();
  }

  const langs: { v: Lang; label: string }[] = [
    { v: "en-IN", label: "English" },
    { v: "hi-IN", label: "हिन्दी" },
    ...(engine === "server" || engine === "stream" ? [{ v: "unknown" as Lang, label: "Auto-detect" }] : []),
  ];

  return (
    <div>
      {engine !== "none" ? (
        <div className="flex flex-col items-center gap-4 rounded-card bg-raised px-5 py-6 text-white">
          <button
            type="button"
            onClick={toggle}
            disabled={disabled || transcribing}
            aria-pressed={listening}
            aria-label={listening ? "Stop recording" : "Start recording"}
            className={cx(
              "flex size-24 items-center justify-center rounded-full transition-colors disabled:opacity-50",
              listening ? "animate-pulse-ring bg-sky text-navy" : "bg-white text-navy hover:bg-white/90",
            )}
          >
            {transcribing ? <LoaderCircle className="size-10 animate-spin" aria-hidden /> : listening ? <Square className="size-9 fill-current" aria-hidden /> : <Mic className="size-10" aria-hidden />}
          </button>
          <p className="text-center text-base font-semibold" aria-live="polite">
            {transcribing ? (engine === "stream" ? "Finishing the transcript…" : "Turning your voice into text…") : listening ? "Listening… tap to stop" : "Tap and speak"}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-white/10 p-1" role="radiogroup" aria-label="Spoken language">
            {langs.map((l) => (
              <button
                key={l.v}
                type="button"
                role="radio"
                aria-checked={lang === l.v}
                disabled={listening}
                onClick={() => setLang(l.v)}
                className={cx(
                  "rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  lang === l.v ? "bg-white text-navy" : "text-white/80 hover:text-white",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/60">
            {engine === "stream" ? "Live transcription: words appear as you speak (Indian languages, code-mixed)" : engine === "server" ? "Server speech-to-text, Indian languages and code-mixed speech" : "Browser speech recognition (Chrome or Edge)"}
          </p>
        </div>
      ) : (
        <p className="rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-white/75">
          Voice input isn&apos;t available in this browser. Type your message below (Chrome or Edge support voice).
        </p>
      )}

      {error ? <p className="mt-3 rounded-xl border border-orange/70 bg-orange/[0.06] px-3 py-2 text-sm text-white" role="alert">{error}</p> : null}

      <label htmlFor={id} className="mt-4 mb-1.5 block text-sm font-semibold text-white">
        {label} <span className="font-normal text-white/60">(edit freely)</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        rows={4}
        className={cx(inputClass, "resize-y leading-relaxed")}
      />
    </div>
  );
}
