import { Router } from "express";
import fs from "node:fs";
import { z } from "zod";
import { intakeGuardrail } from "../ai/guardrail";
import { parseOffer } from "../ai/parse";
import { getRestaurant } from "../db/repo";
import { createOffer, CreateOfferBody } from "../domain/intake";
import { nowIso, nowMs } from "../domain/clock";
import { fmtTime } from "../domain/format";
import { newId } from "../domain/ids";
import { runMatching } from "../domain/matching";
import { offerDetail } from "../domain/timeline";
import { AppError, type IntakeGuardrail, type OfferRow, type ParsedOffer } from "../domain/types";
import { field, isoString, upload, validate } from "./http";

export const offers = Router();

// guardrail from the last parse of each transcript, so creation doesn't need a second Laya call
const recentGuardrails = new Map<string, IntakeGuardrail>();

offers.post("/api/offers/parse", upload.single("photo"), async (req, res) => {
  const transcript = field(req, "transcript")?.trim();
  if (!transcript) throw new AppError(400, "VALIDATION_ERROR", "transcript is required");
  const restaurantId = field(req, "restaurant_id");
  if (restaurantId && !getRestaurant(restaurantId)) throw new AppError(404, "NOT_FOUND", `Restaurant ${restaurantId} not found`);

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const image = req.file
    ? { mimeType: req.file.mimetype, base64: fs.readFileSync(req.file.path).toString("base64") }
    : undefined;

  const { source: _src, ...p } = await parseOffer(transcript, image);
  const guardrail = await intakeGuardrail(transcript, p.items, p.diet);
  recentGuardrails.set(transcript, guardrail);
  if (recentGuardrails.size > 200) recentGuardrails.delete(recentGuardrails.keys().next().value!);

  const parsed: ParsedOffer = { ...p, guardrail };
  res.json({ parsed, photo_url: photoUrl });
});

offers.post("/api/offers", async (req, res) => {
  const body = validate(CreateOfferBody, req.body);
  let guardrail = body.raw_transcript ? recentGuardrails.get(body.raw_transcript) : undefined;
  // only spend a model call once the cheap checks pass
  if (!guardrail && body.raw_transcript && body.confirmations?.diet_confirmed && body.confirmations?.safety_checklist_confirmed) {
    guardrail = await intakeGuardrail(body.raw_transcript, body.items, body.diet);
  }
  const id = createOffer(body, guardrail ?? null, "web");
  res.status(201).json(offerDetail(id));
});

offers.get("/api/offers/:id", (req, res) => {
  res.json(offerDetail(req.params.id));
});
