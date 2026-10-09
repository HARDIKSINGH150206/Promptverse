import { config } from "./config";
import {
  addEvent, adjustDemandMatched, getOfferRow, getRecipient, listAssignmentRows, listAssignmentsByStatus,
  listOfferRowsByStatus, updateAssignment, updateOffer,
} from "./db/repo";
import { tx } from "./db/db";
import { nowMs } from "./domain/clock";
import { applyFallback } from "./domain/fallback";
import { runMatching } from "./domain/matching";
import { PRIMARY_OPEN, refreshOffer, remainingMeals, releaseStandby, STANDBY_LIVE } from "./domain/offerState";
import { runRisk } from "./domain/risk";
import { sendReconfirm, timeoutOffer, timeoutReconfirm, timeoutStandby } from "./domain/transitions";

const past = (iso: string | null) => !!iso && Date.parse(iso) <= nowMs();

function step(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`[scheduler] ${name} failed:`, (err as Error).message);
  }
}

export function tick(): void {
  // 1. offer timeouts
  step("offer timeouts", () => {
    for (const a of listAssignmentsByStatus("offered")) if (past(a.respond_by)) timeoutOffer(a.id);
  });
  // 2. accepted long enough -> ask to reconfirm
  step("reconfirm send", () => {
    for (const a of listAssignmentsByStatus("accepted")) {
      if (a.accepted_at && Date.parse(a.accepted_at) + config.RECONFIRM_AFTER_SECS * 1000 <= nowMs()) sendReconfirm(a.id);
    }
  });
  // 3. reconfirm timeouts
  step("reconfirm timeouts", () => {
    for (const a of listAssignmentsByStatus("reconfirm_sent")) if (past(a.reconfirm_by)) timeoutReconfirm(a.id);
  });
  // 4. standby timeouts
  step("standby timeouts", () => {
    for (const a of listAssignmentsByStatus("standby_requested")) if (past(a.respond_by)) timeoutStandby(a.id);
  });
  // 5. risk for all active primaries
  step("risk", () => {
    for (const o of listOfferRowsByStatus("matching", "assigned")) runRisk(o.id);
  });
  // 6. keep matching offers that still have unassigned meals
  step("matching", () => {
    for (const o of listOfferRowsByStatus("open", "matching")) runMatching(o.id);
  });
  // 7. past safe_until -> fallback / expired
  step("expiry", () => {
    for (const o of listOfferRowsByStatus("open", "matching", "assigned")) {
      if (!past(o.safe_until)) continue;
      expireOffer(o.id);
    }
  });
}

function expireOffer(offerId: string): void {
  tx(() => {
    const remaining = remainingMeals(offerId);
    const rows = listAssignmentRows(offerId);
    for (const a of rows) {
      if (PRIMARY_OPEN.includes(a.status)) {
        updateAssignment(a.id, { status: "no_response" });
        adjustDemandMatched(a.demand_id, -a.meals);
        addEvent(offerId, "expired", `${getRecipient(a.recipient_id)?.name ?? "Recipient"} didn't collect before the safe window closed.`, a.id);
      } else if (STANDBY_LIVE.includes(a.status)) {
        releaseStandby(a, `${getRecipient(a.recipient_id)?.name ?? "Backup"} released — safe window closed.`);
      }
    }
    const o = getOfferRow(offerId)!;
    const uncollected = o.meal_count - o.meals_collected;
    if (remaining > 0 || uncollected > 0) {
      if (!o.fallback_route) applyFallback(o, uncollected);
    }
    refreshOffer(offerId);
    const after = getOfferRow(offerId)!;
    if (after.status === "matching" || after.status === "assigned" || after.status === "open") {
      updateOffer(offerId, { status: after.meals_collected > 0 ? "partially_collected" : "expired" });
      addEvent(offerId, "expired", "Safe window closed.");
    }
  });
}

let timer: NodeJS.Timeout | null = null;
export function startScheduler(intervalMs = 2000): void {
  if (timer) return;
  timer = setInterval(tick, intervalMs);
}
export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
