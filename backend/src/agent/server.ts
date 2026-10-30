// ws://<backend>/api/agent/call?role=restaurant|recipient&restaurant_id=&recipient_id=&language_code=auto
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "../config";
import { CallSession } from "./session";

export const agentWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

let active = 0; // each call holds a Sarvam stream and spends LLM/TTS credits, so cap them

agentWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  if (active >= config.AGENT_MAX_CALLS) {
    ws.send(JSON.stringify({ type: "error", code: "BUSY", message: "All lines are busy right now. Please try again in a minute." }));
    ws.close(1013, "busy");
    return;
  }
  active += 1;
  ws.once("close", () => {
    active -= 1;
  });
  const url = new URL(req.url ?? "/", "http://localhost");
  const role = url.searchParams.get("role") === "recipient" ? "recipient" : "restaurant";
  const session = new CallSession(ws, role, {
    restaurant_id: url.searchParams.get("restaurant_id") ?? undefined,
    recipient_id: url.searchParams.get("recipient_id") ?? undefined,
    language_code: url.searchParams.get("language_code") ?? undefined,
  });
  session.start();
});
