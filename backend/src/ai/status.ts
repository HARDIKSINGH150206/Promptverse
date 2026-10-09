import { config } from "../config";
import type { LayaStatus, LlmStatus } from "../domain/types";

let layaLastOk: boolean | null = null;

export function markLaya(ok: boolean): void {
  layaLastOk = ok;
}

export function llmStatus(): LlmStatus {
  if (config.LLM_PROVIDER === "mock") return "mock";
  return config.LLM_API_KEY ? "ready" : "missing_key";
}

export function layaStatus(): LayaStatus {
  if (config.DECISION_PROVIDER === "mock") return "mock";
  if (!config.AI_GATEWAY_API_KEY) return "missing_key";
  return layaLastOk === false ? "unavailable" : "ready";
}
