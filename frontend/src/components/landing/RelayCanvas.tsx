import { Brain, Check, Gauge, LifeBuoy, Mic, PackageCheck, Scale, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Container, Lede, Mono, SectionTitle } from "./shared";

type NodeSpec = { id: string; x: number; y: number; w: number; icon: ReactNode; title: string; tag?: string; lines: string[]; port?: string; active?: boolean; waiting?: boolean };

// layout on a 1160 x 470 canvas
const NODES: NodeSpec[] = [
  { id: "voice", x: 20, y: 60, w: 220, icon: <Mic />, title: "Voice note", tag: "Restaurant", lines: ["40 plates veg biryani", "safe till 10:00 pm"], port: "offer", active: true },
  { id: "guard", x: 20, y: 250, w: 220, icon: <ShieldCheck />, title: "Guardrail", tag: "Laya", lines: ["Veg 97% · safety 6%", "Checklist 3 / 3"], port: "checked", active: true },
  { id: "match", x: 300, y: 150, w: 250, icon: <Scale />, title: "Matching", tag: "Bayesian", lines: ["Only homes that asked", "Ranked by who shows up"], port: "ranked", active: true },
  { id: "hope", x: 620, y: 40, w: 230, icon: <Users />, title: "Hope Shelter", tag: "20 meals", lines: ["86% likely 72–96%", "Running late · risk 81%"], port: "risk", active: true },
  { id: "sun", x: 620, y: 270, w: 230, icon: <LifeBuoy />, title: "Sunrise Elders Home", tag: "Backup", lines: ["93% likely 80–100%", "On standby"], port: "takes over", active: true },
  { id: "risk", x: 920, y: 40, w: 240, icon: <Gauge />, title: "Risk model", tag: "> 25%", lines: ["Asked a backup to stand by", "before anyone dropped out"], waiting: true },
  { id: "done", x: 920, y: 270, w: 240, icon: <PackageCheck />, title: "Collected", tag: "on time", lines: ["20 meals, 38 min to spare", "Outcome recorded"], waiting: true },
];

// connectors: [fromX, fromY, toX, toY, active]
const EDGES: [number, number, number, number, boolean][] = [
  [240, 135, 300, 200, true],
  [240, 325, 300, 245, true],
  [550, 200, 620, 115, true],
  [550, 245, 620, 345, true],
  [850, 115, 920, 115, false],
  [850, 345, 920, 345, false],
  [735, 175, 735, 270, false],
];

function curve([x1, y1, x2, y2]: [number, number, number, number, boolean]): string {
  if (x1 === x2) return `M${x1} ${y1} L${x2} ${y2}`;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function Node({ n }: { n: NodeSpec }) {
  return (
    <div
      className={cx(
        "rounded-2xl border bg-panel p-4 [&_svg]:size-4",
        n.waiting ? "border-white/[0.06] opacity-70" : "border-line",
      )}
      style={{ width: n.w }}
    >
      <div className="flex items-center gap-2 text-white">
        <span className="text-sky">{n.icon}</span>
        <span className="text-sm font-medium">{n.title}</span>
        {n.tag ? <span className="ml-auto rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/55">{n.tag}</span> : null}
      </div>
      <div className="mt-2.5 space-y-0.5 text-[12.5px] text-white/55">
        {n.lines.map((l) => <p key={l}>{l}</p>)}
      </div>
      {n.port ? (
        <p className="mt-3 flex items-center justify-end gap-2 text-[11px] text-white/45">
          {n.port}
          <span className={cx("size-2.5 rounded-full border-2", n.active ? "border-orange bg-orange" : "border-white bg-navy")} aria-hidden />
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/40">
          <Check className="size-3" aria-hidden /> Runs automatically
        </p>
      )}
    </div>
  );
}

/** Like the reference's endpoint canvas: one offer's path through the relay. */
export function RelayCanvas() {
  return (
    <section className="py-24">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <SectionTitle>
              One offer, from kitchen
              <br className="hidden sm:block" /> to a full plate
            </SectionTitle>
            <Lede className="mt-6">
              A voice note goes in. Safety is double-checked, the most reliable home is chosen, and risk is watched until the food is collected.
            </Lede>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-white/55">
            <Brain className="size-4 text-sky" aria-hidden /> AI suggests, plain code decides
          </span>
        </div>
      </Container>

      <div className="grid-lines mt-14 border-y border-white/[0.06]">
        <Container>
          {/* laptop and up: wired canvas */}
          <div className="relative mx-auto hidden h-[470px] w-[1160px] xl:block">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1160 470" fill="none" aria-hidden>
              {EDGES.map((e, i) => (
                <path
                  key={i}
                  d={curve(e)}
                  stroke={e[4] ? "#FF6E42" : "#F9F9F9"}
                  strokeOpacity={e[4] ? 1 : 0.3}
                  strokeWidth={e[4] ? 2 : 1.5}
                  strokeDasharray={e[4] ? undefined : "4 4"}
                  className={e[4] ? undefined : "animate-dash"}
                />
              ))}
            </svg>
            {NODES.map((n) => (
              <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
                <Node n={n} />
              </div>
            ))}
          </div>
          {/* smaller screens: the same steps, stacked */}
          <div className="grid gap-3 py-10 sm:grid-cols-2 xl:hidden">
            {NODES.map((n) => <Node key={n.id} n={{ ...n, w: undefined as unknown as number }} />)}
          </div>
        </Container>
      </div>
      <Container>
        <Mono className="mt-4 block text-right">Illustrative example of scenario 2</Mono>
      </Container>
    </section>
  );
}
