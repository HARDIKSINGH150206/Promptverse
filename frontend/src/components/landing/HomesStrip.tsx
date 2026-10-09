import type { Board } from "@/lib/api/types";
import { Container } from "./shared";
import { Reveal } from "../motion";

const FALLBACK = ["Hope Shelter", "Sunrise Elders Home", "Little Stars Home", "Saathi NGO", "New Dawn Shelter"];

/** Where the reference shows customer logos: the homes on the relay, labelled as simulated. */
export function HomesStrip({ board }: { board: Board | null }) {
  const names = board?.recipients.map((r) => r.name) ?? FALLBACK;
  return (
    <section className="py-20">
      <Container>
        <p className="text-center text-[15px] text-white/45">Feeding people at homes like these <span className="text-white/30">(simulated)</span></p>
        <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          {names.map((n, i) => (
            <Reveal as="li" key={n} delay={i * 80} className="text-2xl font-semibold tracking-tight text-white/35 transition-colors hover:text-white/70 sm:text-[1.7rem]">
              {n}
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
