import cors from "cors";
import express from "express";
import { config } from "./config";
import { db } from "./db/db";
import { seed } from "./db/seed";
import { layaStatus, llmStatus } from "./ai/status";
import { assignments } from "./routes/assignments";
import { demands } from "./routes/demands";
import { errorHandler, UPLOAD_DIR } from "./routes/http";
import { misc } from "./routes/misc";
import { offers } from "./routes/offers";
import { transcribeRouter } from "./routes/transcribe";
import { startScheduler } from "./scheduler";
import { startBot } from "./telegram/bot";

export function createApp() {
  const app = express();
  const origins = config.FRONTEND_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: origins.includes("*") ? true : origins, methods: ["GET", "POST", "OPTIONS"], allowedHeaders: ["Content-Type"] }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads", express.static(UPLOAD_DIR));
  app.use(misc);
  app.use(offers);
  app.use(demands);
  app.use(assignments);
  app.use(transcribeRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "No such endpoint" } });
  });
  app.use(errorHandler);
  return app;
}

if (!process.env.VITEST) {
  const empty = (db.prepare("SELECT COUNT(*) AS n FROM recipients").get() as { n: number }).n === 0;
  if (empty) seed();

  createApp().listen(config.PORT, () => {
    console.log(`AnnaRelay backend on http://localhost:${config.PORT}  (llm: ${llmStatus()}, laya: ${layaStatus()})`);
  });
  startScheduler();
  void startBot();
}
