// Intake guardrail: one Laya call per parsed offer. Laya can only ADD a confirmation step, never remove one.
import type { IntakeGuardrail, OfferItem } from "../domain/types";
import { pct } from "../domain/format";
import { SAFETY_RE } from "./mock";
import { DecisionUnavailable, evaluate, type BooleanA, type ChoiceA, type Question } from "./laya";

const QUESTIONS: Record<string, Question> = {
  diet: {
    type: "choice",
    instructions: "Based on the food items described, is this food vegetarian or non-vegetarian?",
    criteria: { veg: "no meat, fish or egg in any item", nonveg: "at least one item contains meat, fish or egg" },
  },
  safety_concern: {
    type: "boolean",
    instructions: "Does the message suggest the food might be unsafe to eat?",
    criteria: {
      true: "spoiled, smells off, left out unrefrigerated or uncovered for long, reheated repeatedly, or partly eaten / served on plates",
      false: "no sign of a safety problem",
    },
  },
};

export const DIET_MIN_PROBABILITY = 0.95;
export const SAFETY_WARN_PROBABILITY = 0.3;
export const SAFETY_KEYWORD_FLOOR = 0.75;

export async function intakeGuardrail(
  transcript: string, items: OfferItem[], extractedDiet: "veg" | "nonveg" | null
): Promise<IntakeGuardrail> {
  try {
    const { answers, source, laya } = await evaluate({ transcript, items, extracted_diet: extractedDiet }, QUESTIONS);
    const diet = answers.diet as ChoiceA | undefined;
    let safety = answers.safety_concern as BooleanA | undefined;
    if (!diet || !safety || (diet.choice !== "veg" && diet.choice !== "nonveg")) {
      throw new DecisionUnavailable("Unexpected Laya answer shape");
    }
    // Plain-code floor: model scores for the same sentence vary run to run, so explicit
    // warning words always raise the concern. Like the models, this can only add caution.
    const keywordHit = transcript.match(SAFETY_RE)?.[0];
    if (keywordHit && safety.probability < SAFETY_KEYWORD_FLOOR) safety = { type: "boolean", probability: SAFETY_KEYWORD_FLOOR };
    const g = decide(diet, safety, extractedDiet, source);
    if (keywordHit) g.reasons.push(`Message mentions "${keywordHit}" (keyword check)`);
    // Hybrid cross-check: if Laya reads the diet differently, ask the restaurant (can only add a step).
    const ld = laya?.diet as ChoiceA | undefined;
    if (ld && ld.choice !== diet.choice && (ld.probabilities[ld.choice] ?? 0) > 0.6) {
      g.needs_confirmation = true;
      g.reasons.push(`Second check (Laya) reads this as ${ld.choice === "veg" ? "veg" : "non-veg"} (${pct(ld.probabilities[ld.choice] ?? 0)})`);
    }
    return g;
  } catch (err) {
    if (!(err instanceof DecisionUnavailable)) console.warn("[guardrail]", err);
    return {
      source: "fallback_rules",
      diet_check: null,
      safety_concern_probability: null,
      needs_confirmation: true,
      reasons: ["Automatic check unavailable — please confirm manually"],
    };
  }
}

export function decide(
  diet: ChoiceA, safety: BooleanA, extractedDiet: "veg" | "nonveg" | null, source: "laya" | "llm" | "mock"
): IntakeGuardrail {
  const label = diet.choice as "veg" | "nonveg";
  const p = diet.probabilities[label] ?? 0;
  const agrees = label === extractedDiet;
  const reasons: string[] = [];
  const word = (d: string) => (d === "veg" ? "veg" : "non-veg");

  if (p < DIET_MIN_PROBABILITY) reasons.push(`Diet unclear: ${word(label)} ${pct(p)}`);
  if (extractedDiet === null) reasons.push("Diet wasn't stated — please confirm veg or non-veg");
  else if (!agrees) reasons.push(`Diet check reads this as ${word(label)} (${pct(p)}) but the note was read as ${word(extractedDiet)}`);
  if (safety.probability > SAFETY_WARN_PROBABILITY) {
    reasons.push(`Message suggests the food may be unsafe (safety concern ${pct(safety.probability)})`);
  }

  return {
    source,
    diet_check: { label, probability: round3(p), agrees_with_extraction: agrees },
    safety_concern_probability: round3(safety.probability),
    needs_confirmation: p < DIET_MIN_PROBABILITY || !agrees || safety.probability > SAFETY_WARN_PROBABILITY,
    reasons,
  };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
