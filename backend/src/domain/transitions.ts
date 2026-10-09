import { config } from "../config";
import {
  addEvent, adjustDemandMatched, bumpRecipientStat, getAssignmentRow, getOfferRow, getRecipient,
  listAssignmentRows, recordResponseTime, updateAssignment, updateOffer,
} from "../db/repo";
import { tx } from "../db/db";
import { addSecs, nowIso, nowMs } from "./clock";
import { fmtDuration, fmtTime } from "./format";
import { runMatching } from "./matching";
import { notify } from "./notify";
import { maybeFulfilDemand, PRIMARY_ACTIVE, refreshOffer, releaseStandby, standbysFor } from "./offerState";
import { runRisk } from "./risk";
import { AppError, type AssignmentAction, type AssignmentRow, type AssignmentStatus } from "./types";

function load(id: string): AssignmentRow {
  const a = getAssignmentRow(id);
  if (!a) throw new AppError(404, "NOT_FOUND", `Assignment ${id} not found`);
  return a;
}

function need(a: AssignmentRow, from: AssignmentStatus[], action: string): void {
  if (!from.includes(a.status)) {
    throw new AppError(409, "INVALID_TRANSITION", `Cannot ${action} an assignment that is ${a.status}`);
  }
}

const name = (a: AssignmentRow) => getRecipient(a.recipient_id)?.name ?? "Recipient";

// ---------- primary actions ----------

/** offered -> accepted. Optional partial meals and promised ETA (from free-text replies). */
export function accept(id: string, opts: { meals?: number; eta?: string | null } = {}): void {
  let rematch = false;
  tx(() => {
    const a = load(id);
    need(a, ["offered"], "accept");
    const now = nowIso();
    const meals = opts.meals && opts.meals > 0 && opts.meals < a.meals ? opts.meals : a.meals;
    updateAssignment(id, { status: "accepted", accepted_at: now, meals, eta_promised: opts.eta ?? a.eta_promised });
    recordResponseTime(a.recipient_id, Math.max(1, (nowMs() - Date.parse(a.offered_at)) / 1000));
    if (meals < a.meals) {
      adjustDemandMatched(a.demand_id, meals - a.meals);
      addEvent(a.offer_id, "accepted", `${name(a)} accepted ${meals} of ${a.meals} meals; re-matching ${a.meals - meals}.`, id);
      rematch = true;
    } else {
      addEvent(a.offer_id, "accepted", `${name(a)} accepted ${meals} meals.`, id);
    }
    if (opts.eta) addEvent(a.offer_id, "note", `${name(a)} expects to arrive around ${fmtTime(opts.eta)}.`, id);
    refreshOffer(a.offer_id);
  });
  const a = load(id);
  if (rematch) runMatching(a.offer_id);
  runRisk(a.offer_id);
}

/** offered -> declined; meals go back to matching. */
export function decline(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, ["offered"], "decline");
    updateAssignment(id, { status: "declined" });
    adjustDemandMatched(a.demand_id, -a.meals);
    recordResponseTime(a.recipient_id, Math.max(1, (nowMs() - Date.parse(a.offered_at)) / 1000));
    addEvent(a.offer_id, "declined", `${name(a)} declined ${a.meals} meals.`, id);
    refreshOffer(a.offer_id);
  });
  runMatching(a.offer_id);
}

/** reconfirm_sent -> confirmed. */
export function reconfirm(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, ["reconfirm_sent"], "reconfirm");
    updateAssignment(id, { status: "confirmed" });
    addEvent(a.offer_id, "confirmed", `${name(a)} confirmed they're still coming.`, id);
    refreshOffer(a.offer_id);
  });
  runRisk(a.offer_id);
}

/** accepted | reconfirm_sent | confirmed -> cancelled; standby takes over or meals re-match. */
export function cancel(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, PRIMARY_ACTIVE, "cancel");
    updateAssignment(id, { status: "cancelled" });
    bumpRecipientStat(a.recipient_id, "cancelled");
    addEvent(a.offer_id, "cancelled", `${name(a)} cancelled their pickup of ${a.meals} meals.`, id);
  });
  promoteStandbyOrRematch(id);
}

/** accepted | reconfirm_sent | confirmed -> collected. */
export function collected(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, PRIMARY_ACTIVE, "mark collected");
    const offer = getOfferRow(a.offer_id)!;
    const now = nowIso();
    updateAssignment(id, { status: "collected", collected_at: now, p_fail: 0 });
    bumpRecipientStat(a.recipient_id, "completed");
    updateOffer(a.offer_id, { meals_collected: offer.meals_collected + a.meals });
    const spare = (Date.parse(offer.safe_until) - nowMs()) / 60000;
    const timing = spare >= 0 ? `with ${fmtDuration(spare)} to spare` : `${fmtDuration(-spare)} after the safe window`;
    addEvent(a.offer_id, "collected", `${name(a)} collected ${a.meals} meals ${timing}.`, id);
    for (const s of standbysFor(id, listAssignmentRows(a.offer_id))) {
      releaseStandby(s, `${name(s)} released from standby — ${name(a)} collected.`);
    }
    maybeFulfilDemand(a.demand_id);
    refreshOffer(a.offer_id);
  });
}

