"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { api } from "@/lib/api/client";
import type { Health } from "@/lib/api/types";
import { usePoll } from "@/lib/usePoll";
import { cx } from "./ui";

// ---------- backend health (AI status pill, server speech-to-text availability) ----------

interface HealthState { health: Health | null; error: unknown }
const HealthContext = createContext<HealthState>({ health: null, error: null });

export function useHealth(): HealthState {
  return useContext(HealthContext);
}

// ---------- toasts ----------

type ToastTone = "success" | "info" | "error";
interface ToastItem { id: number; tone: ToastTone; message: ReactNode }
type ToastFn = (message: ReactNode, tone?: ToastTone) => void;
const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const poll = usePoll(() => api.health(), 15000);
  const health = useMemo(() => ({ health: poll.data, error: poll.error }), [poll.data, poll.error]);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback<ToastFn>((message, tone = "info") => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, tone, message }]);
    setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4500);
  }, [dismiss]);

  return (
    <HealthContext.Provider value={health}>
      <ToastContext.Provider value={toast}>
        {children}
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
          {toasts.map((t) => {
            const Icon = t.tone === "success" ? CircleCheck : t.tone === "error" ? TriangleAlert : Info;
            return (
              <div
                key={t.id}
                role={t.tone === "error" ? "alert" : "status"}
                className={cx(
                  "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-[15px] animate-enter",
                  t.tone === "error" ? "border-2 border-orange bg-white text-navy" : "bg-navy text-white",
                )}
              >
                <Icon className={cx("mt-0.5 size-5 shrink-0", t.tone === "error" ? "text-orange" : t.tone === "success" ? "text-orange" : "text-white/80")} aria-hidden />
                <div className="min-w-0 flex-1">{t.message}</div>
                <button type="button" onClick={() => dismiss(t.id)} className="rounded-lg p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss">
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      </ToastContext.Provider>
    </HealthContext.Provider>
  );
}
