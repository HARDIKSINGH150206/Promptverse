// Response cache: the stage safety net. Every successful AI response is kept in data/ai_cache.json,
// keyed by a hash of its input, and served when the provider times out or errors.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/ai_cache.json");
const persist = !process.env.VITEST;
let store: Record<string, unknown> | null = null;
let writeTimer: NodeJS.Timeout | null = null;

function load(): Record<string, unknown> {
  if (store) return store;
  try {
    store = persist && fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : {};
  } catch {
    store = {};
  }
  return store!;
}

export function hashKey(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export function cacheGet<T>(key: string): T | undefined {
  return load()[hashKey(key)] as T | undefined;
}

export function cacheSet(key: string, value: unknown): void {
  load()[hashKey(key)] = value;
  if (!persist) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(store, null, 1));
    } catch (err) {
      console.warn("[ai cache] write failed:", (err as Error).message);
    }
  }, 300);
}

export function cacheSize(): number {
  return Object.keys(load()).length;
}
