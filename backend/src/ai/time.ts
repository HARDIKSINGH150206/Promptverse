// Turning spoken clock times ("made at 7", "safe till 10:30") into ISO UTC, in the configured timezone.
import { config } from "../config";

function offsetMinutes(ms: number): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: config.TZ_NAME, timeZoneName: "shortOffset" })
    .formatToParts(new Date(ms))
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = s.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -v : v;
}

/** Local wall-clock date (y, m, d) for an instant. */
function localDate(ms: number): { y: number; m: number; d: number } {
  const t = new Date(ms + offsetMinutes(ms) * 60000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

export function localToMs(dayOffset: number, hour: number, minute: number, refMs: number): number {
  const { y, m, d } = localDate(refMs);
  const guess = Date.UTC(y, m, d + dayOffset, hour, minute);
  return guess - offsetMinutes(guess) * 60000;
}

export function localNowLabel(ms: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: config.TZ_NAME, dateStyle: "full", timeStyle: "short",
  }).format(new Date(ms));
}

export interface SpokenTime { hour: number; minute: number; meridiem: "am" | "pm" | null }

export function parseSpokenTime(s: string): SpokenTime | null {
  const m = s.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  if (hour > 23 || minute > 59) return null;
  const mer = m[3] ? (m[3].toLowerCase().startsWith("a") ? "am" : "pm") : null;
  return { hour, minute, meridiem: mer };
}

function candidates(t: SpokenTime): number[] {
  if (t.meridiem === "am") return [t.hour % 12];
  if (t.meridiem === "pm") return [(t.hour % 12) + 12];
  if (t.hour > 12 || t.hour === 0) return [t.hour];
  return [t.hour % 12, (t.hour % 12) + 12];
}

/** Most recent occurrence at or before ref (+15 min grace). For "made at 7". */
export function resolvePast(t: SpokenTime, refMs: number): string {
  const opts: number[] = [];
  for (const day of [0, -1]) for (const h of candidates(t)) opts.push(localToMs(day, h, t.minute, refMs));
  const ok = opts.filter((x) => x <= refMs + 15 * 60000).sort((a, b) => b - a);
  return new Date(ok[0] ?? opts[0]).toISOString();
}

/** Next occurrence after ref. For "safe till 10", "by 9:45". */
export function resolveFuture(t: SpokenTime, refMs: number): string {
  const opts: number[] = [];
  for (const day of [0, 1]) for (const h of candidates(t)) opts.push(localToMs(day, h, t.minute, refMs));
  const ok = opts.filter((x) => x > refMs).sort((a, b) => a - b);
  return new Date(ok[0] ?? opts[opts.length - 1]).toISOString();
}
