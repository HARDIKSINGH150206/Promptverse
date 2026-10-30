import { describe, expect, it } from "vitest";
import { END_CUE, residual, saysYes } from "../src/agent/session";

describe("voice agent: spoken yes gate", () => {
  it("accepts plain yes in several languages", () => {
    for (const t of ["Yes", "yes, that's correct", "haan ji", "हाँ, सही है", "bilkul theek hai", "ಹೌದು", "ஆமா", "yes no problem"]) {
      expect(saysYes(t), t).toBe(true);
    }
  });

  it("rejects negation, hedges and non-answers", () => {
    for (const t of ["no", "yes but it wasn't covered", "not really", "नहीं", "हाँ लेकिन प्लेट में था", "yes or no?", "what?", "it was kept outside"]) {
      expect(saysYes(t), t).toBe(false);
    }
  });

  it("does not see a negation inside a Hindi word", () => {
    // "खाना" contains "ना" but is not "no"
    expect(saysYes("हाँ, खाना ढका हुआ था")).toBe(true);
  });
});

describe("voice agent: echo guard", () => {
  const q = "Was the food kept covered, kept hot or refrigerated, and never served on anyone's plate? Please say yes or no.";

  it("finds nothing new in our own question coming back", () => {
    expect(residual(q, "please say yes or no").length).toBe(0);
    expect(residual(q, "kept covered kept hot").length).toBe(0);
  });

  it("keeps real caller words", () => {
    expect(residual(q, "wait, it was 40 plates actually").length).toBeGreaterThan(1);
  });

  it("treats Devanagari words whole (vowel signs don't split them)", () => {
    expect(residual("क्या खाना ढका हुआ था", "खाना ढका था")).toEqual([]);
  });
});

describe("voice agent: end-of-call cue", () => {
  it("needs an explicit goodbye", () => {
    expect(END_CUE.test("ok bye")).toBe(true);
    expect(END_CUE.test("please cancel the call")).toBe(true);
    expect(END_CUE.test("that's all, 40 plates")).toBe(false);
    expect(END_CUE.test("nothing else")).toBe(false);
  });
});
