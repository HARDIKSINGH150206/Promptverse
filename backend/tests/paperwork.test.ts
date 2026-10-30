import { describe, expect, it } from "vitest";
import type { Assignment, Offer } from "../src/domain/types";
import {
  buildDeclaration, buildHandover, buildRegister, checkFssai, renderDeclaration, renderHandover, renderRegisterCsv, type RegisterRow,
} from "../src/paperwork";

const NOW = Date.parse("2026-10-30T14:00:00Z");

const offer: Offer = {
  id: "o_ab12cd", restaurant_id: "r_kora", restaurant_name: "Koramangala Kitchen",
  items: [{ name: "Veg biryani", quantity: 40, unit: "plates" }], meal_count: 40, meals_assigned: 40, meals_collected: 40,
  diet: "veg", cooked_at: "2026-10-30T08:30:00Z", safe_until: "2026-10-30T16:30:00Z",
  photo_url: null, raw_transcript: "40 plates veg biryani", pickup_notes: "back gate",
  status: "collected", fallback_route: null, created_at: "2026-10-30T09:00:00Z",
};

const assignment = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a_99xy77", offer_id: offer.id, recipient_id: "rc_hope", recipient_name: "Hope Shelter", demand_id: "d1",
  meals: 40, status: "collected", reliability_at_assignment: 0.9,
  selection: { method: "mean", sampled_p_complete: null, explored: false, reason: "" },
  distance_km: 2, offered_at: "2026-10-30T09:01:00Z", respond_by: "2026-10-30T09:02:00Z",
  accepted_at: "2026-10-30T09:01:30Z", reconfirm_by: null, collected_at: "2026-10-30T11:00:00Z",
  eta_promised: null, p_fail: null, is_standby: false, standby_for_assignment_id: null, last_reply: null,
  ...over,
});

const declaration = (over: Partial<Parameters<typeof buildDeclaration>[0]> = {}) =>
  buildDeclaration({
    offer, donor: { id: "r_kora", name: "Koramangala Kitchen", area: "Koramangala" },
    compliance: { fssai_number: "11226999000123" }, method: "voice_call",
    call: { call_id: "call_1", language: "hi-IN", transcript: "40 plates", diet_confirmed_at: "2026-10-30T08:58:00Z", safety_confirmed_at: "2026-10-30T08:59:00Z" },
    now: NOW, ...over,
  });

describe("paperwork: FSSAI number format", () => {
  it("accepts a 14-digit licence or registration number", () => {
    expect(checkFssai("1 12 26 999 000123")).toMatchObject({ valid: true, kind: "licence", normalized: "11226999000123", year: 2026 });
    expect(checkFssai("21219999000001").kind).toBe("registration");
  });

  it("explains why a number is rejected", () => {
    expect(checkFssai("").reason).toMatch(/No FSSAI number/);
    expect(checkFssai("1122699900012").reason).toMatch(/14 digits/);
    expect(checkFssai("31226999000123").reason).toMatch(/start with 1/);
    expect(checkFssai("11299999000123").reason).toMatch(/Year/);
    expect(checkFssai("1122699900012A").valid).toBe(false);
  });
});

describe("paperwork: donation declaration", () => {
  it("records each confirmation with how and when it was given", () => {
    const d = declaration();
    expect(d.doc_no).toBe("DD-20261030-AB12CD");
    expect(d.confirmations).toHaveLength(4);
    expect(d.confirmations[0]).toMatchObject({ method: "voice_call", at: "2026-10-30T08:58:00Z", evidence: "voice call call_1" });
    expect(d.confirmations[3]).toMatchObject({ statement: "The food was never served on anyone's plate", at: "2026-10-30T08:59:00Z" });
    expect(d.food.hold_hours).toBe(8);
  });

  it("never shows a badly formatted number as verified", () => {
    expect(declaration({ compliance: { fssai_number: "123", verified: true } }).donor.fssai.verified).toBe(false);
    expect(declaration({ compliance: { fssai_number: "11226999000123", verified: true } }).donor.fssai.verified).toBe(true);
  });

  it("has a fingerprint that survives a reprint but not an edit", () => {
    const a = declaration();
    const b = declaration({ now: NOW + 3600_000 }); // printed an hour later
    const c = declaration({ offer: { ...offer, meal_count: 45 } });
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(c.fingerprint).not.toBe(a.fingerprint);
  });

  it("escapes what the donor said in the HTML", () => {
    const html = renderDeclaration(declaration({ offer: { ...offer, pickup_notes: "<script>alert(1)</script>" } }));
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("watermarks sample documents", () => {
    expect(renderDeclaration(declaration({ sample: true }))).toContain("SAMPLE");
    expect(renderDeclaration(declaration())).not.toContain("NOT A LEGAL DOCUMENT");
  });
});

describe("paperwork: handover note", () => {
  const recipient = { id: "rc_hope", name: "Hope Shelter", area: "BTM", type: "shelter" as const };

  it("is only made for a pickup that happened", () => {
    expect(() => buildHandover({ declaration: declaration(), assignment: assignment({ status: "accepted", collected_at: null }), recipient })).toThrow(/isn't collected/);
  });

  it("checks the pickup against the safe window", () => {
    const ok = buildHandover({ declaration: declaration(), assignment: assignment(), recipient, now: NOW });
    expect(ok).toMatchObject({ within_safe_window: true, minutes_to_spare: 330, declaration_no: "DD-20261030-AB12CD" });
    const late = buildHandover({ declaration: declaration(), assignment: assignment({ collected_at: "2026-10-30T17:00:00Z" }), recipient });
    expect(late.within_safe_window).toBe(false);
    expect(renderHandover(late)).toContain("After safe window");
  });
});

describe("paperwork: monthly register", () => {
  const row: RegisterRow = {
    date: "2026-10-30", doc_no: "DD-20261030-AB12CD", offer_id: "o_ab12cd", donor: "Koramangala Kitchen", donor_fssai: null,
    food: "Veg biryani, raita", diet: "veg", meals_offered: 40, meals_collected: 40,
    cooked_at: offer.cooked_at, safe_until: offer.safe_until, collected_by: "Hope Shelter",
    picked_up_at: "2026-10-30T11:00:00Z", outcome: "Collected", safety_confirmed: true,
  };

  it("totals the month", () => {
    const r = buildRegister("2026-10", [row, { ...row, doc_no: "x", meals_collected: 0, picked_up_at: null, outcome: "Expired" }]);
    expect(r.totals).toEqual({ donations: 2, meals_offered: 80, meals_collected: 40, collected_in_window: 1 });
    expect(() => buildRegister("2026-13", [])).toThrow(/YYYY-MM/);
  });

  it("writes CSV that quotes commas and defuses spreadsheet formulas", () => {
    const csv = renderRegisterCsv(buildRegister("2026-10", [{ ...row, donor: "=HYPERLINK(\"x\")" }]));
    expect(csv.startsWith("﻿date,doc_no")).toBe(true);
    expect(csv).toContain('"Veg biryani, raita"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
