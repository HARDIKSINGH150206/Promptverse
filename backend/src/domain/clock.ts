// Single source of "now" so tests can pin time.
let offsetMs = 0;
let fixed: number | null = null;

export function nowMs(): number {
  return (fixed ?? Date.now()) + offsetMs;
}
export function nowIso(): string {
  return new Date(nowMs()).toISOString();
}
export function setNow(ms: number | null): void {
  fixed = ms;
  offsetMs = 0;
}
export function addSecs(iso: string | number, secs: number): string {
  const base = typeof iso === "number" ? iso : Date.parse(iso);
  return new Date(base + secs * 1000).toISOString();
}
export function minutesBetween(fromMs: number, toIso: string): number {
  return (Date.parse(toIso) - fromMs) / 60000;
}
