"use client";

import { Brain, Check, Gauge, LifeBuoy, Mic, PackageCheck, Scale, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { useReducedMotion } from "../motion";
import { Container, Lede, Mono, SectionTitle } from "./shared";

type NodeSpec = { id: string; x: number; y: number; w: number; icon: ReactNode; title: string; tag?: string; lines: string[]; port?: string; active?: boolean; waiting?: boolean; arrive: number };

// layout on a 1160 x 470 canvas
const NODES: NodeSpec[] = [
  { id: "voice", x: 20, y: 60, w: 220, icon: <Mic />, title: "Voice note", tag: "Restaurant", lines: ["40 plates veg biryani", "safe till 10:00 pm"], port: "offer", active: true, arrive: 0.0 },
  { id: "guard", x: 20, y: 250, w: 220, icon: <ShieldCheck />, title: "Guardrail", tag: "Laya", lines: ["Veg 97% · safety 6%", "Checklist 3 / 3"], port: "checked", active: true, arrive: 0.0 },
  { id: "match", x: 300, y: 150, w: 250, icon: <Scale />, title: "Matching", tag: "Bayesian", lines: ["Only homes that asked", "Ranked by who shows up"], port: "ranked", active: true, arrive: 0.22 },
  { id: "hope", x: 620, y: 40, w: 230, icon: <Users />, title: "Hope Shelter", tag: "20 meals", lines: ["86% likely 72–96%", "Running late · risk 81%"], port: "risk", active: true, arrive: 0.45 },
  { id: "sun", x: 620, y: 270, w: 230, icon: <LifeBuoy />, title: "Sunrise Elders Home", tag: "Backup", lines: ["93% likely 80–100%", "On standby"], port: "takes over", active: true, arrive: 0.62 },
  { id: "risk", x: 920, y: 40, w: 240, icon: <Gauge />, title: "Risk model", tag: "> 25%", lines: ["Asked a backup to stand by", "before anyone dropped out"], arrive: 0.68 },
  { id: "done", x: 920, y: 270, w: 240, icon: <PackageCheck />, title: "Collected", tag: "on time", lines: ["20 meals, 38 min to spare", "Outcome recorded"], arrive: 0.9 },
];

// connectors: [fromX, fromY, toX, toY, start, end]; start/end = when the packet travels, as a
// fraction of one relay cycle, so packets move through the chain in order.
type Edge = [number, number, number, number, number, number];
const EDGES: Edge[] = [
  [240, 135, 300, 200, 0.02, 0.22], // voice note -> matching
  [240, 325, 300, 245, 0.02, 0.22], // guardrail -> matching
  [550, 200, 620, 115, 0.25, 0.45], // matching -> Hope
  [550, 245, 620, 345, 0.25, 0.45], // matching -> Sunrise (asked as backup)
  [850, 115, 920, 115, 0.48, 0.68], // Hope -> risk model
  [735, 175, 735, 270, 0.48, 0.62], // Hope drops out -> Sunrise takes over
  [850, 345, 920, 345, 0.7, 0.9], // Sunrise -> collected
];
const CYCLE = 6.4; // seconds

function curve([x1, y1, x2, y2]: Edge): string {
  if (x1 === x2) return `M${x1} ${y1} L${x2} ${y2}`;
  const mid = (x1 + x2) / 2;
  return `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
}

function Node({ n, animate = false }: { n: NodeSpec; animate?: boolean }) {
  return (
    <div className="relative rounded-2xl border border-line bg-panel p-4 [&_svg]:size-4" style={{ width: n.w }}>
      {animate ? (
        <span
          className="pointer-events-none absolute -inset-px rounded-2xl border border-orange/80 shadow-[0_0_24px_-4px_rgb(240_178_74/0.55)]"
          style={{ animation: `node-glow ${CYCLE}s linear infinite`, animationDelay: `${n.arrive * CYCLE - 0.15}s`, opacity: 0 }}
          aria-hidden
        />
      ) : null}
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
  const reduced = useReducedMotion();
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
              <defs>
                {EDGES.map((e, i) => <path key={i} id={`relay-edge-${i}`} d={curve(e)} />)}
              </defs>
              {EDGES.map((e, i) => (
                <g key={i}>
                  {/* track */}
                  <use href={`#relay-edge-${i}`} stroke="#F2EFE9" strokeOpacity={0.12} strokeWidth={1.5} />
                  {/* current flowing along the wire, in the direction of travel */}
                  <use
                    href={`#relay-edge-${i}`}
                    stroke="#F0B24A"
                    strokeOpacity={0.75}
                    strokeWidth={1.75}
                    strokeLinecap="round"
                    strokeDasharray="2 14"
                    className={reduced ? undefined : "animate-dash"}
                  />
                  {/* the packet: travels this wire during its slot of the relay cycle */}
                  {!reduced ? (
                    <g opacity={0}>
                      <circle r={9} fill="#F0B24A" fillOpacity={0.22} />
                      <circle r={3.6} fill="#F0B24A" />
                      <animateMotion
                        dur={`${CYCLE}s`}
                        repeatCount="indefinite"
                        calcMode="linear"
                        keyPoints="0;0;1;1"
                        keyTimes={`0;${e[4]};${e[5]};1`}
                      >
                        <mpath href={`#relay-edge-${i}`} />
                      </animateMotion>
                      <animate
                        attributeName="opacity"
                        dur={`${CYCLE}s`}
                        repeatCount="indefinite"
                        values="0;0;1;1;0;0"
                        keyTimes={`0;${e[4]};${(e[4] + 0.01).toFixed(3)};${(e[5] - 0.01).toFixed(3)};${e[5]};1`}
                      />
                    </g>
                  ) : null}
                </g>
              ))}
            </svg>
            {NODES.map((n) => (
              <div key={n.id} className="absolute" style={{ left: n.x, top: n.y }}>
                <Node n={n} animate={!reduced} />
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
