"use client";

// One shared EventSource to the backend's GET /api/stream (contract v3). Pages subscribe to named
// events; polling stays as the fallback and slows down while the stream is connected.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { isLive } from "./api/client";
import { API_BASE_URL } from "./api/live";

export type StreamStatus = "off" | "connecting" | "live";
type Handler = (data: unknown) => void;

const EVENTS = ["hello", "board", "offer", "timeline", "call.started", "call.caption", "call.draft", "call.ended"] as const;
export type StreamEvent = (typeof EVENTS)[number];

let source: EventSource | null = null;
let status: StreamStatus = "off";
let refs = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const handlers = new Map<string, Set<Handler>>();
const statusListeners = new Set<() => void>();

function setStatus(s: StreamStatus) {
  if (s === status) return;
  status = s;
  statusListeners.forEach((l) => l());
}

function open() {
  if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;
  setStatus("connecting");
  const es = new EventSource(`${API_BASE_URL}/api/stream`);
  source = es;
  es.onopen = () => setStatus("live");
  es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "off" : "connecting"); // the browser retries
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      let data: unknown;
      try {
        data = JSON.parse((e as MessageEvent<string>).data);
      } catch {
        return;
      }
      if (status !== "live") setStatus("live");
      handlers.get(name)?.forEach((h) => h(data));
    });
  }
}

function acquire() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  refs += 1;
  open();
}

function release() {
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  // keep it open across quick page transitions
  closeTimer = setTimeout(() => {
    source?.close();
    source = null;
    setStatus("off");
  }, 5000);
}

/** Subscribe to one stream event while mounted. No-op when the board group isn't live (mock mode). */
export function useStreamEvent<T = unknown>(name: StreamEvent, handler: (data: T) => void, enabled = true): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled || !isLive("board")) return;
    const h: Handler = (d) => ref.current(d as T);
    let set = handlers.get(name);
    if (!set) handlers.set(name, (set = new Set()));
    set.add(h);
    acquire();
    return () => {
      set!.delete(h);
      release();
    };
  }, [name, enabled]);
}

/** "live" while the stream is connected; pages use it to slow their fallback polling. */
export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => "off",
  );
}
