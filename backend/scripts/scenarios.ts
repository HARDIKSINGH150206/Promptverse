// Runs the four demo scenarios against a running backend and checks the outcomes.
// Usage: npm run scenarios            (backend on http://localhost:4000)
//        API=http://localhost:4100 npm run scenarios
// Uses Demo controls (reset, fast-forward). Works in mock or live AI mode.

const API = process.env.API ?? "http://localhost:4000";
type Json = any;

async function call(method: string, path: string, body?: unknown, form?: Record<string, string>): Promise<Json> {
  let init: RequestInit = { method };
  if (form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, v);
    init.body = fd;
  } else if (body !== undefined) {
    init = { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  const res = await fetch(API + path, init);
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

let failures = 0;
function check(cond: boolean, msg: string): void {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
}

const minsFromNow = (m: number) => new Date(Date.now() + m * 60000).toISOString();
const byName = (o: Json, name: string) => o.assignments.find((a: Json) => a.recipient_name === name && !["released"].includes(a.status));
const act = (id: string, action: string) => call("POST", `/api/assignments/${id}/${action}`);

async function createOffer(meals: number, diet: "veg" | "nonveg", safeMins: number, name = "Veg Biryani"): Promise<Json> {
  return call("POST", "/api/offers", {
    restaurant_id: "r_koramangala",
    items: [{ name, quantity: meals, unit: "plates" }],
    meal_count: meals, diet,
    cooked_at: minsFromNow(-30), safe_until: minsFromNow(safeMins),
    photo_url: null, raw_transcript: null, pickup_notes: "Back gate",
    confirmations: { diet_confirmed: true, safety_checklist_confirmed: true },
  });
}

async function scenario1() {
  console.log("\nScenario 1: happy path + split");
  await call("POST", "/api/demo/reset");
  let o = await createOffer(40, "veg", 75);
  const hope = byName(o, "Hope Shelter");
  const sun = byName(o, "Sunrise Elders Home");
  check(hope?.meals === 20 && sun?.meals === 20, "40 veg meals split 20 Hope + 20 Sunrise");
  check(o.timeline.some((e: Json) => e.type === "split"), "split event logged");
  await act(hope.id, "accept");
  await act(sun.id, "accept");
  await act(hope.id, "collected");
  o = await act(sun.id, "collected");
  check(o.status === "collected" && o.meals_collected === 40, "offer collected (40 meals)");
  const b = await call("GET", "/api/board");
  check(b.stats.offers_collected_within_window >= 1, `headline metric updated (${b.stats.share_collected_within_window})`);
}

async function scenario2() {
  console.log("\nScenario 2: risk -> standby -> dropout caught");
  await call("POST", "/api/demo/reset");
  let o = await createOffer(20, "veg", 75);
  const hope = byName(o, "Hope Shelter");
  check(!!hope && hope.meals === 20, "20 veg meals offered to Hope");
  await act(hope.id, "accept");
  const r = await call("POST", `/api/assignments/${hope.id}/reply`, { text: "traffic is really bad, may be late" });
  check(r.understood.intent === "running_late", `reply understood as running_late (${r.understood.intent}, ${r.understood.intent_probability})`);
  o = r.offer;
  check(o.risk.highest_p_fail > 0.25, `p_fail above threshold (${o.risk.highest_p_fail})`);
  const sb = o.assignments.find((a: Json) => a.is_standby && a.status === "standby_requested");
  check(sb?.recipient_name === "Sunrise Elders Home", `backup alerted: ${sb?.recipient_name}`);
  await act(sb.id, "standby_accept");
  await call("POST", `/api/demo/fast-forward/${hope.id}`); // accepted -> reconfirm_sent
  o = await call("POST", `/api/demo/fast-forward/${hope.id}`); // reconfirm timeout -> no_response
  const promoted = o.assignments.find((a: Json) => a.id === sb.id);
  check(promoted?.status === "accepted", `standby promoted (${promoted?.status})`);
  check(o.timeline.some((e: Json) => e.type === "standby_promoted"), "standby_promoted event logged");
  check(!o.assignments.some((a: Json) => a.status === "offered"), "no new offer round needed");
  o = await act(sb.id, "collected");
  check(o.status === "collected", "collected within the window");
}

async function scenario3() {
  console.log("\nScenario 3: free-text partial");
  await call("POST", "/api/demo/reset");
  let o = await createOffer(15, "nonveg", 75, "Chicken Curry");
  const stars = byName(o, "Little Stars Home");
  check(stars?.meals === 15, "15 non-veg meals go to Little Stars (Hope and Sunrise are veg-only)");
  check(!o.assignments.some((a: Json) => ["Hope Shelter", "Sunrise Elders Home"].includes(a.recipient_name)), "never offered to veg-only demands");
  const r = await call("POST", `/api/assignments/${stars.id}/reply`, { text: "we can only take 8" });
  o = r.offer;
  check(r.understood.intent === "accept_partial" && r.understood.meals === 8, "understood: accept 8");
  check(o.assignments.find((a: Json) => a.id === stars.id).meals === 8, "Little Stars now holds 8");
  const dawn = o.assignments.find((a: Json) => a.recipient_name === "New Dawn Shelter" && a.status === "offered");
  check(dawn?.meals === 7, `remaining 7 re-matched to New Dawn (${dawn?.meals})`);
  const unclear = await call("POST", `/api/assignments/${stars.id}/reply`, { text: "hmm let me check" });
  const after = unclear.offer.assignments.find((a: Json) => a.id === stars.id);
  check((unclear.understood.needs_clarification || unclear.understood.intent === "question") && after.status === "accepted" && after.meals === 8,
    `unclear reply -> no state change (${unclear.understood.intent} ${unclear.understood.intent_probability}, ${unclear.understood.action_taken})`);
}

async function scenario4() {
  console.log("\nScenario 4: too late -> fallback");
  await call("POST", "/api/demo/reset");
  const o = await createOffer(15, "veg", 25);
  check(o.status === "fallback" && o.fallback_route === "animal_feed", `fallback to animal feed (${o.status}, ${o.fallback_route})`);
  check(o.timeline.some((e: Json) => e.type === "fallback" && /simulated/.test(e.message)), "fallback event says simulated");
}

async function parseChecks() {
  console.log("\nParse + guardrail");
  const p1 = await call("POST", "/api/offers/parse", undefined, { restaurant_id: "r_koramangala", transcript: "around 40 plates veg biryani made at 7 safe till 10 back gate" });
  check(p1.parsed.estimated_meals === 40 && p1.parsed.diet === "veg" && !p1.parsed.guardrail.needs_confirmation, "clear veg -> no confirmation needed");
  const p2 = await call("POST", "/api/offers/parse", undefined, { restaurant_id: "r_koramangala", transcript: "30 plates of biryani made at 8 safe till 11" });
  check(p2.parsed.guardrail.needs_confirmation === true, `ambiguous diet -> needs_confirmation (${p2.parsed.guardrail.reasons.join("; ")})`);
  const p3 = await call("POST", "/api/offers/parse", undefined, { restaurant_id: "r_koramangala", transcript: "20 plates dal rice, it has been sitting out since afternoon, safe till 10" });
  check((p3.parsed.guardrail.safety_concern_probability ?? 0) > 0.3, `safety concern flagged (${p3.parsed.guardrail.safety_concern_probability})`);
  const p4 = await call("POST", "/api/offers/parse", undefined, { restaurant_id: "r_koramangala", transcript: "25 plates veg pulao made at 7" });
  check(p4.parsed.safe_until === null && !!p4.parsed.followup_question, `missing safe_until -> follow-up: "${p4.parsed.followup_question}"`);
}

const rounds = Number(process.env.ROUNDS ?? 1);
for (let i = 0; i < rounds; i++) {
  await parseChecks();
  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
}
await call("POST", "/api/demo/reset");
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll scenario checks passed.");
process.exit(failures ? 1 : 0);

export {};
