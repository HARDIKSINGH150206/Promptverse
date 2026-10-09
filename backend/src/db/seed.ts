// Seed data. Everything here is SIMULATED and flagged as such.
import type Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import { clearAll, db, tx } from "./db";
import { addSecs, nowMs } from "../domain/clock";
import { resetRng } from "../domain/bayes";
import { localToMs } from "../ai/time";
import type { RecipientRow } from "../domain/types";

const KM_LAT = 1 / 111.32;
const KM_LNG = 1 / (111.32 * Math.cos((12.9352 * Math.PI) / 180));

// Koramangala Kitchen is the reference point for the recipient distances in the plan.
const KK = { lat: 12.9352, lng: 77.6245 };

export const RESTAURANTS = [
  { id: "r_koramangala", name: "Koramangala Kitchen", area: "Koramangala", lat: KK.lat, lng: KK.lng },
  { id: "r_indiranagar", name: "Indiranagar Tiffins", area: "Indiranagar", lat: 12.9719, lng: 77.6412 },
];

type Seed = Omit<RecipientRow, "telegram_chat_id" | "is_simulated_history"> & { demand: { people: number; diet: "veg" | "any" } };

const at = (northKm: number, eastKm: number) => ({ lat: KK.lat + northKm * KM_LAT, lng: KK.lng + eastKm * KM_LNG });

export const RECIPIENTS: Seed[] = [
  { id: "rc_hope", name: "Hope Shelter", type: "shelter", area: "Koramangala 6th Block", ...at(1.2, 0),
    link_code: "HOPE1", completed: 18, cancelled: 1, no_show: 1, avg_response_secs: 120, demand: { people: 20, diet: "veg" } },
  { id: "rc_sunrise", name: "Sunrise Elders Home", type: "old_age_home", area: "HSR Layout", ...at(-2.687, 2.687),
    link_code: "SUN1", completed: 12, cancelled: 0, no_show: 0, avg_response_secs: 200, demand: { people: 20, diet: "veg" } },
  { id: "rc_stars", name: "Little Stars Home", type: "orphanage", area: "Ejipura", ...at(0, -2.5),
    link_code: "STAR1", completed: 9, cancelled: 3, no_show: 2, avg_response_secs: 400, demand: { people: 15, diet: "any" } },
  { id: "rc_saathi", name: "Saathi NGO", type: "ngo", area: "Koramangala 8th Block", ...at(0, 1.0),
    link_code: "SAATHI1", completed: 4, cancelled: 2, no_show: 3, avg_response_secs: 500, demand: { people: 25, diet: "any" } },
  { id: "rc_dawn", name: "New Dawn Shelter", type: "shelter", area: "BTM Layout", ...at(-2.0, 0),
    link_code: "DAWN1", completed: 0, cancelled: 0, no_show: 0, avg_response_secs: 300, demand: { people: 15, diet: "any" } },
];

/** Tonight 21:30 local; if that's under 2 h away (late rehearsals), ~4 h from now instead. */
export function demandDeadline(ref = nowMs()): string {
  const tonight = localToMs(0, 21, 30, ref);
  if (tonight - ref >= 2 * 3600_000) return new Date(tonight).toISOString();
  return new Date(Math.ceil((ref + 4 * 3600_000) / 1800_000) * 1800_000).toISOString();
}

export function seed(opts: { keepTelegramLinks?: boolean } = {}): void {
  tx(() => {
    const links = opts.keepTelegramLinks
      ? (db.prepare("SELECT link_code, telegram_chat_id FROM recipients WHERE telegram_chat_id IS NOT NULL").all() as {
          link_code: string; telegram_chat_id: string;
        }[])
      : [];
    clearAll();

    const insR = db.prepare("INSERT INTO restaurants (id, name, area, lat, lng) VALUES (@id, @name, @area, @lat, @lng)");
    for (const r of RESTAURANTS) insR.run(r);

    const insRc = db.prepare(
      `INSERT INTO recipients (id, name, type, area, lat, lng, telegram_chat_id, link_code, completed, cancelled, no_show, avg_response_secs, is_simulated_history)
       VALUES (@id, @name, @type, @area, @lat, @lng, NULL, @link_code, @completed, @cancelled, @no_show, @avg_response_secs, 1)`
    );
    const insD = db.prepare(
      `INSERT INTO demands (id, recipient_id, people_count, meals_matched, diet, needed_by, max_distance_km, notes, status, raw_transcript, created_at)
       VALUES (@id, @recipient_id, @people_count, @meals_matched, @diet, @needed_by, 5, @notes, @status, NULL, @created_at)`
    );
    const now = nowMs();
    const neededBy = demandDeadline(now);
    for (const r of RECIPIENTS) {
      const { demand, ...row } = r;
      insRc.run(row);
      insD.run({
        id: `d_${r.id.slice(3)}`, recipient_id: r.id, people_count: demand.people, meals_matched: 0, diet: demand.diet,
        needed_by: neededBy, notes: "Simulated demand", status: "open", created_at: addSecs(now, -3600),
      });
    }
    for (const l of links) {
      db.prepare("UPDATE recipients SET telegram_chat_id = ? WHERE link_code = ?").run(l.telegram_chat_id, l.link_code);
    }

    seedHistory(now, insD);
  });
  resetRng();
}

