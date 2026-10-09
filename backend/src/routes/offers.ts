import { Router } from "express";
import fs from "node:fs";
import { z } from "zod";
import { intakeGuardrail } from "../ai/guardrail";
import { parseOffer } from "../ai/parse";
import { addEvent, getRestaurant, insertOffer } from "../db/repo";
import { nowIso, nowMs } from "../domain/clock";
import { fmtTime, pct } from "../domain/format";
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

const CreateOfferBody = z.object({
  restaurant_id: z.string().min(1),
  items: z.array(z.object({ name: z.string().min(1), quantity: z.number().nonnegative(), unit: z.string() })),
  meal_count: z.number().int(),
  diet: z.enum(["veg", "nonveg"]),
  cooked_at: isoString,
  safe_until: isoString,
  photo_url: z.string().nullable().default(null),
  raw_transcript: z.string().nullable().default(null),
  pickup_notes: z.string().nullable().default(null),
  confirmations: z.object({ diet_confirmed: z.boolean(), safety_checklist_confirmed: z.boolean() }).optional(),
});

offers.post("/api/offers", async (req, res) => {
  const body = validate(CreateOfferBody, req.body);
  if (body.confirmations?.diet_confirmed !== true || body.confirmations?.safety_checklist_confirmed !== true) {
    throw new AppError(400, "CONFIRMATION_REQUIRED", "Both diet_confirmed and safety_checklist_confirmed must be true");
  }
  if (body.meal_count < 1) throw new AppError(400, "VALIDATION_ERROR", "meal_count must be at least 1");
  const safe = Date.parse(body.safe_until);
  if (safe <= nowMs()) throw new AppError(400, "VALIDATION_ERROR", "safe_until is in the past");
  if (safe <= Date.parse(body.cooked_at)) throw new AppError(400, "VALIDATION_ERROR", "safe_until must be after cooked_at");
  const restaurant = getRestaurant(body.restaurant_id);
  if (!restaurant) throw new AppError(404, "NOT_FOUND", `Restaurant ${body.restaurant_id} not found`);

  let guardrail = body.raw_transcript ? recentGuardrails.get(body.raw_transcript) : undefined;
  if (!guardrail && body.raw_transcript) guardrail = await intakeGuardrail(body.raw_transcript, body.items, body.diet);

  const row: OfferRow = {
    id: newId("o"), restaurant_id: body.restaurant_id, items_json: JSON.stringify(body.items),
    meal_count: body.meal_count, meals_assigned: 0, meals_collected: 0, diet: body.diet,
    cooked_at: new Date(body.cooked_at).toISOString(), safe_until: new Date(safe).toISOString(),
    photo_url: body.photo_url, raw_transcript: body.raw_transcript, pickup_notes: body.pickup_notes,
    status: "open", fallback_route: null, created_at: nowIso(),
  };
  insertOffer(row);
  const what = body.items.map((i) => i.name).join(", ") || "food";
  addEvent(row.id, "offer_created",
    `${restaurant.name} listed ${body.meal_count} ${body.diet === "veg" ? "veg" : "non-veg"} meals (${what}), safe until ${fmtTime(row.safe_until)}. Diet and safety checklist confirmed.`);
  if (guardrail?.safety_concern_probability != null && guardrail.safety_concern_probability > 0.3) {
    addEvent(row.id, "guardrail_flag",
      `Safety check (${guardrail.source}) flagged a possible concern (${pct(guardrail.safety_concern_probability)}); the restaurant confirmed the safety checklist.`);
  }
  addEvent(row.id, "matching_started", "Matching started: only recipients who already need this food, ranked by reliability.");
  runMatching(row.id);
  res.status(201).json(offerDetail(row.id));
});

offers.get("/api/offers/:id", (req, res) => {
  res.json(offerDetail(req.params.id));
});
