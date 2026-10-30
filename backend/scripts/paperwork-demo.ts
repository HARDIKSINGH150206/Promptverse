// Generates the paperwork as files you can open in a browser (and print / save as PDF).
// Usage: npx tsx scripts/paperwork-demo.ts [offer_id]
//   - with an offer id (or the latest offer in the DB): its declaration, any handover notes, the month's register
//   - always: a complete SAMPLE set (declaration -> handover -> register), so the flow shows even with matching off
// Output: data/paperwork/  (gitignored). FSSAI numbers here are made-up samples.
import fs from "node:fs";
import path from "node:path";
import { listOfferRows } from "../src/db/repo";
import type { Assignment, Offer } from "../src/domain/types";
import {
  buildDeclaration, buildHandover, buildRegister, declarationForOffer, handoversForOffer, registerForMonth,
  renderHtml, renderRegisterCsv, type ComplianceLookup,
} from "../src/paperwork";

const OUT = path.resolve("data/paperwork");
fs.mkdirSync(OUT, { recursive: true });
const write = (name: string, body: string) => {
  fs.writeFileSync(path.join(OUT, name), body);
  console.log(`  ${path.join(OUT, name)}`);
};

// made-up, well-formed numbers for the demo; nothing here is a real business's licence
const SAMPLE_COMPLIANCE: ComplianceLookup = {
  restaurant: () => ({ fssai_number: "11226999000123", address: "80 Feet Road, Koramangala, Bengaluru", contact_person: "Kitchen manager" }),
  recipient: () => ({ fssai_number: "21226999000456", address: "BTM Layout, Bengaluru" }),
};

// ---- from the database ----
const offers = listOfferRows();
const offerId = process.argv[2] ?? offers.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id;
if (offerId) {
  console.log(`From the database (offer ${offerId}):`);
  const decl = declarationForOffer(offerId, { compliance: SAMPLE_COMPLIANCE, sample: true });
  write(`${decl.doc_no}.html`, renderHtml(decl));
  for (const h of handoversForOffer(offerId, { compliance: SAMPLE_COMPLIANCE, sample: true })) write(`${h.doc_no}.html`, renderHtml(h));
  const period = decl.doc_no.slice(3, 7) + "-" + decl.doc_no.slice(7, 9);
  const reg = registerForMonth(period, { compliance: SAMPLE_COMPLIANCE, sample: true });
  write(`register-${period}.html`, renderHtml(reg));
  write(`register-${period}.csv`, renderRegisterCsv(reg));
} else {
  console.log("No offers in the database yet; only the sample set is generated.");
}

// ---- a complete sample flow: voice call -> pickup -> register ----
const now = Date.now();
const iso = (minsFromNow: number) => new Date(now + minsFromNow * 60000).toISOString();
const offer: Offer = {
  id: "o_7k2m9q", restaurant_id: "r_sample", restaurant_name: "Koramangala Kitchen",
  items: [{ name: "Veg biryani", quantity: 40, unit: "plates" }, { name: "Raita", quantity: 40, unit: "cups" }],
  meal_count: 40, meals_assigned: 40, meals_collected: 40, diet: "veg",
  cooked_at: iso(-120), safe_until: iso(360), photo_url: null,
  raw_transcript: "Hi, this is Koramangala Kitchen. We have about 40 plates of veg biryani with raita. Made at 2, safe till 10 tonight. Pickup from the back gate. Yes, that's right. Yes, all covered and kept hot.",
  pickup_notes: "Back gate, ask for the kitchen manager", status: "collected", fallback_route: null, created_at: iso(-5),
};
const declaration = buildDeclaration({
  offer, donor: { id: offer.restaurant_id, name: offer.restaurant_name, area: "Koramangala" },
  compliance: SAMPLE_COMPLIANCE.restaurant(offer.restaurant_id), method: "voice_call",
  guardrail: { source: "llm", diet_check: { label: "veg", probability: 0.97, agrees_with_extraction: true }, safety_concern_probability: 0.04, needs_confirmation: false, reasons: [] },
  call: { call_id: "call_sample", language: "en-IN", transcript: offer.raw_transcript, diet_confirmed_at: iso(-6), safety_confirmed_at: iso(-5) },
  sample: true, now,
});
const pickup: Assignment = {
  id: "a_4h8n3x", offer_id: offer.id, recipient_id: "rc_sample", recipient_name: "Hope Shelter", demand_id: "d_sample",
  meals: 40, status: "collected", reliability_at_assignment: 0.91,
  selection: { method: "mean", sampled_p_complete: null, explored: false, reason: "most reliable nearby" },
  distance_km: 2.4, offered_at: iso(-4), respond_by: iso(-3), accepted_at: iso(-4), reconfirm_by: null,
  collected_at: iso(40), eta_promised: null, p_fail: 0.08, is_standby: false, standby_for_assignment_id: null, last_reply: null,
};
const handover = buildHandover({
  declaration, assignment: pickup, recipient: { id: "rc_sample", name: "Hope Shelter", area: "BTM Layout", type: "shelter" },
  compliance: SAMPLE_COMPLIANCE.recipient("rc_sample"), received: { at: pickup.collected_at!, method: "telegram" }, now,
});
const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date(now)).slice(0, 7);
const register = buildRegister(month, [{
  date: new Date(now).toISOString().slice(0, 10), doc_no: declaration.doc_no, offer_id: offer.id, donor: offer.restaurant_name,
  donor_fssai: "11226999000123", food: "Veg biryani, Raita", diet: "veg", meals_offered: 40, meals_collected: 40,
  cooked_at: offer.cooked_at, safe_until: offer.safe_until, collected_by: "Hope Shelter", picked_up_at: pickup.collected_at,
  outcome: "Collected", safety_confirmed: true,
}], { sample: true, now });

console.log("Sample flow:");
write("sample-1-declaration.html", renderHtml(declaration));
write("sample-2-handover.html", renderHtml(handover));
write("sample-3-register.html", renderHtml(register));
write("sample-3-register.csv", renderRegisterCsv(register));
