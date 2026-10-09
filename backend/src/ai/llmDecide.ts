// The generative LLM answering Laya-style typed questions with probabilities.
// Used as the reliable classifier in DECISION_PROVIDER=hybrid (and alone with DECISION_PROVIDER=llm).
// Its probabilities are self-reported, not calibrated, so code keeps every threshold cautious.
import { z } from "zod";
import { cacheGet, cacheSet } from "./cache";
import type { Answer, Question } from "./laya";
import { completeJson, extractJson, llmModel } from "./llm";
import { config } from "../config";

const SYSTEM = `You are a careful classifier for a food-rescue service in India. Messages may mix English, Hindi, Kannada or other languages.
You receive a STATE (JSON) and QUESTIONS. Answer every question with probabilities, judging only from the state.

Return ONLY JSON: { "answers": { "<question_name>": <answer> } } where
- for a "boolean" question: { "probability": number }   (probability that the answer is TRUE, 0..1)
- for a "choice" question:  { "probabilities": { "<option>": number, ... } }   (every option, summing to 1)
Be honest about uncertainty: if the message is ambiguous, spread probability instead of guessing.`;

const AnswerSchema = z.object({
  answers: z.record(
    z.string(),
    z.object({ probability: z.number().optional(), probabilities: z.record(z.string(), z.number()).optional() })
  ),
});

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export async function evaluateLlm(state: unknown, questions: Record<string, Question>): Promise<Record<string, Answer>> {
  const user = `STATE:\n${JSON.stringify(state)}\n\nQUESTIONS:\n${JSON.stringify(questions, null, 1)}`;
  const key = JSON.stringify({ kind: "decide", p: config.LLM_PROVIDER, m: llmModel(), user });
  let raw: z.infer<typeof AnswerSchema> | null = null;
  try {
    const parsed = AnswerSchema.safeParse(extractJson(await completeJson(SYSTEM, user)));
    if (parsed.success) raw = parsed.data;
  } catch {
    /* fall through to cache */
  }
  if (!raw) {
    const cached = cacheGet<Record<string, Answer>>(key);
    if (cached) return cached;
    throw new Error("LLM decision unavailable");
  }

  const out: Record<string, Answer> = {};
  for (const [name, q] of Object.entries(questions)) {
    const a = raw.answers[name];
    if (!a) throw new Error(`LLM decision missing answer for ${name}`);
    if (q.type === "boolean") {
      out[name] = { type: "boolean", probability: clamp01(a.probability ?? 0.5) };
    } else if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      const ps = keys.map((k) => clamp01(a.probabilities?.[k] ?? 0));
      const sum = ps.reduce((s, x) => s + x, 0) || 1;
      const probabilities = Object.fromEntries(keys.map((k, i) => [k, Math.round((ps[i] / sum) * 1000) / 1000]));
      const choice = keys.reduce((best, k) => (probabilities[k] > probabilities[best] ? k : best), keys[0]);
      out[name] = { type: "choice", choice, probabilities };
    } else {
      out[name] = { type: "score", score: 0, probabilities: {} };
    }
  }
  cacheSet(key, out);
  return out;
}
