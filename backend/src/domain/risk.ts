import { config } from "../config";
import {
  addEvent, getOfferRow, getRecipient, hasEvent, insertAssignment, listAssignmentRows, updateAssignment,
} from "../db/repo";
import { tx } from "../db/db";
import { addSecs, nowIso } from "./clock";
import { pct } from "./format";
import { newId } from "./ids";
import { eligibleCandidates } from "./matching";
import { notify } from "./notify";
import { isTerminalOffer, PRIMARY_ACTIVE, standbysFor } from "./offerState";
import { historyPhrase, pComplete } from "./reliability";
import type { AssignmentRow, OfferRow, RecipientRow, ReplyUnderstanding } from "./types";

/** p_fail = 1 if the promised ETA misses the safe window, else 1 - p_complete * (1 - latest reply risk). */
export function computePFail(a: AssignmentRow, offer: Pick<OfferRow, "safe_until">, recipient: RecipientRow): number {
  const reply: ReplyUnderstanding | null = a.last_reply_json ? JSON.parse(a.last_reply_json) : null;
  const latestRisk = reply?.at_risk_probability ?? 0;
  const latest = Date.parse(offer.safe_until) - config.PICKUP_BUFFER_MINS * 60000;
  if (a.eta_promised && Date.parse(a.eta_promised) > latest) return 1;
  return 1 - pComplete(recipient) * (1 - latestRisk);
}

export function runRisk(offerId: string): void {
  tx(() => runRiskInner(offerId));
}

function runRiskInner(offerId: string): void {
  const offer = getOfferRow(offerId);
  if (!offer || isTerminalOffer(offer.status)) return;
  const rows = listAssignmentRows(offerId);

  for (const a of rows.filter((x) => PRIMARY_ACTIVE.includes(x.status))) {
    const recipient = getRecipient(a.recipient_id);
    if (!recipient) continue;
    const pFail = Math.round(computePFail(a, offer, recipient) * 1000) / 1000;
    if (pFail !== a.p_fail) updateAssignment(a.id, { p_fail: pFail });

    if (pFail <= config.RISK_THRESHOLD) continue;
    if (standbysFor(a.id, listAssignmentRows(offerId)).length > 0) continue;

    // everyone already involved in this offer (any status) is excluded
    const involved = new Set(listAssignmentRows(offerId).map((x) => x.recipient_id));
    const best = eligibleCandidates(offer, involved)[0];
    const why = riskReason(a, recipient, pFail);

    if (!best) {
      const marker = `No backup available for ${recipient.name}`;
      if (!hasEvent(offerId, "risk_check", marker)) {
        addEvent(offerId, "risk_check", `${why} ${marker} — nobody else eligible can reach it in time.`, a.id);
      }
      continue;
    }

    const meals = Math.min(a.meals, best.capacity);
    const now = nowIso();
    const sb: AssignmentRow = {
      id: newId("a"), offer_id: offerId, recipient_id: best.recipient.id, demand_id: best.demand.id,
      meals, status: "standby_requested", reliability_at_assignment: Math.round(best.p_mean * 1000) / 1000,
      selection_json: JSON.stringify({
        method: "mean", sampled_p_complete: null, explored: false,
        reason: `Best remaining backup: ${historyPhrase(best.recipient)} (${pct(best.p_mean)}), ${best.distance_km} km away.`,
      }),
      distance_km: best.distance_km, offered_at: now, respond_by: addSecs(now, config.STANDBY_TIMEOUT_SECS),
      accepted_at: null, reconfirm_by: null, collected_at: null, eta_promised: null, p_fail: null,
      is_standby: 1, standby_for_assignment_id: a.id, last_reply_json: null, was_rematched: 0,
    };
    insertAssignment(sb);
    addEvent(offerId, "risk_check", why, a.id);
    addEvent(offerId, "backup_alerted", `Asked ${best.recipient.name} to stand by for ${meals} meals.`, sb.id);
    notify({ kind: "standby", assignmentId: sb.id });
  }
}

function riskReason(a: AssignmentRow, r: RecipientRow, pFail: number): string {
  const reply: ReplyUnderstanding | null = a.last_reply_json ? JSON.parse(a.last_reply_json) : null;
  const bits = [historyPhrase(r)];
  if (reply && reply.at_risk_probability > 0.3) bits.push(`latest reply at-risk ${pct(reply.at_risk_probability)}`);
  if (pFail >= 1 && a.eta_promised) bits.push("promised arrival is after the safe window");
  return `Failure risk for ${r.name} is ${pct(pFail)} (${bits.join("; ")}) — above ${pct(config.RISK_THRESHOLD)}.`;
}
