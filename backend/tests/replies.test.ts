import { beforeEach, describe, expect, it } from "vitest";
import { getAssignmentRow } from "../src/db/repo";
import { applyReply } from "../src/domain/replies";
import type { ReplyIntent, ReplyUnderstanding } from "../src/domain/types";
import { handleReply } from "../src/replyFlow";
import { byName, makeOffer, reset } from "./helpers";

function u(intent: ReplyIntent, p: number, extra: Partial<ReplyUnderstanding> = {}): ReplyUnderstanding {
  return {
    text: "test", source: "mock", intent, intent_probability: p,
    probabilities: { accept_full: 0, accept_partial: 0, decline: 0, cancel: 0, still_coming: 0, running_late: 0, question: 0, [intent]: p },
    at_risk_probability: 0, meals: null, eta: null, needs_clarification: p < 0.7, clarification_question: null, action_taken: "",
    ...extra,
  };
}

describe("replies", () => {
  beforeEach(reset);

  it("accept_partial 12 of 20 at offered -> assignment 12, 8 re-matched", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    const res = applyReply(hope.id, u("accept_partial", 0.9, { meals: 12 }));
    expect(res.changed).toBe(true);
    expect(getAssignmentRow(hope.id)!).toMatchObject({ status: "accepted", meals: 12 });
    expect(byName(id, "Sunrise Elders Home", ["offered"])?.meals).toBe(8);
  });

  it("intent probability 0.55 -> no state change", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    const res = applyReply(hope.id, u("accept_full", 0.55));
    expect(res.changed).toBe(false);
    expect(getAssignmentRow(hope.id)!.status).toBe("offered");
  });

  it("decline on an accepted pickup cancels it", () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    applyReply(hope.id, u("accept_full", 0.9));
    applyReply(hope.id, u("decline", 0.9));
    expect(getAssignmentRow(hope.id)!.status).toBe("cancelled");
  });

  it("free text end-to-end with mock Laya: only 8 of 15", async () => {
    const id = makeOffer(15, "nonveg");
    const ls = byName(id, "Little Stars Home")!;
    const { understood, offer } = await handleReply(ls.id, "we can only take 8");
    expect(understood.intent).toBe("accept_partial");
    expect(understood.meals).toBe(8);
    expect(offer.assignments.find((a) => a.id === ls.id)!.meals).toBe(8);
    expect(offer.assignments.find((a) => a.recipient_name === "New Dawn Shelter" && a.status === "offered")?.meals).toBe(7);
    expect(offer.timeline.some((e) => e.type === "reply_understood")).toBe(true);
  });

  it("free text: an unclear reply asks to clarify and changes nothing", async () => {
    const id = makeOffer(20, "veg");
    const hope = byName(id, "Hope Shelter")!;
    const { understood } = await handleReply(hope.id, "hmm let me check");
    expect(understood.needs_clarification).toBe(true);
    expect(understood.clarification_question).toBeTruthy();
    expect(getAssignmentRow(hope.id)!.status).toBe("offered");
  });
});
