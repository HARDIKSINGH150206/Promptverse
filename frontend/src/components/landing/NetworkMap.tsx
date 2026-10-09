import { ArrowRight, Map as MapIcon } from "lucide-react";
import type { Board, Recipient, Restaurant } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { ButtonLink, Eyebrow } from "../ui";
import { Container, SectionTitle } from "./shared";

// Same seed coordinates as the backend, used until the board loads.
const KK = { lat: 12.9352, lng: 77.6245 };

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Like the reference's world map: the real homes and kitchens, plotted from their coordinates. */
export function NetworkMap({ board, restaurants }: { board: Board | null; restaurants: Restaurant[] | null }) {
  const homes: Recipient[] = board?.recipients ?? [];
  const kitchens = restaurants ?? [];
  const pts = [...homes, ...kitchens];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const [minLat, maxLat] = pts.length ? [Math.min(...lats), Math.max(...lats)] : [KK.lat - 0.03, KK.lat + 0.04];
  const [minLng, maxLng] = pts.length ? [Math.min(...lngs), Math.max(...lngs)] : [KK.lng - 0.03, KK.lng + 0.03];
  // plot area: x 8–72 %, y 10–70 % (labels run right; stats sit bottom-right)
  const x = (lng: number) => 8 + ((lng - minLng) / Math.max(1e-6, maxLng - minLng)) * 64;
  const y = (lat: number) => 10 + ((maxLat - lat) / Math.max(1e-6, maxLat - minLat)) * 60;
  const ref = kitchens.find((k) => k.id === "r_koramangala") ?? KK;
  const best = [...homes].sort((a, b) => b.reliability.total - a.reliability.total)[0];

  return (
    <section id="network" className="scroll-mt-20 py-24">
      <Container>
        <div className="relative overflow-hidden rounded-[1.4rem] border border-white/[0.06]">
          <div className="dot-field absolute inset-0" aria-hidden />
          <div className="relative grid min-h-[620px] lg:grid-cols-[minmax(0,420px)_1fr]">
            <div className="z-10 p-8 sm:p-10">
              <Eyebrow icon={<MapIcon />}>Bengaluru relay</Eyebrow>
              <SectionTitle className="mt-5 text-4xl! sm:text-5xl!">Every meal lands close to home</SectionTitle>
              <p className="mt-5 text-[15px] leading-relaxed text-white/55">
                Kitchens and homes a short ride apart. A home is only offered food it can reach before the food stops being safe.
              </p>
              <ButtonLink href="/recipient" variant="onDark" className="mt-8">
                See every home <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>

            <div className="relative min-h-[420px]" aria-label="Map of kitchens and homes" role="img">
              {kitchens.map((k) => (
                <div key={k.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(k.lng)}%`, top: `${y(k.lat)}%` }}>
                  <span className="block size-3.5 rotate-45 rounded-[3px] bg-orange" aria-hidden />
                  <span className="absolute top-5 left-1/2 -translate-x-1/2 font-mono text-[10.5px] tracking-wider whitespace-nowrap text-orange uppercase">
                    {k.name}
                  </span>
                </div>
              ))}
              {homes.map((h) => {
                const isBest = h.id === best?.id;
                return (
                  <div key={h.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x(h.lng)}%`, top: `${y(h.lat)}%` }}>
                    <svg viewBox="0 0 24 24" className={cx("size-5", isBest ? "text-sky" : "text-sky/60")} aria-hidden>
                      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="currentColor" />
                    </svg>
                    <span className={cx(
                      "absolute top-1/2 left-7 -translate-y-1/2 font-mono text-[11px] tracking-wider whitespace-nowrap uppercase",
                      isBest ? "text-sky" : "text-white/45",
                    )}>
                      {h.name} <span className="text-white/60">{km(ref, h).toFixed(1)} km</span>
                    </span>
                  </div>
                );
              })}
              <div className="absolute right-8 bottom-8 flex gap-12 text-right">
                <div>
                  <p className="text-sm text-white/45">Homes on the relay</p>
                  <p className="tabular mt-1 text-3xl text-white">{homes.length || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-white/45">Meals rescued</p>
                  <p className="tabular mt-1 text-3xl text-white">{board ? board.stats.meals_rescued : "—"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
