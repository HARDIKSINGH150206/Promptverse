// The only API the UI uses. Picks the live backend or the in-browser mock per endpoint group.
//   NEXT_PUBLIC_API_MODE=mock | live | mixed
//   NEXT_PUBLIC_LIVE_GROUPS=health,directory,board   (mixed only)
import { live } from "./live";
import { mock } from "./mock";
import type { Api } from "./types";

export type ApiMode = "mock" | "live" | "mixed";
export type ApiGroup =
  | "health" | "directory" | "parse" | "offers" | "demands" | "board"
  | "assignments" | "replies" | "collector" | "impact" | "demo";

const rawMode = (process.env.NEXT_PUBLIC_API_MODE ?? "mock").trim().toLowerCase();
export const API_MODE: ApiMode = rawMode === "live" || rawMode === "mixed" ? rawMode : "mock";

const LIVE_GROUPS = new Set(
  (process.env.NEXT_PUBLIC_LIVE_GROUPS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);

const GROUP: Record<keyof Api, ApiGroup> = {
  health: "health",
  restaurants: "directory",
  recipients: "directory",
  parseOffer: "parse",
  parseDemand: "parse",
  transcribe: "parse",
  createOffer: "offers",
  getOffer: "offers",
  createDemand: "demands",
  board: "board",
  assignmentAction: "assignments",
  reply: "replies",
  collectorInbox: "collector",
  impact: "impact",
  demoReset: "demo",
  demoFastForward: "demo",
};

export function isLive(group: ApiGroup): boolean {
  if (API_MODE === "live") return true;
  if (API_MODE === "mixed") return LIVE_GROUPS.has(group);
  return false;
}

function pick<K extends keyof Api>(key: K): Api[K] {
  return ((...args: unknown[]) => {
    const impl = isLive(GROUP[key]) ? live : mock;
    return (impl[key] as (...a: unknown[]) => unknown)(...args);
  }) as Api[K];
}

export const api: Api = {
  health: pick("health"),
  restaurants: pick("restaurants"),
  recipients: pick("recipients"),
  parseOffer: pick("parseOffer"),
  createOffer: pick("createOffer"),
  getOffer: pick("getOffer"),
  parseDemand: pick("parseDemand"),
  createDemand: pick("createDemand"),
  board: pick("board"),
  assignmentAction: pick("assignmentAction"),
  reply: pick("reply"),
  collectorInbox: pick("collectorInbox"),
  impact: pick("impact"),
  demoReset: pick("demoReset"),
  demoFastForward: pick("demoFastForward"),
  transcribe: pick("transcribe"),
};

export const TELEGRAM_BOT_USERNAME = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
