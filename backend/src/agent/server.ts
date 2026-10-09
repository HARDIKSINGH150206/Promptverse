// ws://<backend>/api/agent/call?role=restaurant|recipient&restaurant_id=&recipient_id=&language_code=auto
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CallSession } from "./session";

export const agentWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

agentWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const role = url.searchParams.get("role") === "recipient" ? "recipient" : "restaurant";
  const session = new CallSession(ws, role, {
    restaurant_id: url.searchParams.get("restaurant_id") ?? undefined,
    recipient_id: url.searchParams.get("recipient_id") ?? undefined,
    language_code: url.searchParams.get("language_code") ?? undefined,
  });
  session.start();
});
