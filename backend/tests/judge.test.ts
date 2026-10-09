import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/db";
import { getRecipientByChat } from "../src/db/repo";
import { seed } from "../src/db/seed";
import { joinAsJudge, listJudges } from "../src/judge";
import { assignmentsOf, makeOffer, reset } from "./helpers";

describe("judge mode", () => {
  beforeEach(reset);

  it("a judge becomes a linked shelter with an open demand", () => {
    const j = joinAsJudge("12345", "Asha");
    expect(j.name).toBe("Asha's Shelter");
    expect(getRecipientByChat("12345")?.id).toBe(j.id);
    const d = db.prepare("SELECT people_count, diet, status FROM demands WHERE recipient_id = ?").get(j.id);
    expect(d).toEqual({ people_count: 20, diet: "any", status: "open" });
  });

  it("joining twice from the same chat reuses the same shelter", () => {
    const a = joinAsJudge("777", "Ravi");
    const b = joinAsJudge("777", "Ravi");
    expect(b.id).toBe(a.id);
    expect(listJudges()).toHaveLength(1);
  });

  it("the judge ranks first, so the stage offer lands on their phone", () => {
    const j = joinAsJudge("999", "Meera");
    const id = makeOffer(20, "veg");
    expect(assignmentsOf(id)[0].recipient_id).toBe(j.id);
  });

  it("judges survive a demo reset", () => {
    const j = joinAsJudge("555", "Kiran");
    seed({ keepTelegramLinks: true });
    expect(getRecipientByChat("555")?.id).toBe(j.id);
    const open = db.prepare("SELECT COUNT(*) AS n FROM demands WHERE recipient_id = ? AND status = 'open'").get(j.id) as { n: number };
    expect(open.n).toBe(1);
  });
});
