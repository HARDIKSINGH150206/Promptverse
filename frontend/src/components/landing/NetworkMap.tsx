"use client";

import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { Board, Recipient, Restaurant } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { useInView, useReducedMotion } from "../motion";
import { ButtonLink, Eyebrow } from "../ui";
import { BENGALURU, DOTS, MAP_H, MAP_W } from "./indiaDots";
import { Container, SectionTitle } from "./shared";
import { CountUp, Reveal } from "../motion";

const KK = { lat: 12.9352, lng: 77.6245 };

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Deterministic sparkle so server and client agree.
const lit = (i: number) => ((i * 2654435761) >>> 0) % 13 === 0;

/** The dotted map: every land dot, brighter and blue around Bengaluru where the relay runs. */
function DottedIndia() {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<SVGSVGElement>({ threshold: 0.25 });
  const shown = reduced || inView;
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < DOTS.length; i += 2) {
    const x = DOTS[i];
    const y = DOTS[i + 1];
    const d = Math.hypot(x - BENGALURU.x, y - BENGALURU.y);
    const near = d < 9;
    dots.push(
      <circle
        key={i}
        cx={x}
        cy={y}
        r={0.3}
        fill={near ? "#0099FF" : "#F2EFE9"}
        fillOpacity={near ? Math.max(0.3, 1 - d / 9) : lit(i / 2) ? 0.5 : 0.2}
      />,
    );
  }
  return (
    <svg ref={ref} viewBox={`-1 -1 ${MAP_W + 2} ${MAP_H + 2}`} className="h-full w-full" aria-hidden>
      <defs>
        {/* a reveal circle that grows out from Bengaluru */}
        <mask id="india-reveal" maskUnits="userSpaceOnUse">
          <circle
            cx={BENGALURU.x}
            cy={BENGALURU.y}
            r={130}
            fill="white"
            style={{
              transform: shown ? "scale(1)" : "scale(0)",
              transformBox: "view-box",
              transformOrigin: `${BENGALURU.x + 1}px ${BENGALURU.y + 1}px`,
              transition: reduced ? "none" : "transform 2.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </mask>
      </defs>
      <g mask="url(#india-reveal)">{dots}</g>
      {/* Bengaluru: pulsing reach rings and a hexagon marker */}
      <g transform={`translate(${BENGALURU.x} ${BENGALURU.y})`}>
        {[0, 1.2].map((delay) => (
          <circle key={delay} r={1} fill="none" stroke="#0099FF" strokeWidth={0.2}>
            <animate attributeName="r" from="1" to="8" dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.9" to="0" dur="2.4s" begin={`${delay}s`} repeatCount="indefinite" />
          </circle>
        ))}
        <path d="M0 -1.5 1.3 -0.75 1.3 0.75 0 1.5 -1.3 0.75 -1.3 -0.75Z" fill="#0099FF" />
      </g>
    </svg>
  );
}

/** Zoomed-in Bengaluru: the real kitchens and homes from the backend, plotted by coordinates. */
function RelayInset({ homes, kitchens }: { homes: Recipient[]; kitchens: Restaurant[] }) {
  const pts = [...homes, ...kitchens];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat] = pts.length ? [Math.min(...lats), Math.max(...lats)] : [KK.lat - 0.03, KK.lat + 0.04];
  const [minLng, maxLng] = pts.length ? [Math.min(...lngs), Math.max(...lngs)] : [KK.lng - 0.03, KK.lng + 0.03];
  const x = (lng: number) => 26 + ((lng - minLng) / Math.max(1e-6, maxLng - minLng)) * 44;
  const y = (lat: number) => 14 + ((maxLat - lat) / Math.max(1e-6, maxLat - minLat)) * 68;
  const ref = kitchens.find((k) => k.id === "r_koramangala") ?? KK;

  return (
    <div className="rounded-2xl border border-line bg-panel/90 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10.5px] tracking-[0.14em] text-white/55 uppercase">Bengaluru · zoomed in</p>
        <span className="flex items-center gap-3 font-mono text-[10px] text-white/45">
          <span className="inline-flex items-center gap-1"><span className="size-2 rotate-45 rounded-[2px] bg-orange" aria-hidden />kitchen</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky" aria-hidden />home</span>
        </span>
      </div>
      <div className="dot-field relative mt-3 h-56 rounded-xl border border-white/[0.05] bg-navy" role="img" aria-label="Kitchens and homes in Bengaluru">
        {kitchens.map((k) => (
          <div key={k.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(k.lng)}%`, top: `${y(k.lat)}%` }}>
            <span className="block size-2.5 rotate-45 rounded-[2px] bg-orange" aria-hidden />
            <span className="absolute top-4 left-1/2 -translate-x-1/2 font-mono text-[9.5px] whitespace-nowrap text-orange uppercase">{k.name.split(" ")[0]}</span>
          </div>
        ))}
        {homes.map((h) => (
          <div key={h.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(h.lng)}%`, top: `${y(h.lat)}%` }}>
            <span className="block size-2.5 rounded-full bg-sky" aria-hidden />
            <span className={cx(
              "absolute top-1/2 -translate-y-1/2 font-mono text-[9.5px] whitespace-nowrap text-white/60 uppercase",
              h.lng < ref.lng - 0.005 ? "right-4" : "left-4",
            )}>
              {h.name.split(" ")[0]} <span className="text-white/40">{km(ref, h).toFixed(1)} km</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Like the reference's world map: a dotted map with the live relay highlighted. */
export function NetworkMap({ board, restaurants }: { board: Board | null; restaurants: Restaurant[] | null }) {
  const homes: Recipient[] = board?.recipients ?? [];
  const kitchens = restaurants ?? [];
  const bx = (BENGALURU.x / MAP_W) * 100;
  const by = (BENGALURU.y / MAP_H) * 100;

  return (
    <section id="network" className="scroll-mt-20 overflow-hidden py-24">
      <Container>
        <div className="relative grid gap-10 lg:min-h-[720px] lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="relative z-10 flex flex-col">
            <Eyebrow icon={<MapIcon />}>Bengaluru relay</Eyebrow>
            <SectionTitle className="mt-5">Every meal lands close to home</SectionTitle>
            <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-white/55">
              The relay runs across Bengaluru today. A home is only offered food it can reach before the food stops being safe.
            </p>
            <div className="mt-8">
              <ButtonLink href="/recipient" variant="onDark">
                See every home <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
            <Reveal delay={200} y={30} className="mt-10 lg:mt-auto">
              <RelayInset homes={homes} kitchens={kitchens} />
            </Reveal>
          </div>

          <div className="relative h-[420px] sm:h-[560px] lg:h-auto">
            <div className="absolute inset-0 lg:-left-6">
              <DottedIndia />
              {/* marker label, positioned in the same map coordinates */}
              <div className="pointer-events-none absolute" style={{ left: `${bx}%`, top: `${by}%` }}>
                <p className="ml-6 -translate-y-1/2 font-mono text-[12px] tracking-[0.12em] whitespace-nowrap uppercase">
                  <span className="text-sky">Bengaluru</span>{" "}
                  <span className="hidden text-white/70 sm:inline">{homes.length || 5} homes · {kitchens.length || 2} kitchens</span>
                </p>
              </div>
            </div>
            <div className={cx("absolute right-0 bottom-0 flex gap-12 text-right")}>
              <div>
                <p className="text-sm text-white/45">Meals rescued</p>
                <p className="mt-1 text-3xl text-white"><CountUp value={board?.stats.meals_rescued} /></p>
              </div>
              <div>
                <p className="text-sm text-white/45">Backups promoted</p>
                <p className="mt-1 text-3xl text-white"><CountUp value={board?.stats.backups_promoted} /></p>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
