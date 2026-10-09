// All times arrive as ISO UTC and are shown in IST (Asia/Kolkata, UTC+5:30, no DST).

export const IST_OFFSET_MIN = 330;

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
});
const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata", day: "numeric", month: "short",
});

/** "9:40 pm" */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return timeFmt.format(d).toLowerCase().replace(/\s+/g, " ");
}

/** "9:40 pm" today, "9:40 pm, 8 Oct" otherwise. */
export function fmtTimeDay(iso: string | null | undefined, nowMs?: number): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ref = nowMs ?? d.getTime();
  const sameDay = dayFmt.format(d) === dayFmt.format(new Date(ref));
  return sameDay ? fmtTime(iso) : `${fmtTime(iso)}, ${dayFmt.format(d)}`;
}

/** "41 min", "1 h 5 min" */
export function fmtDuration(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Whole percent; no fake precision. */
export function pct(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${Math.round(x * 100)}%`;
}

/** Epoch ms for an IST wall-clock time, `dayOffset` days from the IST date of `refMs`. */
export function istToMs(dayOffset: number, hour: number, minute: number, refMs: number): number {
  const local = new Date(refMs + IST_OFFSET_MIN * 60000);
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour, minute);
  return guess - IST_OFFSET_MIN * 60000;
}

/** ISO UTC -> "YYYY-MM-DDTHH:mm" in IST, for <input type="datetime-local">. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + IST_OFFSET_MIN * 60000).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" in IST -> ISO UTC (or null when blank/invalid). */
export function istInputToIso(value: string): string | null {
  if (!value) return null;
  const t = Date.parse(`${value}:00Z`);
  if (Number.isNaN(t)) return null;
  return new Date(t - IST_OFFSET_MIN * 60000).toISOString();
}

// ---- server clock skew (live mode): countdowns use the backend's clock ----

let skewMs = 0;

export function setServerTime(serverIso: string): void {
  const t = Date.parse(serverIso);
  if (!Number.isNaN(t)) skewMs = t - Date.now();
}

export function serverNow(): number {
  return Date.now() + skewMs;
}
