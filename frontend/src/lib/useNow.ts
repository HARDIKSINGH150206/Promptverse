"use client";

import { useSyncExternalStore } from "react";
import { serverNow } from "./time";

// One shared 1-second clock for every countdown on the page.
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (!timer) {
    now = serverNow();
    timer = setInterval(() => {
      now = serverNow();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): number {
  if (!now) now = serverNow();
  return now;
}

/** Current time (backend clock in live mode), or 0 during server rendering. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
