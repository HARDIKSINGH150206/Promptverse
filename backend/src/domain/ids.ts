import crypto from "node:crypto";

export type IdPrefix = "r" | "rc" | "d" | "o" | "a" | "e";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "x").slice(0, 8)}`;
}
