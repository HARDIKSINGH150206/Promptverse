// Reply understanding: Laya for intent + at-risk, then the LLM for numbers/times. No state changes here.
import { config } from "../config";
import { fmtTime } from "../domain/format";
import { REPLY_INTENTS, type AssignmentRow, type OfferRow, type ReplyIntent, type ReplyUnderstanding } from "../domain/types";
import { DecisionUnavailable, evaluate, type BooleanA, type ChoiceA, type Question } from "./laya";
import { extractReplyDetails } from "./parse";

const QUESTIONS: Record<string, Question> = {
  intent: {
    type: "choice",
    instructions: "What does this food-pickup reply mean?",
    criteria: {
      accept_full: "agrees to collect all the offered meals",
      accept_partial: "agrees, but only for some of the meals",
      decline: "cannot take this food",
      cancel: "had agreed earlier but now cannot come",
      still_coming: "confirms they are coming / on the way",
      running_late: "will come but later than expected",
      question: "asks a question or the meaning is unclear",
    },
  },
  at_risk: {
    type: "boolean",
    instructions: "Is there any sign this collector might not arrive in time?",
    criteria: { true: "traffic, vehicle trouble, no staff, uncertainty, or a late arrival", false: "no sign of a problem" },
  },
};

export type Understood = Omit<ReplyUnderstanding, "action_taken">;

export async function understandReply(text: string, a: AssignmentRow, offer: OfferRow): Promise<Understood> {
  const state = {
    reply_text: text,
    assignment: { status: a.status, meals: a.meals, safe_until_ist: fmtTime(offer.safe_until), distance_km: a.distance_km },
  };
  try {
    const { answers, source } = await evaluate(state, QUESTIONS);
    const intentA = answers.intent as ChoiceA | undefined;
    const riskA = answers.at_risk as BooleanA | undefined;
    if (!intentA || !riskA || !(REPLY_INTENTS as string[]).includes(intentA.choice)) {
      throw new DecisionUnavailable("Unexpected Laya answer shape");
    }
    const intent = intentA.choice as ReplyIntent;
    const probabilities = Object.fromEntries(
      REPLY_INTENTS.map((k) => [k, round3(intentA.probabilities[k] ?? 0)])
    ) as Record<ReplyIntent, number>;
    const intentP = probabilities[intent];

    let meals: number | null = null;
    let eta: string | null = null;
    if (intent === "accept_partial" || intent === "running_late") {
      const d = await extractReplyDetails(text);
      meals = d.meals;
      eta = d.eta_iso;
    }

    let needs = intentP < config.INTENT_MIN_PROBABILITY;
    let question: string | null = null;
    if (needs) {
      question = `Sorry, I didn't quite get that. Can you still collect the ${a.meals} meals? Reply "yes", "no", or e.g. "only 10".`;
    } else if (intent === "accept_partial" && meals === null) {
      needs = true;
      question = `How many of the ${a.meals} meals can you take?`;
    }

    return {
      text, source, intent, intent_probability: intentP, probabilities,
      at_risk_probability: round3(riskA.probability), meals, eta,
      needs_clarification: needs, clarification_question: question,
    };
  } catch (err) {
    if (!(err instanceof DecisionUnavailable)) console.warn("[understandReply]", err);
    return {
      text, source: "fallback_rules", intent: "question", intent_probability: 0,
      probabilities: Object.fromEntries(REPLY_INTENTS.map((k) => [k, 0])) as Record<ReplyIntent, number>,
      at_risk_probability: 0, meals: null, eta: null, needs_clarification: true,
      clarification_question: "Automatic understanding is unavailable right now — please use the buttons.",
    };
  }
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
