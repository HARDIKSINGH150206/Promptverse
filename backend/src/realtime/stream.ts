// GET /api/stream: Server-Sent Events. Everything the UI needs to render live, pushed as it happens.
//
//   event: hello      data: { board: Board }                     on connect
//   event: board      data: { board: Board }                     coalesced, at most every 250 ms
//   event: offer      data: { offer: OfferDetail }               coalesced per offer, at most every 150 ms
//   event: timeline   data: { event: TimelineEvent }             every new timeline event, immediately
//   event: call.started / call.caption / call.draft / call.ended  voice-agent calls in progress
//   ": ping" comment every 15 s keeps proxies from closing the connection
//
// Optional ?offer_id=o_x limits offer/timeline events to one offer (board events still flow).
import type { Request, Response } from "express";
import { board } from "../domain/board";
import { offerDetail } from "../domain/timeline";
import { bus } from "./bus";

interface Client {
  res: Response;
  offerId: string | null;
}
const clients = new Set<Client>();

function write(c: Client, event: string, data: unknown): void {
  try {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(c);
  }
}

function broadcast(event: string, data: unknown, offerId?: string): void {
  for (const c of clients) {
    if (offerId && c.offerId && c.offerId !== offerId) continue;
    write(c, event, data);
  }
}

// ---- coalescing: many DB writes per action -> one snapshot ----
let boardTimer: NodeJS.Timeout | null = null;
function scheduleBoard(): void {
  if (boardTimer || clients.size === 0) return;
  boardTimer = setTimeout(() => {
    boardTimer = null;
    try {
      broadcast("board", { board: board() });
    } catch (err) {
      console.warn("[stream] board snapshot failed:", (err as Error).message);
    }
  }, 250);
}

const offerTimers = new Map<string, NodeJS.Timeout>();
function scheduleOffer(offerId: string): void {
  if (clients.size === 0) return;
  if (!offerTimers.has(offerId)) {
    offerTimers.set(offerId, setTimeout(() => {
      offerTimers.delete(offerId);
      try {
        broadcast("offer", { offer: offerDetail(offerId) }, offerId);
      } catch {
        /* offer removed by a demo reset */
      }
    }, 150));
  }
  scheduleBoard();
}

bus.onBus("timeline", (e) => broadcast("timeline", { event: e }, e.offer_id));
bus.onBus("offer_changed", scheduleOffer);
bus.onBus("board_changed", scheduleBoard);
bus.onBus("call.started", (p) => broadcast("call.started", p));
bus.onBus("call.caption", (p) => broadcast("call.caption", p));
bus.onBus("call.draft", (p) => broadcast("call.draft", p));
bus.onBus("call.ended", (p) => broadcast("call.ended", p));

export function streamHandler(req: Request, res: Response): void {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const offerId = typeof req.query.offer_id === "string" ? req.query.offer_id : null;
  const c: Client = { res, offerId };
  clients.add(c);
  res.write("retry: 2000\n\n");
  write(c, "hello", { board: board() });
  if (offerId) {
    try {
      write(c, "offer", { offer: offerDetail(offerId) });
    } catch {
      /* unknown offer: board events still flow */
    }
  }
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      /* closed */
    }
  }, 15000);
  req.on("close", () => {
    clearInterval(ping);
    clients.delete(c);
  });
}

export function streamClientCount(): number {
  return clients.size;
}
