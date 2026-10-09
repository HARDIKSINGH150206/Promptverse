import { beforeEach, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { db } from "../src/db/db";
import { assignmentsOf, byName, makeOffer, offer, reset } from "./helpers";

describe("matching", () => {
  beforeEach(reset);

  it("splits a 40-meal veg offer 20 -> Hope, 20 -> Sunrise", () => {
    const id = makeOffer(40, "veg");
    const as = assignmentsOf(id);
    expect(as.map((a) => [a.name, a.meals])).toEqual([["Hope Shelter", 20], ["Sunrise Elders Home", 20]]);
    expect(JSON.parse(as[0].selection_json).method).toBe("mean");
  });

  it("never sends non-veg food to veg-only demands", () => {
    const id = makeOffer(60, "nonveg");
    const names = assignmentsOf(id).map((a) => a.name);
    expect(names).not.toContain("Hope Shelter");
    expect(names).not.toContain("Sunrise Elders Home");
    expect(names[0]).toBe("Little Stars Home");
  });

  it("skips a candidate whose ETA misses safe_until - buffer", () => {
    // Sunrise is 3.8 km away: eta = ceil(3.8/20*60)+10 = 22 min; + 20 min buffer = 42 min.
    // Hope (1.2 km): 4+10 = 14 + 20 = 34 min. A 38-minute window fits Hope but not Sunrise.
    const id = makeOffer(40, "veg", 38);
    const names = assignmentsOf(id).map((a) => a.name);
    expect(names).toContain("Hope Shelter");
    expect(names).not.toContain("Sunrise Elders Home");
  });

  it("routes to the simulated fallback when nobody can make it", () => {
    const id = makeOffer(15, "veg", 25);
    expect(offer(id).status).toBe("fallback");
    expect(offer(id).fallback_route).toBe(config.FALLBACK_ORDER[0]);
    const ev = db.prepare("SELECT message FROM events WHERE offer_id = ? AND type = 'fallback'").get(id) as { message: string };
    expect(ev.message).toMatch(/simulated/);
  });

  it("uses Thompson sampling only when there is enough slack", () => {
    config.THOMPSON_SAMPLING = "on";
    try {
      const short = makeOffer(10, "veg", 60);
      expect(JSON.parse(assignmentsOf(short)[0].selection_json).method).toBe("mean");
      reset();
      const long = makeOffer(10, "veg", 200);
      const sel = JSON.parse(assignmentsOf(long)[0].selection_json);
      expect(sel.method).toBe("thompson");
      expect(typeof sel.sampled_p_complete).toBe("number");
    } finally {
      config.THOMPSON_SAMPLING = "off";
    }
  });

  it("demand bookkeeping tracks matched meals", () => {
    makeOffer(40, "veg");
    const d = db.prepare("SELECT meals_matched, status FROM demands WHERE id = 'd_hope'").get();
    expect(d).toEqual({ meals_matched: 20, status: "matched" });
    expect(byName(makeOffer(5, "veg"), "Hope Shelter")).toBeUndefined();
  });
});
