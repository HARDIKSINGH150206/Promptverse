"use client";

import { Timer } from "lucide-react";
import { useNow } from "@/lib/useNow";
import { fmtTime } from "@/lib/time";
import { cx } from "./ui";

function parts(msLeft: number): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  if (s < 120) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/**
 * Live countdown to `to` (ISO). Urgent (orange) under `urgentMins`.
 * `label` reads before the time: "Safe for 41 min", "Reply in 0:35".
 */
export function Countdown({
  to, label, size = "md", urgentMins = 10, doneText = "Time's up", showClock = false, className,
}: {
  to: string | null | undefined;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  urgentMins?: number;
  doneText?: string;
  showClock?: boolean;
  className?: string;
}) {
  const now = useNow();
  if (!to) return null;
  const target = Date.parse(to);
  const left = target - now;
  const ready = now > 0;
  const done = ready && left <= 0;
  const urgent = ready && !done && left < urgentMins * 60000;

  return (
    <span
      className={cx(
        "tabular inline-flex items-baseline gap-1.5 font-semibold",
        size === "sm" && "text-sm",
        size === "md" && "text-base",
        size === "lg" && "text-2xl",
        size === "xl" && "text-4xl font-extrabold sm:text-5xl",
        className,
      )}
      aria-live="off"
    >
      {size !== "xl" ? (
        <Timer className={cx("relative top-0.5 shrink-0 self-start", size === "lg" ? "size-5" : "size-4", urgent || done ? "text-orange" : "text-blue")} aria-hidden />
      ) : null}
      {label && !done ? <span className="font-medium text-navy/65">{label}</span> : null}
      <span className={cx(urgent && "rounded-md bg-orange px-1.5 text-navy", done && "text-navy/60")}>
        {!ready ? "—" : done ? doneText : parts(left)}
      </span>
      {showClock ? <span className="text-sm font-medium text-navy/55">until {fmtTime(to)}</span> : null}
    </span>
  );
}
