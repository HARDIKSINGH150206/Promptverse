import { describe, expect, it } from "vitest";
import { fixFuture, fixPast } from "../src/ai/parse";

// 2026-10-09 14:40 IST
const NOW = Date.parse("2026-10-09T09:10:00Z");
const iso = (s: string) => new Date(s).toISOString();

describe("LLM time sanity", () => {
  it("'safe till 11' said at 2:40 pm is 11 pm tonight, not 11 am tomorrow", () => {
    expect(fixFuture("2026-10-10T05:30:00Z", NOW)).toBe(iso("2026-10-09T17:30:00Z"));
  });

  it("a time that landed in the past moves to its next occurrence", () => {
    expect(fixFuture("2026-10-09T05:30:00Z", NOW)).toBe(iso("2026-10-09T17:30:00Z"));
  });

  it("keeps a later time when the speaker said tomorrow", () => {
    expect(fixFuture("2026-10-10T05:30:00Z", NOW, true)).toBe(iso("2026-10-10T05:30:00Z"));
  });

  it("leaves a correct near-future time alone", () => {
    expect(fixFuture("2026-10-09T10:00:00Z", NOW)).toBe(iso("2026-10-09T10:00:00Z"));
  });

  it("a cooked time in the future moves back", () => {
    expect(fixPast("2026-10-09T13:30:00Z", NOW)).toBe(iso("2026-10-09T01:30:00Z"));
  });

  it("'made at 2' said at 2:40 pm is 2 pm today, not 2 am", () => {
    // model returned 02:00 IST (20:30Z the day before)
    expect(fixPast("2026-10-08T20:30:00Z", NOW)).toBe(iso("2026-10-09T08:30:00Z"));
  });
});