/** A few finished offers from yesterday so the board isn't empty. All simulated. */
function seedHistory(now: number, insD: Database.Statement): void {
  const past = [
    { id: "o_past1", r: "r_koramangala", rc: "rc_hope", meals: 25, dish: "Veg Pulao", diet: "veg", cook: [19, 0], safe: [22, 0], got: [20, 10] },
    { id: "o_past2", r: "r_indiranagar", rc: "rc_sunrise", meals: 18, dish: "Idli Sambar", diet: "veg", cook: [8, 0], safe: [12, 0], got: [9, 20] },
    { id: "o_past3", r: "r_koramangala", rc: "rc_stars", meals: 12, dish: "Egg Curry and Rice", diet: "nonveg", cook: [13, 0], safe: [16, 30], got: [14, 5] },
  ] as const;
  const iso = (h: number, m: number) => new Date(localToMs(-1, h, m, now)).toISOString();
  const ev = db.prepare("INSERT INTO events (id, offer_id, at, type, message, assignment_id) VALUES (?, ?, ?, ?, ?, ?)");

  for (const p of past) {
    const cooked = iso(p.cook[0], p.cook[1]);
    const safe = iso(p.safe[0], p.safe[1]);
    const got = iso(p.got[0], p.got[1]);
    const offered = addSecs(cooked, 1800);
    const accepted = addSecs(offered, 90);
    const dId = `d_hist_${p.id.slice(2)}`;
    insD.run({
      id: dId, recipient_id: p.rc, people_count: p.meals, meals_matched: p.meals, diet: p.diet === "veg" ? "veg" : "any",
      needed_by: safe, notes: "Simulated history", status: "fulfilled", created_at: cooked,
    });
    db.prepare(
      `INSERT INTO offers (id, restaurant_id, items_json, meal_count, meals_assigned, meals_collected, diet, cooked_at, safe_until, photo_url, raw_transcript, pickup_notes, status, fallback_route, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, 'collected', NULL, ?)`
    ).run(p.id, p.r, JSON.stringify([{ name: p.dish, quantity: p.meals, unit: "plates" }]), p.meals, p.meals, p.meals, p.diet,
      cooked, safe, `(simulated) ${p.meals} plates ${p.dish.toLowerCase()}`, offered);
    const aId = `a_hist_${p.id.slice(2)}`;
    db.prepare(
      `INSERT INTO assignments (id, offer_id, recipient_id, demand_id, meals, status, reliability_at_assignment, selection_json, distance_km, offered_at, respond_by, accepted_at, reconfirm_by, collected_at, eta_promised, p_fail, is_standby, standby_for_assignment_id, last_reply_json, was_rematched)
       VALUES (?, ?, ?, ?, ?, 'collected', 0.8, ?, 2.0, ?, ?, ?, NULL, ?, NULL, 0, 0, NULL, NULL, 0)`
    ).run(aId, p.id, p.rc, dId, p.meals,
      JSON.stringify({ method: "mean", sampled_p_complete: null, explored: false, reason: "Simulated history" }),
      offered, addSecs(offered, 45), accepted, got);
    ev.run(`e_h1_${p.id}`, p.id, offered, "offer_created", `(Simulated) ${p.meals} meals of ${p.dish} listed.`, null);
    ev.run(`e_h2_${p.id}`, p.id, offered, "offered", `(Simulated) Offered ${p.meals} meals.`, aId);
    ev.run(`e_h3_${p.id}`, p.id, accepted, "accepted", `(Simulated) Accepted ${p.meals} meals.`, aId);
    ev.run(`e_h4_${p.id}`, p.id, got, "collected", `(Simulated) Collected ${p.meals} meals within the safe window.`, aId);
  }
}

// `npm run seed`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed();
  console.log("Seeded AnnaRelay demo data (simulated).");
}
