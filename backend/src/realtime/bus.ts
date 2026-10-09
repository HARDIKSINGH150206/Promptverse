// In-process event bus. The DB layer emits raw change signals; the stream layer coalesces them
// into snapshots for SSE clients. Listeners run after the current synchronous transaction.
import { EventEmitter } from "node:events";
import type { IntakeGuardrail, TimelineEvent } from "../domain/types";

export interface CallDraftPayload {
  call_id: string;
  role: "restaurant" | "recipient";
  phase: string;
  draft: Record<string, unknown>;
  missing: string[];
  guardrail: IntakeGuardrail | null;
}

export interface BusEvents {
  timeline: [TimelineEvent];
  offer_changed: [string];
  board_changed: [];
  "call.started": [{ call_id: string; role: "restaurant" | "recipient"; language: string | null }];
  "call.caption": [{ call_id: string; speaker: "user" | "agent"; text: string; final: boolean }];
  "call.draft": [CallDraftPayload];
  "call.ended": [{ call_id: string; outcome: string; offer_id: string | null; demand_id: string | null }];
}

class Bus extends EventEmitter {
  emitBus<K extends keyof BusEvents>(name: K, ...args: BusEvents[K]): void {
    // never let a listener crash the code that changed state
    queueMicrotask(() => {
      try {
        this.emit(name, ...args);
      } catch (err) {
        console.warn("[bus] listener failed:", (err as Error).message);
      }
    });
  }
  onBus<K extends keyof BusEvents>(name: K, fn: (...args: BusEvents[K]) => void): () => void {
    this.on(name, fn as (...a: unknown[]) => void);
    return () => this.off(name, fn as (...a: unknown[]) => void);
  }
}

export const bus = new Bus();
bus.setMaxListeners(200);
