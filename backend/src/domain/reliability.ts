import { interval90, makeRng, posteriorMean } from "./bayes";
import type { RecipientRow, ReliabilityScore } from "./types";

export const W_P = 0.6;
export const W_PROX = 0.25;
export const W_RESP = 0.15;

export function failures(r: Pick<RecipientRow, "cancelled" | "no_show">): number {
  return r.cancelled + r.no_show;
}

export function pComplete(r: Pick<RecipientRow, "completed" | "cancelled" | "no_show">): number {
  return posteriorMean(r.completed, failures(r));
}

// Intervals use their own seeded RNG per (completed, failures) so they're stable and
// never consume draws from the matching RNG. Recomputed only when stats change.
const intervalCache = new Map<string, [number, number]>();
export function cachedInterval(completed: number, fails: number): [number, number] {
  const key = `${completed}/${fails}`;
  let iv = intervalCache.get(key);
  if (!iv) {
    iv = interval90(completed, fails, makeRng(completed * 7919 + fails * 104729 + 1));
    intervalCache.set(key, iv);
  }
  return iv;
}

export function proximity(distanceKm: number, maxDistanceKm: number): number {
  if (maxDistanceKm <= 0) return 0;
  return Math.max(0, 1 - distanceKm / maxDistanceKm);
}

export function responsiveness(avgResponseSecs: number): number {
  return Math.min(1, Math.max(0, 1 - avgResponseSecs / 600));
}

export function rankScore(p: number, prox: number, resp: number): number {
  return W_P * p + W_PROX * prox + W_RESP * resp;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function replyPhrase(secs: number): string {
  if (secs < 90) return `replies in ~${Math.max(1, Math.round(secs))} s`;
  return `replies in ~${Math.round(secs / 60)} min`;
}

export function historyPhrase(r: Pick<RecipientRow, "completed" | "cancelled" | "no_show">): string {
  const obs = r.completed + failures(r);
  if (obs === 0) return "no pickups yet";
  return `${r.completed} of ${obs} past pickups completed`;
}

export function reliabilityScore(r: RecipientRow, distanceKm: number | null, maxDistanceKm = 5): ReliabilityScore {
  const fails = failures(r);
  const obs = r.completed + fails;
  const p = posteriorMean(r.completed, fails);
  const iv = cachedInterval(r.completed, fails);
  const prox = distanceKm === null ? 0.5 : proximity(distanceKm, maxDistanceKm);
  const resp = responsiveness(r.avg_response_secs);
  const total = rankScore(p, prox, resp);

  const head =
    obs === 0
      ? `No pickups yet (${pct(p)}, could be anywhere from ${pct(iv[0])} to ${pct(iv[1])})`
      : `${r.completed} of ${obs} pickups completed (${pct(p)}, likely ${Math.round(iv[0] * 100)}–${pct(iv[1])})`;
  const parts = [head];
  if (distanceKm !== null) parts.push(`${distanceKm.toFixed(1)} km away`);
  parts.push(replyPhrase(r.avg_response_secs));

  return {
    p_complete: round3(p),
    interval_90: [round3(iv[0]), round3(iv[1])],
    observations: obs,
    proximity: round3(prox),
    responsiveness: round3(resp),
    total: round3(total),
    explanation: parts.join(", "),
    is_simulated_history: !!r.is_simulated_history,
  };
}

export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
