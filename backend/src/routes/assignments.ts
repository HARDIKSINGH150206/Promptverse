import { Router } from "express";
import { z } from "zod";
import { getAssignmentRow, getOfferRow, getRecipient, listAssignmentsForRecipient, toAssignment, toOffer } from "../db/repo";
import { boardReferenceRestaurant, toRecipient } from "../domain/board";
import { offerDetail } from "../domain/timeline";
import { applyAction } from "../domain/transitions";
import { AppError, type AssignmentAction } from "../domain/types";
import { handleReply } from "../replyFlow";
import { validate } from "./http";

export const assignments = Router();

const ACTIONS: AssignmentAction[] = ["accept", "decline", "reconfirm", "cancel", "collected", "standby_accept", "standby_decline"];

assignments.post("/api/assignments/:id/reply", async (req, res) => {
  const { text } = validate(z.object({ text: z.string().trim().min(1).max(1000) }), req.body);
  if (!getAssignmentRow(req.params.id)) throw new AppError(404, "NOT_FOUND", `Assignment ${req.params.id} not found`);
  res.json(await handleReply(req.params.id, text));
});

assignments.post("/api/assignments/:id/:action", (req, res) => {
  const action = req.params.action as AssignmentAction;
  if (!ACTIONS.includes(action)) throw new AppError(404, "NOT_FOUND", `Unknown action ${req.params.action}`);
  const offerId = applyAction(req.params.id, action);
  res.json(offerDetail(offerId));
});

const INBOX = ["offered", "accepted", "reconfirm_sent", "confirmed", "standby_requested", "on_standby"] as const;

assignments.get("/api/collector/:recipientId/inbox", (req, res) => {
  const r = getRecipient(req.params.recipientId);
  if (!r) throw new AppError(404, "NOT_FOUND", `Recipient ${req.params.recipientId} not found`);
  const rows = listAssignmentsForRecipient(r.id, [...INBOX]);
  res.json({
    recipient: toRecipient(r, boardReferenceRestaurant()),
    assignments: rows.map((a) => ({ ...toAssignment(a), offer: toOffer(getOfferRow(a.offer_id)!) })),
  });
});
