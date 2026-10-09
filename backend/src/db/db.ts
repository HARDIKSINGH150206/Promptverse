import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.VITEST ? ":memory:" : config.DB_PATH;
if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));

export function clearAll(): void {
  db.exec("DELETE FROM events; DELETE FROM assignments; DELETE FROM offers; DELETE FROM demands; DELETE FROM recipients; DELETE FROM restaurants;");
}

export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}
