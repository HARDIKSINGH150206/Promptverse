import { beforeEach, describe, expect, it } from "vitest";
import { getRecipient } from "../src/db/repo";
import { reliabilityScore } from "../src/domain/reliability";
import { reset } from "./helpers";

describe("reliability", () => {
  beforeEach(reset);

  it("Hope beats Saathi even though Saathi is closer", () => {
    const hope = reliabilityScore(getRecipient("rc_hope")!, 1.2);
    const saathi = reliabilityScore(getRecipient("rc_saathi")!, 1.0);
    expect(hope.total).toBeGreaterThan(saathi.total);
  });

  it("explains history, interval and distance in plain words", () => {
    const hope = reliabilityScore(getRecipient("rc_hope")!, 1.2);
    expect(hope.explanation).toMatch(/18 of 20 pickups completed \(86%, likely \d+–\d+%\), 1\.2 km away, replies in ~2 min/);
    const dawn = reliabilityScore(getRecipient("rc_dawn")!, 2);
    expect(dawn.explanation).toMatch(/^No pickups yet \(50%, could be anywhere from/);
    expect(dawn.is_simulated_history).toBe(true);
  });
});
