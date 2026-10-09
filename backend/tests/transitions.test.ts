import { beforeEach, describe, expect, it } from "vitest";
import { getAssignmentRow, getRecipient, updateAssignment } from "../src/db/repo";
import { runRisk } from "../src/domain/risk";
import { accept, cancel, collected, sendReconfirm, standbyAccept, timeoutOffer, timeoutReconfirm } from "../src/domain/transitions";
import { AppError } from "../src/domain/types";
import { assignmentsOf, byName, makeOffer, offer, reset } from "./helpers";

describe("transitions", () => {
  beforeEach(reset);

  it("cancel from offered -> 409 INVALID_TRANSITION", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    let err: unknown;
    try {
      cancel(hope.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect((err as AppError).code).toBe("INVALID_TRANSITION");
  });

  it("reconfirm timeout with an on_standby backup -> backup becomes accepted, no new offer sent", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    accept(hope.id);
    updateAssignment(hope.id, { last_reply_json: JSON.stringify({ at_risk_probability: 0.78 }) });
    runRisk(id);
    const sb = assignmentsOf(id).find((a) => a.is_standby && a.status === "standby_requested")!;
    standbyAccept(sb.id);
    sendReconfirm(hope.id);
    const noShowsBefore = getRecipient("rc_hope")!.no_show;
    timeoutReconfirm(hope.id);

    expect(getAssignmentRow(hope.id)!.status).toBe("no_response");
    expect(getAssignmentRow(hope.id)!.was_rematched).toBe(1);
    expect(getRecipient("rc_hope")!.no_show).toBe(noShowsBefore + 1);
    expect(getAssignmentRow(sb.id)!.status).toBe("accepted");
    expect(assignmentsOf(id).filter((a) => a.status === "offered")).toHaveLength(0);
  });

  it("offer timeout has no penalty and re-matches", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    const before = getRecipient("rc_hope")!;
    timeoutOffer(hope.id);
    expect(getRecipient("rc_hope")!.no_show).toBe(before.no_show);
    expect(byName(id, "Sunrise Elders Home", ["offered"])).toBeDefined();
  });

  it("collecting everything completes the offer and releases standbys", () => {
    const id = makeOffer(15, "nonveg");
    const ls = byName(id, "Little Stars Home")!;
    accept(ls.id); // p_fail 0.375 -> standby requested
    collected(ls.id);
    expect(offer(id).status).toBe("collected");
    expect(assignmentsOf(id).filter((a) => a.is_standby).every((a) => a.status === "released")).toBe(true);
  });
});
