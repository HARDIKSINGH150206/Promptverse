"use client";

import Link from "next/link";
import { ArrowRight, LifeBuoy, PackageCheck, Radio } from "lucide-react";
import { api } from "@/lib/api/client";
import { pct } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { ReliabilityBar } from "./ReliabilityBar";
import { ErrorState, SimulatedBadge, Skeleton } from "./ui";

/** Hero "dashboard" card: the real board numbers, not decoration. */
export function HubPreview() {
  const { data: board, error, refresh } = usePoll(() => api.board(), 4000);

  if (error && !board) return <ErrorState error={error} onRetry={refresh} />;

  const top = board ? [...board.recipients].sort((a, b) => b.reliability.total - a.reliability.total).slice(0, 3) : [];
  const s = board?.stats;

  return (
    <div className="rounded-[1.75rem] bg-white p-5 text-navy sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Radio className="size-4 text-orange" aria-hidden />
          Live board right now
        </p>
        {s?.is_simulated ? <SimulatedBadge /> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="col-span-2 rounded-2xl bg-navy p-4 text-white sm:col-span-1">
          <p className="text-xs font-semibold text-white/75">Collected in safe window</p>
          {s ? <p className="tabular mt-1 text-4xl font-extrabold">{pct(s.share_collected_within_window)}</p> : <Skeleton className="mt-2 h-10 bg-white/10!" />}
        </div>
        <div className="rounded-2xl bg-blue/[0.07] p-4">
          <p className="flex items-center gap-1 text-xs font-semibold text-navy/65"><PackageCheck className="size-3.5" aria-hidden />Meals rescued</p>
          {s ? <p className="tabular mt-1 text-3xl font-extrabold">{s.meals_rescued}</p> : <Skeleton className="mt-2 h-9" />}
        </div>
        <div className="rounded-2xl bg-blue/[0.07] p-4">
          <p className="flex items-center gap-1 text-xs font-semibold text-navy/65"><LifeBuoy className="size-3.5" aria-hidden />Backups promoted</p>
          {s ? <p className="tabular mt-1 text-3xl font-extrabold">{s.backups_promoted}</p> : <Skeleton className="mt-2 h-9" />}
        </div>
      </div>

      <p className="mt-5 text-xs font-bold uppercase tracking-wider text-navy/55">Most reliable collectors</p>
      <ul className="mt-2 space-y-3">
        {board
          ? top.map((r) => (
            <li key={r.id}>
              <p className="mb-1 text-sm font-semibold">{r.name}</p>
              <ReliabilityBar recipient={r} compact />
            </li>
          ))
          : Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10" />)}
      </ul>

      <Link href="/board" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-blue hover:underline">
        Open the full Live Board <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
