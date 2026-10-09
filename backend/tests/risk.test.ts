import { beforeEach, describe, expect, it } from "vitest";
import { getAssignmentRow, updateAssignment } from "../src/db/repo";
import { runRisk } from "../src/domain/risk";
import { accept } from "../src/domain/transitions";
import { assignmentsOf, byName, makeOffer, reset } from "./helpers";

const standbyFor = (offerId: string, primaryId: string) =>
  assignmentsOf(offerId).find((a) => a.standby_for_assignment_id === primaryId && a.status === "standby_requested");

describe("risk", () => {
  beforeEach(reset);

  it("Little Stars with no reply -> p_fail ~0.37 -> standby requested", () => {
    const id = makeOffer(15, "nonveg");
    const ls = byName(id, "Little Stars Home")!;
    accept(ls.id);
    expect(getAssignmentRow(ls.id)!.p_fail).toBeCloseTo(0.375, 2);
    expect(standbyFor(id, ls.id)).toBeDefined();
  });

  it("Hope with an at-risk reply (0.78) -> p_fail ~0.81 -> standby requested", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    accept(hope.id);
    expect(standbyFor(id, hope.id)).toBeUndefined();
    updateAssignment(hope.id, { last_reply_json: JSON.stringify({ at_risk_probability: 0.78 }) });
    runRisk(id);
    expect(getAssignmentRow(hope.id)!.p_fail).toBeCloseTo(0.81, 2);
    expect(standbyFor(id, hope.id)?.name).toBe("Sunrise Elders Home");
  });

  it("Sunrise with no reply -> p_fail ~0.07 -> no standby", () => {
    const id = makeOffer(40, "veg");
    const sun = byName(id, "Sunrise Elders Home")!;
    accept(sun.id);
    expect(getAssignmentRow(sun.id)!.p_fail).toBeCloseTo(0.071, 2);
    expect(standbyFor(id, sun.id)).toBeUndefined();
  });

  it("a promised ETA after the safe window is certain failure", () => {
    const id = makeOffer(20, "veg", 75);
    const hope = byName(id, "Hope Shelter")!;
    accept(hope.id, { eta: new Date(Date.now() + 70 * 60000).toISOString() });
    expect(getAssignmentRow(hope.id)!.p_fail).toBe(1);
  });
});
