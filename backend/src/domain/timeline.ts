import { config } from "../config";
import { getOfferRow, listAssignmentRows, listEvents, toAssignment, toOffer } from "../db/repo";
import { minutesBetween, nowMs } from "./clock";
import { PRIMARY_ACTIVE, STANDBY_LIVE } from "./offerState";
import { AppError, type OfferDetail } from "./types";

export function offerDetail(offerId: string): OfferDetail {
  const o = getOfferRow(offerId);
  if (!o) throw new AppError(404, "NOT_FOUND", `Offer ${offerId} not found`);
  const rows = listAssignmentRows(offerId);
  const active = rows.filter((a) => PRIMARY_ACTIVE.includes(a.status));
  return {
    ...toOffer(o),
    assignments: rows.map(toAssignment),
    timeline: listEvents(offerId),
    minutes_left: Math.max(0, Math.floor(minutesBetween(nowMs(), o.safe_until))),
    risk: {
      highest_p_fail: active.reduce((m, a) => Math.max(m, a.p_fail ?? 0), 0),
      threshold: config.RISK_THRESHOLD,
      standby_active: rows.some((a) => STANDBY_LIVE.includes(a.status)),
    },
  };
}
