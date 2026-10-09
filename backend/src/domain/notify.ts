// Pluggable outbound notifications (Telegram). The engine calls notify(); the bot registers a sink.
// Delivery is deferred to a microtask so it runs after the current synchronous DB transaction.

export type NotifyKind = "offer" | "reconfirm" | "standby" | "promoted" | "released" | "info";

export interface Notice {
  kind: NotifyKind;
  assignmentId: string;
  text?: string;
}

type Sink = (n: Notice) => Promise<void> | void;
let sink: Sink | null = null;

export function setNotifySink(s: Sink | null): void {
  sink = s;
}

export function notify(n: Notice): void {
  if (!sink) return;
  const s = sink;
  queueMicrotask(() => {
    Promise.resolve(s(n)).catch((err) => console.warn("[notify] failed:", err?.message ?? err));
  });
}
