// Offline keyword versions of Laya and the generative LLM. Same output shapes; labelled source "mock".
import type { Answer, Question } from "./laya";

export const NONVEG_RE = /\b(chicken|egg|eggs|omelette|mutton|fish|prawns?|meat|keema|beef|pork|lamb|non[- ]?veg)\b/i;
export const VEG_RE = /\b(veg|vegetarian|pure veg|jain)\b/i;
export const SAFETY_RE = /(smell|smells|since afternoon|since morning|left out|sitting out|uncovered|not refrigerated|reheated|half eaten|leftover from plates|served on plates|spoil|stale|sour)/i;
export const AT_RISK_RE = /(traffic|late|stuck|delay|breakdown|broke down|puncture|no staff|short[- ]staffed|not sure|maybe|may be|might|try)/i;

function textOf(state: unknown): string {
  if (typeof state === "string") return state;
  if (state && typeof state === "object") {
    const s = state as Record<string, unknown>;
    const parts = [s.reply_text, s.transcript, s.items ? JSON.stringify(s.items) : undefined].filter(Boolean);
    return parts.join(" ");
  }
  return "";
}

function spread(keys: string[], chosen: string, p: number): Record<string, number> {
  const rest = (1 - p) / Math.max(1, keys.length - 1);
  return Object.fromEntries(keys.map((k) => [k, k === chosen ? p : Math.round(rest * 1000) / 1000]));
}

export function mockIntent(text: string): { choice: string; p: number } {
  const t = text.toLowerCase();
  if (/\b(only|just|can take|we can take|take)\s+(\d+)/.test(t) && !/\b(all|everything)\b/.test(t)) return { choice: "accept_partial", p: 0.9 };
  if (/(can'?t come|cannot come|won'?t (make|come)|not coming|cancel|have to drop|can'?t make it)/.test(t)) return { choice: "cancel", p: 0.88 };
  if (/(no thanks|can'?t take|cannot take|not today|decline|don'?t need|no need|we'?re full|\bno\b)/.test(t)) return { choice: "decline", p: 0.88 };
  if (/(late|traffic|stuck|delay|reaching (by|at)?|in \d+ ?min)/.test(t)) return { choice: "running_late", p: 0.9 };
  if (/(on the way|on our way|coming|omw|leaving now|left now|almost there|still on)/.test(t)) return { choice: "still_coming", p: 0.88 };
  if (/\b(yes|yeah|yep|ok|okay|sure|accept|we'?ll take|will collect|haan|ha|done|confirmed?)\b/.test(t)) return { choice: "accept_full", p: 0.9 };
  if (t.includes("?")) return { choice: "question", p: 0.85 };
  return { choice: "question", p: 0.55 };
}

export function mockEvaluate(state: unknown, questions: Record<string, Question>): Record<string, Answer> {
  const text = textOf(state);
  const out: Record<string, Answer> = {};
  for (const [name, q] of Object.entries(questions)) {
    if (q.type === "boolean") {
      let p = 0.1;
      if (name === "safety_concern") p = SAFETY_RE.test(text) ? 0.8 : 0.06;
      else if (name === "at_risk") p = AT_RISK_RE.test(text) ? 0.78 : 0.08;
      out[name] = { type: "boolean", probability: p };
    } else if (q.type === "choice") {
      const keys = Object.keys(q.criteria);
      if (name === "diet") {
        const [choice, p] = NONVEG_RE.test(text) ? ["nonveg", 0.97] : VEG_RE.test(text) ? ["veg", 0.97] : ["veg", 0.71];
        out[name] = { type: "choice", choice, probabilities: spread(keys, choice, p) };
      } else if (name === "intent") {
        const { choice, p } = mockIntent(text);
        out[name] = { type: "choice", choice, probabilities: spread(keys, choice, p) };
      } else {
        out[name] = { type: "choice", choice: keys[0], probabilities: spread(keys, keys[0], 0.5) };
      }
    } else {
      const keys = q.criteria;
      out[name] = { type: "score", score: 0, probabilities: Object.fromEntries(keys.map((k, i) => [k, i === 0 ? 1 : 0])) };
    }
  }
  return out;
}
