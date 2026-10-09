// Checks the decision model on the exact demo sentences and times each call.
// Usage: DECISION_PROVIDER=laya_local npx tsx scripts/laya-check.ts   (or laya / mock)
import { intakeGuardrail } from "../src/ai/guardrail";
import { understandReply } from "../src/ai/understandReply";
import { config } from "../src/config";
import type { AssignmentRow, OfferRow } from "../src/domain/types";

const assignment = { status: "accepted", meals: 20, distance_km: 1.2 } as AssignmentRow;
const offer = { safe_until: new Date(Date.now() + 75 * 60000).toISOString() } as OfferRow;

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const r = await fn();
  console.log(`  ${String(Date.now() - t).padStart(5)} ms  ${label}`);
  return r;
}

console.log(`Decision provider: ${config.DECISION_PROVIDER}\n\nIntake guardrail`);
const intake: [string, "veg" | "nonveg"][] = [
  ["around 40 plates veg biryani made at 7 safe till 10 back gate", "veg"],
  ["30 plates pulao and raita made at 8 safe till 11", "veg"],
  ["20 plates dal rice, it has been sitting out since afternoon, safe till 10", "veg"],
  ["15 plates chicken curry and rice, made at 6, safe till 10", "nonveg"],
];
for (const [t, diet] of intake) {
  const g = await timed(t, () => intakeGuardrail(t, [], diet));
  console.log(`         diet ${g.diet_check?.label} ${g.diet_check?.probability}  safety ${g.safety_concern_probability}  confirm=${g.needs_confirmation}  [${g.source}]`);
}

console.log("\nReplies");
for (const t of [
  "traffic is really bad, may be late",
  "we can only take 8",
  "yes we will collect",
  "sorry we can't come today",
  "on the way, 10 minutes",
  "hmm let me check",
  "haan bhai aa rahe hai, thoda late hoga",
]) {
  const u = await timed(t, () => understandReply(t, assignment, offer));
  console.log(`         ${u.intent} ${u.intent_probability}  at_risk ${u.at_risk_probability}  clarify=${u.needs_clarification}  [${u.source}]`);
}
