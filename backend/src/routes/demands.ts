import { Router } from "express";
import { z } from "zod";
import { parseDemand } from "../ai/parse";
import { getRecipient, toDemand } from "../db/repo";
import { createDemand, CreateDemandBody } from "../domain/intake";
import { nowMs } from "../domain/clock";
import { runMatching } from "../domain/matching";
import { AppError } from "../domain/types";
import { field, isoString, upload, validate } from "./http";

export const demands = Router();

demands.post("/api/demands/parse", upload.none(), async (req, res) => {
  const transcript = field(req, "transcript")?.trim();
  if (!transcript) throw new AppError(400, "VALIDATION_ERROR", "transcript is required");
  const recipientId = field(req, "recipient_id");
  if (recipientId && !getRecipient(recipientId)) throw new AppError(404, "NOT_FOUND", `Recipient ${recipientId} not found`);
  const { source: _src, ...parsed } = await parseDemand(transcript);
  res.json({ parsed });
});

demands.post("/api/demands", (req, res) => {
  const body = validate(CreateDemandBody, req.body);
  res.status(201).json(toDemand(createDemand(body)));
});
