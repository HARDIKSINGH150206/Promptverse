"use client";

import Link from "next/link";
import { api } from "@/lib/api/client";
import { usePoll } from "@/lib/usePoll";
import { Wordmark } from "./Logo";

const COLUMNS = [
  { title: "Use AnnaRelay", links: [["List leftover food", "/restaurant"], ["Post today's need", "/recipient"], ["Live Board", "/board"]] },
  { title: "How it works", links: [["The relay", "/#how"], ["Who gets the food", "/#reliability"], ["Backups", "/#network"]] },
] as const;

export function SiteFooter() {
  const { data } = usePoll(() => api.board(), 15000);
  return (
    <footer className="border-t border-white/[0.06] bg-navy">
      <div className="mx-auto grid max-w-[1240px] gap-12 px-5 pt-16 pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/55">
            Leftover food, matched to people who need it, collected before it spoils. Anna (अन्न) means food.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <p className="text-sm font-medium text-white">{c.title}</p>
            <ul className="mt-4 space-y-3">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-sm text-white/55 transition-colors hover:text-white">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="text-sm font-medium text-white">Honesty</p>
          <ul className="mt-4 space-y-3 text-sm text-white/55">
            <li>Seeded homes and history are simulated</li>
            <li>Every AI answer shows its source</li>
            <li>One metric, no inflated claims</li>
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-white/[0.06] px-5 py-6 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between lg:px-8">
        <p>
          <span className="tabular font-medium text-white/80">{data ? data.stats.meals_rescued.toLocaleString("en-IN") : "—"}</span> meals rescued so far
          <span className="text-white/30"> · includes simulated history</span>
        </p>
        <p>Built for Promptverse</p>
      </div>
    </footer>
  );
}
