import { config } from "../config";
import { mockEvaluate } from "./mock";
import { cacheGet, cacheSet } from "./cache";
import { markLaya } from "./status";
import { evaluateLlm } from "./llmDecide";

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
): Promise<Evaluation> {
  if (config.DECISION_PROVIDER === "mock") {
    return { answers: mockEvaluate(state, questions), source: "mock", choiceSource: "mock" };
  }
  if (config.DECISION_PROVIDER === "laya_local") return withChoice(await evaluateLocal(state, questions));
  if (config.DECISION_PROVIDER === "llm") {
    try {
      return { answers: await evaluateLlm(state, questions), source: "llm", choiceSource: "llm" };
    } catch (err) {
      throw new DecisionUnavailable(String(err));
    }
  }
  if (config.DECISION_PROVIDER === "hybrid") return evaluateHybrid(state, questions);
  return withChoice(await evaluateGateway(state, questions, timeoutMs));
}

export interface Evaluation {
  answers: Record<string, Answer>;
  /** who produced the yes/no risk signals */
  source: "laya" | "llm" | "mock";
  /** who picked the choice answers (diet, intent) */
  choiceSource: "laya" | "llm" | "mock";
  /** Laya's own answers when another model made the call (hybrid), for cross-checks */
  laya?: Record<string, Answer>;
}

const withChoice = (r: { answers: Record<string, Answer>; source: "laya" }): Evaluation => ({ ...r, choiceSource: "laya" });

async function evaluateGateway(
  state: unknown,
  questions: Record<string, Question>,
  timeoutMs: number
): Promise<{ answers: Record<string, Answer>; source: "laya" }> {
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
    return { answers: body.answers, source: "laya" as const };
  } catch (err) {
    const cached = cacheGet<Record<string, Answer>>(cacheKey);
    if (cached) return { answers: cached, source: "laya" as const };
    markLaya(false);
    console.warn("[laya] unavailable:", err instanceof Error ? err.message : err);
    throw err instanceof DecisionUnavailable ? err : new DecisionUnavailable(String(err));
  } finally {
    clearTimeout(timer);
  }
}

// ---- Self-hosted Laya (open weights, Apache 2.0) via `laya-serve` -> POST /v1/systemone ----
// Same model family as the gateway's laya-free, run locally on CPU for free. The open package
// calls yes/no questions "noul" and answers them as { noul: P(true) }; we translate both ways.

type LocalAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number> }
  | { type: "score"; score: number; probabilities: Record<string, number> };

async function evaluateLocal(
  state: unknown,
  questions: Record<string, Question>,
  timeoutMs = config.LAYA_LOCAL_TIMEOUT_MS
): Promise<{ answers: Record<string, Answer>; source: "laya" }> {
  const localQs = Object.fromEntries(
    Object.entries(questions).map(([k, q]) => [k, q.type === "boolean" ? { ...q, type: "noul" } : q])
  );
  const cacheKey = JSON.stringify({ m: "laya-local", state, questions });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.LAYA_LOCAL_URL.replace(/\/$/, "")}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, questions: localQs }),
      signal: controller.signal,
    });
    if (!res.ok) throw new DecisionUnavailable(`local Laya HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { answers: Record<string, LocalAnswer> };
    const answers: Record<string, Answer> = {};
    for (const [k, a] of Object.entries(body.answers ?? {})) {
      if (a.type === "noul") answers[k] = { type: "boolean", probability: a.noul };
      else if (a.type === "choice") answers[k] = { type: "choice", choice: a.choice, probabilities: a.probabilities };
      else answers[k] = { type: "score", score: a.score, probabilities: a.probabilities };
    }
    cacheSet(cacheKey, answers);
    markLaya(true);
    return { answers, source: "laya" };
  } catch (err) {
    const cached = cacheGet<Record<string, Answer>>(cacheKey);
    if (cached) return { answers: cached, source: "laya" };
    markLaya(false);
    console.warn("[laya-local] unavailable:", err instanceof Error ? err.message : err);
    throw err instanceof DecisionUnavailable ? err : new DecisionUnavailable(String(err));
  } finally {
    clearTimeout(timer);
  }
}

// ---- Hybrid: local Laya + LLM in parallel ----
// Yes/no risk signals take the HIGHER of the two probabilities (either model can raise a flag,
// neither can clear one). Choices (diet, intent) come from the LLM, which is far more accurate
// than the base Laya checkpoints on this domain; Laya's answers are returned for cross-checks.
async function evaluateHybrid(state: unknown, questions: Record<string, Question>): Promise<Evaluation> {
  const [laya, llm] = await Promise.allSettled([evaluateLocal(state, questions), evaluateLlm(state, questions)]);
  const L = laya.status === "fulfilled" ? laya.value.answers : null;
  const M = llm.status === "fulfilled" ? llm.value : null;
  if (!L && !M) throw new DecisionUnavailable("Both local Laya and the LLM are unavailable");

  const answers: Record<string, Answer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = L?.[name];
    const b = M?.[name];
    if (q.type === "boolean") {
      const ps = [a, b].filter((x): x is BooleanA => x?.type === "boolean").map((x) => x.probability);
      answers[name] = { type: "boolean", probability: Math.max(...ps) };
    } else {
      answers[name] = (b ?? a)!;
    }
  }
  return {
    answers,
    source: L ? "laya" : "llm",
    choiceSource: M ? "llm" : "laya",
    laya: L ?? undefined,
  };
}
