// Fixed rule table: (Laya intent x assignment status) -> action. AI never acts outside this table.
import { config } from "../config";
import { addEvent, adjustDemandMatched, getAssignmentRow, getRecipient, updateAssignment } from "../db/repo";
import { tx } from "../db/db";
import { fmtTime } from "./format";
import { runMatching } from "./matching";
import { refreshOffer } from "./offerState";
import { runRisk } from "./risk";
import {
  accept, cancel, decline, reconfirm, standbyAccept, standbyDecline, standbyRelease,
} from "./transitions";
import { AppError, type AssignmentRow, type ReplyUnderstanding } from "./types";

export const REPLYABLE = ["offered", "accepted", "reconfirm_sent", "confirmed", "standby_requested", "on_standby"] as const;

type Applied = { action_taken: string; changed: boolean };

/** Apply an understood reply. Returns a human description of what happened. */
export function applyReply(assignmentId: string, u: ReplyUnderstanding): Applied {
  const a = getAssignmentRow(assignmentId);
  if (!a) throw new AppError(404, "NOT_FOUND", `Assignment ${assignmentId} not found`);
  updateAssignment(a.id, { last_reply_json: JSON.stringify(u) });

  if (u.needs_clarification || u.intent_probability < config.INTENT_MIN_PROBABILITY) {
    return { action_taken: "No change — asked to clarify", changed: false };
  }
  if (!(REPLYABLE as readonly string[]).includes(a.status)) {
    return { action_taken: `No change — assignment is already ${a.status}`, changed: false };
  }

  const res = dispatch(a, u);
  // reply risk changes p_fail even when the status didn't change
  runRisk(a.offer_id);
  return res;
}

function dispatch(a: AssignmentRow, u: ReplyUnderstanding): Applied {
  const s = a.status;
  const active = s === "accepted" || s === "reconfirm_sent" || s === "confirmed";
  const note = (msg: string): Applied => {
    addEvent(a.offer_id, "note", msg, a.id);
    return { action_taken: "No change — noted", changed: false };
  };
  const who = getRecipient(a.recipient_id)?.name ?? "Recipient";

  switch (u.intent) {
    case "accept_full":
    case "still_coming":
      if (s === "offered") { accept(a.id); return ok(`Accepted ${a.meals} meals`); }
      if (s === "reconfirm_sent") { reconfirm(a.id); return ok("Reconfirmed — still coming"); }
      if (active) return note(`${who} says they're still coming.`);
      if (s === "standby_requested") { standbyAccept(a.id); return ok("On standby"); }
      return note(`${who} (standby) acknowledged.`);

    case "accept_partial": {
      const m = u.meals;
      if (m === null || m <= 0) return { action_taken: "No change — asked how many meals", changed: false };
      if (s === "standby_requested") { standbyAccept(a.id); return ok("On standby"); }
      if (s === "on_standby") return note(`${who} (standby) can take ${m} meals.`);
      if (m >= a.meals) {
        if (s === "offered") { accept(a.id); return ok(`Accepted ${a.meals} meals`); }
        if (s === "reconfirm_sent") { reconfirm(a.id); return ok("Reconfirmed — still coming"); }
        return note(`${who} can take all ${a.meals} meals.`);
      }
      if (s === "offered") {
        accept(a.id, { meals: m });
        return ok(`Accepted ${m} of ${a.meals} meals; re-matching ${a.meals - m}`);
      }
      reduceTo(a, m);
      return ok(`Reduced to ${m} of ${a.meals} meals; re-matching ${a.meals - m}`);
    }

    case "decline":
    case "cancel":
      if (s === "offered") { decline(a.id); return ok("Declined — offering elsewhere"); }
      if (active) { cancel(a.id); return ok("Cancelled — backup or re-match triggered"); }
      if (s === "standby_requested") { standbyDecline(a.id); return ok("Not standing by — trying the next backup"); }
      standbyRelease(a.id);
      return ok("Released from standby");

    case "running_late":
      if (s === "offered") {
        accept(a.id, { eta: u.eta });
        return ok(u.eta ? `Accepted; arriving around ${fmtTime(u.eta)}` : "Accepted; running late");
      }
      if (active) {
        if (u.eta) {
          updateAssignment(a.id, { eta_promised: u.eta });
          addEvent(a.offer_id, "note", `${who} now expects to arrive around ${fmtTime(u.eta)}.`, a.id);
        }
        return ok(u.eta ? `Noted new ETA ${fmtTime(u.eta)}; risk re-checked` : "Noted running late; risk re-checked");
      }
      if (s === "standby_requested") { standbyAccept(a.id); return ok("On standby"); }
      return note(`${who} (standby) says they'd be late.`);

    case "question":
    default:
      addEvent(a.offer_id, "note", `${who} asked: "${u.text}"`, a.id);
      return { action_taken: "No change — question forwarded", changed: false };
  }
}

function ok(action_taken: string): Applied {
  return { action_taken, changed: true };
}

/** Active primary keeps only m meals; the rest go back to matching. */
function reduceTo(a: AssignmentRow, m: number): void {
  tx(() => {
    updateAssignment(a.id, { meals: m });
    adjustDemandMatched(a.demand_id, m - a.meals);
    const who = getRecipient(a.recipient_id)?.name ?? "Recipient";
    addEvent(a.offer_id, "note", `${who} can now take only ${m} of ${a.meals} meals; re-matching ${a.meals - m}.`, a.id);
    refreshOffer(a.offer_id);
  });
  runMatching(a.offer_id);
}
