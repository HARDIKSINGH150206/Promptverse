import { Router } from "express";
import multer from "multer";
import { transcribe, SttUnavailable } from "../ai/stt";
import { AppError } from "../domain/types";
import { field } from "./http";

export const transcribeRouter = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/webm" || file.mimetype === "video/mp4") cb(null, true);
    else cb(new AppError(400, "VALIDATION_ERROR", "audio must be an audio file (webm, ogg, wav, mp3, m4a...)"));
  },
});

// multipart/form-data: audio (required), language_code (optional, default "unknown" = auto-detect), mode (optional)
transcribeRouter.post("/api/transcribe", audioUpload.single("audio"), async (req, res) => {
  if (!req.file) throw new AppError(400, "VALIDATION_ERROR", "audio file is required (field name: audio)");
  try {
    const mime = req.file.mimetype.split(";")[0];
    const out = await transcribe(req.file.buffer, mime, req.file.originalname || "voice.webm", {
      language_code: field(req, "language_code"),
      mode: field(req, "mode"),
    });
    res.json(out);
  } catch (err) {
    if (err instanceof SttUnavailable) throw new AppError(503, "STT_UNAVAILABLE", err.message);
    throw err;
  }
});
