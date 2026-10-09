import { Router } from "express";
import { z } from "zod";
import { parseDemand } from "../ai/parse";
import { getRecipient, insertDemand, listOfferRowsByStatus, toDemand } from "../db/repo";
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

const CreateDemandBody = z.object({
  recipient_id: z.string().min(1),
  people_count: z.number().int().min(1),
  diet: z.enum(["veg", "nonveg", "any"]),
  needed_by: isoString,
  max_distance_km: z.number().positive().max(50),
  notes: z.string().nullable().default(null),
  raw_transcript: z.string().nullable().default(null),
});

demands.post("/api/demands", (req, res) => {
  const body = validate(CreateDemandBody, req.body);
  if (!getRecipient(body.recipient_id)) throw new AppError(404, "NOT_FOUND", `Recipient ${body.recipient_id} not found`);
  if (Date.parse(body.needed_by) <= nowMs()) throw new AppError(400, "VALIDATION_ERROR", "needed_by is in the past");
  const row = insertDemand({ ...body, needed_by: new Date(body.needed_by).toISOString() });
  for (const o of listOfferRowsByStatus("open", "matching")) runMatching(o.id);
  res.status(201).json(toDemand(row));
});
