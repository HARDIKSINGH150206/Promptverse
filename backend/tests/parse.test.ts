import { describe, expect, it } from "vitest";
import { intakeGuardrail } from "../src/ai/guardrail";
import { mockParseDemand, mockParseOffer, mockReplyDetails } from "../src/ai/parse";

// 2026-10-09 19:30 IST
const REF = Date.parse("2026-10-09T14:00:00Z");

describe("mock parsing + guardrail", () => {
  it("parses a clear veg offer with times in IST", async () => {
    const text = "around 40 plates veg biryani made at 7 safe till 10 back gate";
    const p = mockParseOffer(text, REF);
    expect(p).toMatchObject({ estimated_meals: 40, diet: "veg", missing_fields: [], followup_question: null });
    expect(p.cooked_at).toBe("2026-10-09T13:30:00.000Z"); // 19:00 IST
    expect(p.safe_until).toBe("2026-10-09T16:30:00.000Z"); // 22:00 IST
    expect(p.pickup_notes).toMatch(/back gate/i);
    const g = await intakeGuardrail(text, p.items, p.diet);
    expect(g.needs_confirmation).toBe(false);
  });

  it("never guesses safe_until", () => {
    const p = mockParseOffer("25 plates veg pulao made at 7", REF);
    expect(p.safe_until).toBeNull();
    expect(p.missing_fields).toContain("safe_until");
    expect(p.followup_question).toMatch(/safe/i);
  });

  it("guardrail flags ambiguous diet and safety concerns", async () => {
    const g1 = await intakeGuardrail("30 plates pulao and raita made at 8 safe till 11", [], "veg");
    expect(g1.needs_confirmation).toBe(true);
    const g2 = await intakeGuardrail("20 plates dal rice, it has been sitting out since afternoon", [], "veg");
    expect(g2.safety_concern_probability).toBeGreaterThan(0.3);
    expect(g2.needs_confirmation).toBe(true);
    const g3 = await intakeGuardrail("15 plates chicken curry", [], "veg");
    expect(g3.diet_check?.agrees_with_extraction).toBe(false);
  });

  it("parses demands", () => {
    const d = mockParseDemand("we need food for 30 people, veg only, by 9 pm, within 3 km", REF);
    expect(d).toMatchObject({ people_count: 30, diet: "veg", max_distance_km: 3, missing_fields: [] });
    expect(d.needed_by).toBe("2026-10-09T15:30:00.000Z");
  });

  it("extracts reply numbers and ETAs", () => {
    expect(mockReplyDetails("we can only take 12", REF).meals).toBe(12);
    expect(mockReplyDetails("traffic is bad, reaching 9:45", REF).eta_iso).toBe("2026-10-09T16:15:00.000Z");
    expect(mockReplyDetails("there in 20 minutes", REF).eta_iso).toBe(new Date(REF + 20 * 60000).toISOString());
  });
});
