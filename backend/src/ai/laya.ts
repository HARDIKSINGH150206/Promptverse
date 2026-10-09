import { config } from "../config";
import { mockEvaluate } from "./mock";
import { cacheGet, cacheSet } from "./cache";
import { markLaya } from "./status";

export type BooleanQ = { type: "boolean"; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };
export type ScoreQ = { type: "score"; instructions: string; criteria: string[] };
export type Question = BooleanQ | ChoiceQ | ScoreQ;

export type BooleanA = { type: "boolean"; probability: number };
export type ChoiceA = { type: "choice"; choice: string; probabilities: Record<string, number> };
export type ScoreA = { type: "score"; score: number; probabilities: Record<string, number> };
export type Answer = BooleanA | ChoiceA | ScoreA;

export class DecisionUnavailable extends Error {}

export async function evaluate(
  state: unknown,
  questions: Record<string, Question>,
  timeoutMs = 6000
): Promise<{ answers: Record<string, Answer>; source: "laya" | "mock" }> {
  if (config.DECISION_PROVIDER === "mock") {
    return { answers: mockEvaluate(state, questions), source: "mock" };
  }
  if (!config.AI_GATEWAY_API_KEY) throw new DecisionUnavailable("AI_GATEWAY_API_KEY missing");

  const cacheKey = JSON.stringify({ m: config.LAYA_MODEL, state, questions });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/evaluate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.AI_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.LAYA_MODEL,
        state,
        questions,
        providerOptions: { gateway: { only: ["boundless"] } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new DecisionUnavailable(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { answers: Record<string, Answer> };
    cacheSet(cacheKey, body.answers);
    markLaya(true);
    return { answers: body.answers, source: "laya" };
  } catch (err) {
    const cached = cacheGet<Record<string, Answer>>(cacheKey);
    if (cached) return { answers: cached, source: "laya" };
    markLaya(false);
    console.warn("[laya] unavailable:", err instanceof Error ? err.message : err);
    throw err instanceof DecisionUnavailable ? err : new DecisionUnavailable(String(err));
  } finally {
    clearTimeout(timer);
  }
}
