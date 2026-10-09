// Text-to-speech for the voice agent: Sarvam bulbul (Indian voices, code-mixed text).
// Returns base64 WAV per sentence so playback can start before the whole reply is synthesized.
import { config } from "../config";

export const TTS_LANGUAGES = ["bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"];

export function ttsLanguage(lang: string | null | undefined): string {
  return lang && TTS_LANGUAGES.includes(lang) ? lang : "en-IN";
}

/** Split into speakable sentences (keeps each request short, so the first audio arrives fast). */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const s of (text.match(/[^.!?।]+[.!?।]+["')\]]*|[^.!?।]+$/g) ?? [text]).map((x) => x.trim()).filter(Boolean)) {
    // a short lead-in ("Let me read that back:") is its own clip, so speech starts almost immediately
    const lead = out.length === 0 ? s.match(/^(.{6,40}?:)\s+(.+)$/) : null;
    if (lead) {
      out.push(lead[1]);
      out.push(...sentences(lead[2]));
      continue;
    }
    // long sentences (read-backs) are split at commas so the first audio arrives sooner
    if (s.length <= 110) {
      out.push(s);
      continue;
    }
    let cur = "";
    for (const part of s.split(/(?<=,)\s+/)) {
      if (cur && (cur + " " + part).length > 90) {
        out.push(cur);
        cur = part;
      } else cur = cur ? `${cur} ${part}` : part;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export async function synthesize(text: string, lang: string, codec: "wav" | "mp3" = "wav"): Promise<string | null> {
  if (!config.SARVAM_API_KEY || !text.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": config.SARVAM_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language_code: ttsLanguage(lang),
        model: config.SARVAM_TTS_MODEL,
        speaker: config.SARVAM_TTS_SPEAKER,
        speech_sample_rate: config.SARVAM_TTS_SAMPLE_RATE,
        output_audio_codec: codec,
        pace: 1.1,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[tts] Sarvam HTTP", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { audios?: string[] };
    return body.audios?.[0] ?? null;
  } catch (err) {
    console.warn("[tts] failed:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
