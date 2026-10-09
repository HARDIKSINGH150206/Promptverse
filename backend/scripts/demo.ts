// One command for demo day: starts local Laya + the backend (if not already running),
// waits for both, does a real AI round trip, and prints what's ready. Ctrl+C stops what it started.
// Usage: npm run demo            (add --scenarios to also run the 4 demo scenarios)
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config";

const root = path.resolve(import.meta.dirname, "..");
const API = `http://localhost:${config.PORT}`;
const LAYA = config.LAYA_LOCAL_URL.replace(/\/$/, "");
const needsLaya = config.DECISION_PROVIDER === "hybrid" || config.DECISION_PROVIDER === "laya_local";
const started: ChildProcess[] = [];

const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function up(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string, timeoutMs: number, child?: ChildProcess): Promise<boolean> {
  const t0 = Date.now();
  let dots = 0;
  while (Date.now() - t0 < timeoutMs) {
    if (await up(url)) {
      process.stdout.write("\n");
      return true;
    }
    if (child && child.exitCode !== null) {
      process.stdout.write("\n");
      console.log(bad(`  ${label} exited (code ${child.exitCode}). See the log above.`));
      return false;
    }
    if (dots++ % 5 === 0) process.stdout.write(dim(`  waiting for ${label} (${Math.round((Date.now() - t0) / 1000)} s)`) + "\r");
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stdout.write("\n");
  return false;
}

function start(cmd: string, args: string[], logFile: string): ChildProcess {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, "w");
  const child = spawn(cmd, args, { cwd: root, stdio: ["ignore", out, out], windowsHide: true, shell: false });
  started.push(child);
  return child;
}

function stopAll(): void {
  for (const c of started) {
    if (c.exitCode !== null || !c.pid) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    else c.kill("SIGTERM");
  }
}
process.on("SIGINT", () => {
  console.log("\nStopping what this script started...");
  stopAll();
  process.exit(0);
});

console.log("AnnaRelay demo start\n");
if (!fs.existsSync(path.join(root, ".env"))) console.log(bad("  No backend/.env found: everything will run on mocks. Copy .env.example to .env."));

// 1. Laya
if (needsLaya) {
  if (await up(`${LAYA}/health`)) {
    console.log(ok("  Laya already running") + dim(` (${LAYA})`));
  } else if (!fs.existsSync(path.join(root, "laya-local", ".venv"))) {
    console.log(bad("  Laya not installed. Run `npm run laya:setup` once. Continuing: the LLM will answer alone."));
  } else {
    console.log(`  Starting Laya ${dim("(log: data/laya.log; first start downloads ~1 GB)")}`);
    const laya = start("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/start-laya.ps1"], path.join(root, "data", "laya.log"));
    if (await waitFor(`${LAYA}/health`, "Laya", 10 * 60_000, laya)) console.log(ok("  Laya ready"));
    else console.log(bad("  Laya didn't come up. Continuing: the LLM will answer alone (see data/laya.log)."));
  }
}

// 2. Backend
if (await up(`${API}/api/health`)) {
  console.log(ok("  Backend already running") + dim(` (${API}). Restart it yourself to pick up .env changes.`));
} else {
  console.log(`  Starting backend ${dim("(log: data/server.log)")}`);
  const tsx = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const backend = process.platform === "win32"
    ? start("cmd", ["/c", tsx, "src/index.ts"], path.join(root, "data", "server.log"))
    : start(tsx, ["src/index.ts"], path.join(root, "data", "server.log"));
  if (!(await waitFor(`${API}/api/health`, "backend", 60_000, backend))) {
    console.log(bad("  Backend failed to start. See data/server.log."));
    stopAll();
    process.exit(1);
  }
  // give the Telegram bot a moment to connect
  await new Promise((r) => setTimeout(r, 2500));
}

// 3. Status + a real AI round trip
const health = (await (await fetch(`${API}/api/health`)).json()) as Record<string, string>;
const fd = new FormData();
fd.append("restaurant_id", "r_koramangala");
fd.append("transcript", "20 plates dal rice, it has been sitting out since afternoon, safe till 10");
const t0 = Date.now();
let parseLine = "";
try {
  const r = (await (await fetch(`${API}/api/offers/parse`, { method: "POST", body: fd })).json()) as any;
  const g = r.parsed.guardrail;
  parseLine = `${Date.now() - t0} ms, ${r.parsed.estimated_meals} meals ${r.parsed.diet}, safety ${Math.round((g.safety_concern_probability ?? 0) * 100)}% via ${g.source}`;
} catch (err) {
  parseLine = bad(`failed: ${(err as Error).message}`);
}

const row = (name: string, v: string, good: string[]) => console.log(`  ${name.padEnd(11)} ${good.includes(v) ? ok(v) : bad(v)}`);
console.log("\nServices");
row("llm", health.llm, ["ready"]);
row("laya", health.laya, ["ready"]);
row("stt", health.stt ?? "n/a", ["ready"]);
row("telegram", health.telegram, ["ready"]);
console.log(`  ${"AI check".padEnd(11)} ${parseLine}`);
console.log(dim(`  decision provider: ${config.DECISION_PROVIDER}, llm: ${config.LLM_PROVIDER}`));

console.log(`
Next
  Frontend      cd ../frontend && npm run dev      -> http://localhost:3000
  Telegram      send /start to @${config.TELEGRAM_BOT_USERNAME || "<bot>"} and tap a recipient
  Demo reset    POST ${API}/api/demo/reset  (or the "Demo control" button)
  Scenarios     npm run scenarios
`);

if (process.argv.includes("--scenarios")) {
  spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", "scripts/scenarios.ts"], { cwd: root, stdio: "inherit", shell: true });
}

if (started.length) console.log(dim("Running. Press Ctrl+C to stop Laya/backend started by this script."));
else process.exit(0);