// ---------- standby actions ----------

export function standbyAccept(id: string): void {
  tx(() => {
    const a = load(id);
    need(a, ["standby_requested"], "stand by for");
    updateAssignment(id, { status: "on_standby" });
    recordResponseTime(a.recipient_id, Math.max(1, (nowMs() - Date.parse(a.offered_at)) / 1000));
    addEvent(a.offer_id, "standby_ready", `${name(a)} is on standby for ${a.meals} meals.`, id);
  });
}

export function standbyDecline(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, ["standby_requested"], "decline standby for");
    updateAssignment(id, { status: "released" });
    addEvent(a.offer_id, "standby_released", `${name(a)} can't stand by today (no penalty).`, id);
  });
  runRisk(a.offer_id); // try the next candidate
}

/** on_standby -> released, when the backup says they can no longer help. */
export function standbyRelease(id: string): void {
  tx(() => {
    const a = load(id);
    need(a, ["on_standby", "standby_requested"], "release");
    updateAssignment(id, { status: "released" });
    addEvent(a.offer_id, "standby_released", `${name(a)} is no longer available as a backup.`, id);
  });
  runRisk(load(id).offer_id);
}

// ---------- dropouts ----------

export function promoteStandbyOrRematch(failedId: string): void {
  const failed = load(failedId);
  let promotedId: string | null = null;
  tx(() => {
    const rows = listAssignmentRows(failed.offer_id);
    const backups = standbysFor(failedId, rows);
    const ready = backups.find((b) => b.status === "on_standby");

    adjustDemandMatched(failed.demand_id, -failed.meals);
    updateAssignment(failedId, { was_rematched: 1 });

    if (ready) {
      const now = nowIso();
      updateAssignment(ready.id, { status: "accepted", accepted_at: now, p_fail: null });
      adjustDemandMatched(ready.demand_id, ready.meals);
      addEvent(
        failed.offer_id, "standby_promoted",
        `${name(failed)} dropped out. ${name(ready)} was already on standby — took over ${ready.meals} meals instantly.`,
        ready.id
      );
      notify({ kind: "promoted", assignmentId: ready.id });
      promotedId = ready.id;
    } else {
      addEvent(failed.offer_id, "rematch", `Re-matching ${failed.meals} meals after ${name(failed)} dropped out.`, failedId);
    }
    for (const b of backups.filter((x) => x.id !== promotedId)) {
      releaseStandby(b, `${name(b)} released from standby — no longer needed.`);
    }
    refreshOffer(failed.offer_id);
  });
  runMatching(failed.offer_id); // covers any meals the backup couldn't take
  runRisk(failed.offer_id);
}

// ---------- timeouts (scheduler) ----------

export function timeoutOffer(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, ["offered"], "time out");
    updateAssignment(id, { status: "no_response" });
    adjustDemandMatched(a.demand_id, -a.meals);
    addEvent(a.offer_id, "no_response", `${name(a)} didn't respond in time (no penalty) — offering elsewhere.`, id);
    refreshOffer(a.offer_id);
  });
  runMatching(a.offer_id);
}

export function sendReconfirm(id: string): void {
  tx(() => {
    const a = load(id);
    need(a, ["accepted"], "reconfirm");
    updateAssignment(id, { status: "reconfirm_sent", reconfirm_by: addSecs(nowIso(), config.RECONFIRM_TIMEOUT_SECS) });
    addEvent(a.offer_id, "reconfirm_sent", `Asked ${name(a)} to reconfirm they're still coming.`, id);
  });
  notify({ kind: "reconfirm", assignmentId: id });
}

export function timeoutReconfirm(id: string): void {
  tx(() => {
    const a = load(id);
    need(a, ["reconfirm_sent"], "time out");
    updateAssignment(id, { status: "no_response" });
    bumpRecipientStat(a.recipient_id, "no_show");
    addEvent(a.offer_id, "no_response", `${name(a)} went silent at reconfirm — counted as a no-show.`, id);
  });
  promoteStandbyOrRematch(id);
}

export function timeoutStandby(id: string): void {
  const a = load(id);
  tx(() => {
    need(a, ["standby_requested"], "time out");
    updateAssignment(id, { status: "released" });
    addEvent(a.offer_id, "standby_released", `${name(a)} didn't answer the standby request (no penalty).`, id);
  });
  runRisk(a.offer_id);
}

// ---------- REST / Telegram entry point ----------

export function applyAction(id: string, action: AssignmentAction): string {
  const a = load(id);
  switch (action) {
    case "accept": accept(id); break;
    case "decline": decline(id); break;
    case "reconfirm": reconfirm(id); break;
    case "cancel": cancel(id); break;
    case "collected": collected(id); break;
    case "standby_accept": standbyAccept(id); break;
    case "standby_decline": standbyDecline(id); break;
    default: throw new AppError(400, "VALIDATION_ERROR", `Unknown action ${action}`);
  }
  return a.offer_id;
}
