import type { ErrorRequestHandler, Request } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../domain/types";

export const UPLOAD_DIR = path.resolve("uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/heic": ".heic",
};

export const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}${IMAGE_EXT[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_EXT[file.mimetype]) cb(null, true);
    else cb(new AppError(400, "VALIDATION_ERROR", "photo must be a JPEG, PNG, WebP, GIF or HEIC image"));
  },
});

export function validate<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new AppError(400, "VALIDATION_ERROR", msg);
  }
  return r.data;
}

export function field(req: Request, name: string): string | undefined {
  const v = (req.body ?? {})[name];
  return typeof v === "string" ? v : undefined;
}

export const isoString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON" } });
    return;
  }
  console.error("[http] unhandled:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: err?.message ?? "Something went wrong" } });
};
