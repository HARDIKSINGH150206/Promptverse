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

  LLM_PROVIDER: str("LLM_PROVIDER", "mock") as "gemini" | "openai" | "anthropic" | "mock",
  LLM_API_KEY: str("LLM_API_KEY"),
  LLM_MODEL: str("LLM_MODEL"),

  DECISION_PROVIDER: str("DECISION_PROVIDER", "mock") as "laya" | "mock",
  AI_GATEWAY_API_KEY: str("AI_GATEWAY_API_KEY"),
  LAYA_MODEL: str("LAYA_MODEL", "convaiinnovations/laya-free"),

  TELEGRAM_BOT_TOKEN: str("TELEGRAM_BOT_TOKEN"),
  TELEGRAM_BOT_USERNAME: str("TELEGRAM_BOT_USERNAME"),

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

  DB_PATH: str("DB_PATH", "data/annarelay.db"),
};

export type Config = typeof config;
