// FSSAI-style paperwork for surplus-food donations, generated from what AnnaRelay already records.
// Standalone: nothing in the app calls this yet. Three documents:
//
//   Donation declaration  as soon as an offer is listed (right after the voice call): donor, FSSAI no.,
//                         food, cooked / safe-until times, each confirmation with how and when it was given.
//   Handover note         per completed pickup: donor -> receiving organisation, meals, pickup time,
//                         whether it was inside the safe window.
//   Monthly register      every donation in a month, as a printable page and CSV.
//
// Each record carries a fingerprint (a hash of its facts) so a reprint can be matched to the original
// and any edit shows. Documents marked `sample` print a SAMPLE watermark.
//
// Connecting it later (no other changes needed in this module):
//   1. Voice call: in agent/session.ts submitOffer(), after createOffer() succeeds,
//        const doc = declarationForOffer(offerId, { call: { call_id, language, transcript, diet_confirmed_at, safety_confirmed_at } })
//        this.send({ type: "paperwork", doc, html: renderHtml(doc) })
//      (the session would need to remember when each spoken "yes" happened; it knows askedAt today).
//   2. Routes: GET /api/offers/:id/paperwork -> declaration + handovers as JSON, ?format=html for the page;
//              GET /api/paperwork/register?month=YYYY-MM[&restaurant_id=] (&format=csv).
//   3. Pickup: when an assignment becomes "collected" (domain/transitions.ts), build its handover note
//      and send it to both parties (Telegram document / the web inbox).
//   4. FSSAI numbers: add columns to restaurants / recipients (or a compliance table) and pass a
//      ComplianceLookup that reads them. Until someone checks a number on FSSAI's FoSCoS portal it
//      stays "format OK, not verified".
//
// What it does NOT do: it doesn't verify numbers with FSSAI, sign anything legally, or decide food is
// safe. It records what the donor and collector stated. Check the wording against the FSS (Recovery
// and Distribution of Surplus Food) Regulations, 2019 before using it for real.

export { checkFssai, formatFssai, type FssaiCheck } from "./fssai";
export { buildDeclaration, buildHandover, buildRegister, fingerprint, CHECKLIST } from "./build";
export { declarationForOffer, handoversForOffer, registerForMonth, type FromDbOptions } from "./fromDb";
export { renderDeclaration, renderHandover, renderRegister, renderHtml, renderRegisterCsv, fmtDateTime } from "./render";
export * from "./types";
