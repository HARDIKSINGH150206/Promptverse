import "dotenv/config";

function str(name: string, def = ""): string {
  const raw = process.env[name];
  if (raw === undefined) return def;
  // tolerate inline comments like `mock   # gemini | openai`
  const v = raw.replace(/\s+#.*$/, "").trim();
  return v === "" ? def : v;
}

function num(name: string, def: number): number {
  const v = Number(str(name, String(def)));
  return Number.isFinite(v) ? v : def;
}

export const config = {
  PORT: num("PORT", 4000),
  FRONTEND_ORIGIN: str("FRONTEND_ORIGIN", "http://localhost:3000"),
  TZ_NAME: str("TZ_NAME", "Asia/Kolkata"),

  LLM_PROVIDER: str("LLM_PROVIDER", "mock") as "gemini" | "openai" | "anthropic" | "groq" | "mock",
  LLM_API_KEY: str("LLM_API_KEY"),
  LLM_MODEL: str("LLM_MODEL"),

  DECISION_PROVIDER: str("DECISION_PROVIDER", "mock") as "laya" | "laya_local" | "hybrid" | "llm" | "mock",
  AI_GATEWAY_API_KEY: str("AI_GATEWAY_API_KEY"),
  LAYA_MODEL: str("LAYA_MODEL", "convaiinnovations/laya-free"),
  LAYA_LOCAL_URL: str("LAYA_LOCAL_URL", "http://127.0.0.1:8000"),
  LAYA_LOCAL_TIMEOUT_MS: num("LAYA_LOCAL_TIMEOUT_MS", 15000),

  TELEGRAM_BOT_TOKEN: str("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_BOT_USERNAME: str("TELEGRAM_BOT_USERNAME"),
  TELEGRAM_VOICE: str("TELEGRAM_VOICE", "on") as "on" | "off",

  ACCEPT_TIMEOUT_SECS: num("ACCEPT_TIMEOUT_SECS", 45),
  RECONFIRM_AFTER_SECS: num("RECONFIRM_AFTER_SECS", 20),
  RECONFIRM_TIMEOUT_SECS: num("RECONFIRM_TIMEOUT_SECS", 30),
  STANDBY_TIMEOUT_SECS: num("STANDBY_TIMEOUT_SECS", 45),
  PICKUP_BUFFER_MINS: num("PICKUP_BUFFER_MINS", 20),
  AVG_SPEED_KMPH: num("AVG_SPEED_KMPH", 20),
  RISK_THRESHOLD: num("RISK_THRESHOLD", 0.25),
  INTENT_MIN_PROBABILITY: num("INTENT_MIN_PROBABILITY", 0.7),
  THOMPSON_SAMPLING: str("THOMPSON_SAMPLING", "on") as "on" | "off",
  EXPLORE_MIN_SLACK_MINS: num("EXPLORE_MIN_SLACK_MINS", 90),
  DEMO_SEED: num("DEMO_SEED", 42),
  FALLBACK_ORDER: str("FALLBACK_ORDER", "animal_feed,compost")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ("animal_feed" | "compost")[],

  STT_PROVIDER: str("STT_PROVIDER", "sarvam") as "sarvam" | "groq" | "none",
  SARVAM_API_KEY: str("SARVAM_API_KEY"),
  SARVAM_MODEL: str("SARVAM_MODEL", "saaras:v4"),
  SARVAM_TTS_MODEL: str("SARVAM_TTS_MODEL", "bulbul:v3"),
  SARVAM_TTS_SPEAKER: str("SARVAM_TTS_SPEAKER", "priya"),
  AGENT_MODEL: str("AGENT_MODEL", ""),
  // none = no hidden reasoning (fastest; Groq qwen3). gpt-oss models only accept low | medium | high.
  AGENT_REASONING: str("AGENT_REASONING", "none") as "none" | "low" | "medium" | "high" | "default",
  SARVAM_TTS_SAMPLE_RATE: num("SARVAM_TTS_SAMPLE_RATE", 16000),
  SARVAM_SILENCE_MS: num("SARVAM_SILENCE_MS", 400),
  SARVAM_STREAM_MODEL: str("SARVAM_STREAM_MODEL", "saaras:v3-realtime"),
  GROQ_API_KEY: str("GROQ_API_KEY"),
  GROQ_STT_MODEL: str("GROQ_STT_MODEL", "whisper-large-v3-turbo"),

  DB_PATH: str("DB_PATH", "data/annarelay.db"),
};

export type Config = typeof config;
