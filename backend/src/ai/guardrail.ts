// Intake guardrail: one Laya call per parsed offer. Laya can only ADD a confirmation step, never remove one.
import type { IntakeGuardrail, OfferItem } from "../domain/types";
import { pct } from "../domain/format";
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

export async function intakeGuardrail(
  transcript: string, items: OfferItem[], extractedDiet: "veg" | "nonveg" | null
): Promise<IntakeGuardrail> {
  try {
    const { answers, source } = await evaluate({ transcript, items, extracted_diet: extractedDiet }, QUESTIONS);
    const diet = answers.diet as ChoiceA | undefined;
    const safety = answers.safety_concern as BooleanA | undefined;
    if (!diet || !safety || (diet.choice !== "veg" && diet.choice !== "nonveg")) {
      throw new DecisionUnavailable("Unexpected Laya answer shape");
    }
    return decide(diet, safety, extractedDiet, source);
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
  diet: ChoiceA, safety: BooleanA, extractedDiet: "veg" | "nonveg" | null, source: "laya" | "mock"
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
