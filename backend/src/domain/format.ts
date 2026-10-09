import { config } from "../config";

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: config.TZ_NAME, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso)).toLowerCase().replace(/\s+/g, " ");
}

export function fmtDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
