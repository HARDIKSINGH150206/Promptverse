import { ArrowRight, BadgeCheck, Clock, Compass, Gauge, MapPin, ScrollText, Send } from "lucide-react";
import type { Board } from "@/lib/api/types";
import { ReliabilityBar } from "../ReliabilityBar";
import { ButtonLink, Eyebrow, SimulatedBadge, Skeleton } from "../ui";
import { Container, SectionTitle } from "./shared";

const TYPE: Record<string, string> = { shelter: "Shelter", orphanage: "Orphanage", old_age_home: "Elders' home", ngo: "NGO" };

const POINTS = [
  { icon: BadgeCheck, label: "Track record, not guesses" },
  { icon: Compass, label: "Fair chance for new homes" },
  { icon: MapPin, label: "Only homes within reach" },
  { icon: Clock, label: "Fast replies count" },
  { icon: Gauge, label: "Risk watched every 2 s" },
  { icon: ScrollText, label: "Every pick explained" },
];

/** Like the reference's model catalog: every home, ranked honestly, from the live board. */
export function ReliabilityCatalog({ board }: { board: Board | null }) {
  const homes = board ? [...board.recipients].sort((a, b) => b.reliability.total - a.reliability.total) : [];
  return (
    <section id="reliability" className="scroll-mt-20 py-24">
      <Container className="grid items-start gap-14 lg:grid-cols-[1fr_1.15fr]">
        <div className="lg:sticky lg:top-28">
          <Eyebrow icon={<Send />}>Who gets the food</Eyebrow>
          <SectionTitle className="mt-5">Every home, ranked honestly</SectionTitle>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-white/55">
            A Bayesian estimate of who will actually show up, shown with its uncertainty. A proven home has a narrow band; a new one, a wide band.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/board" variant="onDark">Open the Live Board <ArrowRight className="size-4" aria-hidden /></ButtonLink>
            <ButtonLink href="/recipient" variant="outline">Post today&apos;s need</ButtonLink>
          </div>
          <div className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-4 border-t border-white/[0.07] pt-8">
            {POINTS.map((p) => (
              <p key={p.label} className="flex items-center gap-2.5 text-[15px] text-white/70">
                <p.icon className="size-4 text-white/40" aria-hidden />
                {p.label}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-[1.4rem] border border-line bg-panel p-2">
          <div className="rounded-2xl border border-white/[0.05] bg-navy">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <p className="font-medium text-white">Homes, by reliability</p>
              <SimulatedBadge label="Simulated history" />
            </div>
            <ol className="divide-y divide-white/[0.05]">
              {homes.length
                ? homes.map((h, i) => (
                  <li key={h.id} className="px-5 py-4">
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <p className="text-[15px] text-white"><span className="tabular mr-3 font-mono text-xs text-white/30">0{i + 1}</span>{h.name}</p>
                      <span className="text-xs text-white/40">{TYPE[h.type]} · {h.area}</span>
                    </div>
                    <ReliabilityBar recipient={h} />
                  </li>
                ))
                : Array.from({ length: 5 }, (_, i) => <li key={i} className="px-5 py-4"><Skeleton className="h-10" /></li>)}
            </ol>
            <p className="border-t border-white/[0.06] px-5 py-3.5 text-[13px] text-white/45">
              Dot = likely completion · band = 90% range · refreshed live from the board
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
