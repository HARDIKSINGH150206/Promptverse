// Speech-to-text for voice notes. Sarvam (Indian languages, code-mixed speech) first, Groq Whisper as fallback.
import OpenAI, { toFile } from "openai";
import { config } from "../config";

export interface Transcription {
  text: string;
  language_code: string | null;   // e.g. "hi-IN", "kn-IN", "en-IN"
  language_probability: number | null;
  source: "sarvam" | "groq";
}

export class SttUnavailable extends Error {}

// Sarvam language codes; "unknown" = auto-detect (multilingual).
export const SARVAM_LANGUAGES = [
  "unknown", "en-IN", "hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN", "gu-IN",
  "as-IN", "ur-IN", "ne-IN", "kok-IN", "ks-IN", "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN",
];

export function sttStatus(): "ready" | "missing_key" | "disabled" {
  if (config.STT_PROVIDER === "none") return "disabled";
  if (config.STT_PROVIDER === "sarvam" && (config.SARVAM_API_KEY || config.GROQ_API_KEY)) return "ready";
  if (config.STT_PROVIDER === "groq" && config.GROQ_API_KEY) return "ready";
  return "missing_key";
}

async function sarvam(audio: Buffer, mime: string, filename: string, languageCode: string, mode?: string): Promise<Transcription> {
  if (!config.SARVAM_API_KEY) throw new SttUnavailable("SARVAM_API_KEY missing");
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(audio)], { type: mime }), filename);
  fd.append("model", config.SARVAM_MODEL);
  fd.append("language_code", languageCode);
  // mode (transcribe | translate | verbatim | translit | codemix) is only accepted by saaras:v3
  if (mode && config.SARVAM_MODEL === "saaras:v3") fd.append("mode", mode);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://api.sarvam.ai/speech-to-text", {
      method: "POST",
      headers: { "api-subscription-key": config.SARVAM_API_KEY },
      body: fd,
      signal: controller.signal,
    });
    if (!res.ok) throw new SttUnavailable(`Sarvam HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { transcript: string; language_code?: string | null; language_probability?: number };
    return {
      text: (body.transcript ?? "").trim(),
      language_code: body.language_code ?? null,
      language_probability: body.language_probability ?? null,
      source: "sarvam",
    };
  } finally {
    clearTimeout(timer);
  }
}

let groq: OpenAI | null = null;
async function groqWhisper(audio: Buffer, mime: string, filename: string, languageCode: string): Promise<Transcription> {
  if (!config.GROQ_API_KEY) throw new SttUnavailable("GROQ_API_KEY missing");
  groq ??= new OpenAI({ apiKey: config.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
  const lang = languageCode !== "unknown" ? languageCode.split("-")[0] : undefined; // whisper wants ISO-639-1
  const res = await groq.audio.transcriptions.create({
    file: await toFile(audio, filename, { type: mime }),
    model: config.GROQ_STT_MODEL,
    ...(lang ? { language: lang } : {}),
    temperature: 0,
  });
  return { text: res.text.trim(), language_code: languageCode !== "unknown" ? languageCode : null, language_probability: null, source: "groq" };
}

export async function transcribe(
  audio: Buffer, mime: string, filename: string, opts: { language_code?: string; mode?: string } = {}
): Promise<Transcription> {
  if (config.STT_PROVIDER === "none") throw new SttUnavailable("Speech-to-text disabled (STT_PROVIDER=none)");
  const lang = opts.language_code && SARVAM_LANGUAGES.includes(opts.language_code) ? opts.language_code : "unknown";
  const order = config.STT_PROVIDER === "groq" ? [groqWhisper, sarvam] : [sarvam, groqWhisper];
  let lastErr: unknown;
  for (const fn of order) {
    try {
      return await fn(audio, mime, filename, lang, opts.mode);
    } catch (err) {
      lastErr = err;
      console.warn(`[stt] ${fn.name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  throw new SttUnavailable(lastErr instanceof Error ? lastErr.message : String(lastErr));
}
