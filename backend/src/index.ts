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
import { streamWss } from "./ai/sttStream";

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

  const server = createApp().listen(config.PORT, () => {
    console.log(`AnnaRelay backend on http://localhost:${config.PORT}  (llm: ${llmStatus()}, laya: ${layaStatus()})`);
  });
  // live speech-to-text WebSocket (Sarvam realtime relay)
  server.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    // CORS doesn't cover WebSockets: only our frontend origins (or non-browser clients) may use the Sarvam key
    const origin = req.headers.origin;
    const allowed = config.FRONTEND_ORIGIN.split(",").map((s) => s.trim());
    if (path !== "/api/transcribe/stream" || (origin && !allowed.includes("*") && !allowed.includes(origin))) {
      socket.destroy();
      return;
    }
    streamWss.handleUpgrade(req, socket, head, (ws) => streamWss.emit("connection", ws, req));
  });
  startScheduler();
  void startBot();
}
