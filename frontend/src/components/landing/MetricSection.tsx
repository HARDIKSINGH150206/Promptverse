import { Ban, LifeBuoy, MessageSquareText, PackageCheck } from "lucide-react";
import type { Board } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { Container } from "./shared";
import { CountUp, Reveal } from "../motion";

/** Where the reference has pricing: the one number we claim, and how each count is made. */
export function MetricSection({ board }: { board: Board | null }) {
  const s = board?.stats;
  const cards = [
    { icon: PackageCheck, title: "Meals rescued", v: s?.meals_rescued, how: ["Meals marked collected", "Across every finished offer", "Includes simulated history"] },
    { icon: Ban, title: "Dropouts caught", v: s?.dropouts_caught, how: ["A home cancelled or went silent", "Its meals were re-matched", "or a backup took over"] },
    { icon: LifeBuoy, title: "Backups promoted", v: s?.backups_promoted, how: ["Risk passed 25%", "A backup was already standing by", "It took over instantly"] },
    { icon: MessageSquareText, title: "Replies understood", v: s?.replies_understood, how: ["Free-text replies", "Understood at 70% or higher", "That changed what happened"] },
  ];
  return (
    <section className="py-24">
      <Container>
        <Reveal className="text-center">
          <p className="display tabular text-7xl text-white sm:text-8xl lg:text-[9rem]"><CountUp value={s ? s.share_collected_within_window : null} format={(n) => pct(n)} duration={1800} /></p>
          <p className="mt-4 text-xl text-white/70">of finished offers collected within their safe window</p>
          <p className="mx-auto mt-3 max-w-lg text-[15px] text-white/45">
            The one metric we claim, measured live by the backend. No real-world waste-reduction numbers.
          </p>
        </Reveal>
        <div className="mt-14 grid gap-2 rounded-[1.4rem] border border-line bg-panel p-2 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 110} className="flex flex-col">
              <div className="rounded-2xl border border-white/[0.06] bg-raised p-5">
                <p className="flex items-center gap-2 text-[15px] text-white"><c.icon className="size-4 text-sky" aria-hidden />{c.title}</p>
                <p className="tabular mt-6 text-5xl tracking-tight text-white"><CountUp value={c.v} /></p>
                <p className="mt-2 text-sm text-white/45">so far</p>
              </div>
              <ul className="space-y-3 px-5 py-5 text-[15px] text-white/60">
                <li className="text-white/45">Counted when:</li>
                {c.how.map((h) => <li key={h}>{h}</li>)}
              </ul>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
