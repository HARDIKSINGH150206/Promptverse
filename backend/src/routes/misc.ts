// health, directory, board, impact, demo controls
import { Router } from "express";
import { config } from "../config";
import { layaStatus, llmStatus } from "../ai/status";
import { sttStatus } from "../ai/stt";
import { getAssignmentRow, getRestaurant, listOfferRows, listRestaurants, updateAssignment } from "../db/repo";
import { seed } from "../db/seed";
import { board, computeStats, listRecipients } from "../domain/board";
import { addSecs, nowIso } from "../domain/clock";
import { offerDetail } from "../domain/timeline";
import { AppError, type ImpactCard } from "../domain/types";
import { tick } from "../scheduler";
import { telegramStatus } from "../telegram/bot";

export const misc = Router();

misc.get("/api/health", (_req, res) => {
  res.json({ ok: true, llm: llmStatus(), laya: layaStatus(), telegram: telegramStatus(), stt: sttStatus() });
});

misc.get("/api/restaurants", (_req, res) => {
  res.json(listRestaurants());
});

misc.get("/api/recipients", (_req, res) => {
  res.json(listRecipients());
});

misc.get("/api/board", (_req, res) => {
  res.json(board());
});

misc.get("/api/impact/:restaurantId", (req, res) => {
  const r = getRestaurant(req.params.restaurantId);
  if (!r) throw new AppError(404, "NOT_FOUND", `Restaurant ${req.params.restaurantId} not found`);
  const offers = listOfferRows().filter((o) => o.restaurant_id === r.id);
  const s = computeStats(offers);
  const card: ImpactCard = {
    restaurant_id: r.id, restaurant_name: r.name, period_label: "Since setup (includes simulated history)",
    meals_rescued: s.meals_rescued, offers_made: offers.length,
    share_collected_within_window: s.share_collected_within_window, fallback_count: s.fallback_count,
    is_simulated: true,
  };
  res.json(card);
});

// ---- Demo controls (labelled "Demo control" in the UI) ----

misc.post("/api/demo/reset", (_req, res) => {
  seed({ keepTelegramLinks: true });
  res.json({ ok: true });
});

misc.post("/api/demo/fast-forward/:assignmentId", (req, res) => {
  const a = getAssignmentRow(req.params.assignmentId);
  if (!a) throw new AppError(404, "NOT_FOUND", `Assignment ${req.params.assignmentId} not found`);
  const now = nowIso();
  switch (a.status) {
    case "offered":
    case "standby_requested":
      updateAssignment(a.id, { respond_by: now });
      break;
    case "reconfirm_sent":
      updateAssignment(a.id, { reconfirm_by: now });
      break;
    case "accepted":
      // bring the reconfirm request forward
      updateAssignment(a.id, { accepted_at: addSecs(now, -config.RECONFIRM_AFTER_SECS) });
      break;
    default:
      throw new AppError(409, "INVALID_TRANSITION", `Assignment is ${a.status}; nothing to fast-forward`);
  }
  tick();
  res.json(offerDetail(a.offer_id));
});
