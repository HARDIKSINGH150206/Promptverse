"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Ban, CircleCheck, Clock, Inbox, LifeBuoy, MessageSquareText, PackageCheck, PackageOpen, Recycle, RotateCcw, Send, Target, Users,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { errorMessage, type Demand, type OfferDetail } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import { usePoll } from "@/lib/usePoll";
import { DemoControl } from "@/components/DemoControl";
import { OfferCard, isFinished } from "@/components/OfferCard";
import { useToast } from "@/components/providers";
import { ReliabilityBar } from "@/components/ReliabilityBar";
import { StatTile } from "@/components/StatTile";
import { StatusChip } from "@/components/StatusChip";
import { Card, EmptyState, ErrorState, LoadingBlock, SimulatedBadge, Skeleton, cx } from "@/components/ui";
import { LiveCallBanner, useLiveCall } from "@/components/LiveCall";
import { normalizeBoard, normalizeOffer } from "@/lib/api/live";
import { useStreamEvent, useStreamStatus } from "@/lib/stream";
import type { Board } from "@/lib/api/types";

const ACTIVE_DEMAND: Demand["status"][] = ["open", "partially_matched", "matched"];

function ResetControl({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await api.demoReset();
      toast("Demo data reset to the seeded starting point.", "success");
      setConfirming(false);
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return <DemoControl onClick={() => setConfirming(true)} icon={<RotateCcw className="size-4" aria-hidden />}>Reset demo</DemoControl>;
  }
  return (
    <div className="flex items-center gap-2">
      <DemoControl onClick={() => void reset()} busy={busy} icon={<RotateCcw className="size-4" aria-hidden />} className="border-orange!">
        Yes, reset everything
      </DemoControl>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-xl px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/5">
        Keep data
      </button>
    </div>
  );
}

function DemandRow({ d }: { d: Demand }) {
  const share = d.people_count ? Math.min(1, d.meals_matched / d.people_count) : 0;
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{d.recipient_name}</p>
          <p className="text-sm text-white/70">
            <span className="tabular">{d.people_count}</span> people · {d.diet === "veg" ? "veg only" : d.diet === "nonveg" ? "non-veg" : "any food"} · by {fmtTime(d.needed_by)}
          </p>
        </div>
        <StatusChip kind="demand" status={d.status} size="sm" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-sky transition-[width] duration-700" style={{ width: `${share * 100}%` }} />
        </div>
        <span className="tabular text-xs font-semibold text-white/70">{d.meals_matched}/{d.people_count} matched</span>
      </div>
    </li>
  );
}

export default function BoardPage() {
  const now = useNow();
  const streaming = useStreamStatus() === "live";
  // the stream pushes changes instantly; polling stays as a slow safety net
  const board = usePoll(() => api.board(), streaming ? 15000 : 2000);
  const b = board.data;
  useStreamEvent<{ board: Board }>("hello", (d) => board.setData(normalizeBoard(d.board)));
  useStreamEvent<{ board: Board }>("board", (d) => board.setData(normalizeBoard(d.board)));
  const liveCall = useLiveCall();

  // OfferDetail (risk + latest event) for live offers and the few most recent ones
  const detailIds = useMemo(() => {
    if (!b) return [];
    const ids = new Set(b.offers.filter((o) => !isFinished(o)).map((o) => o.id));
    for (const o of b.offers.slice(0, 4)) ids.add(o.id);
    return [...ids];
  }, [b]);
  const idsKey = detailIds.join(",");
  const details = usePoll(async () => {
    const out: Record<string, OfferDetail> = {};
    const settled = await Promise.allSettled(detailIds.map((id) => api.getOffer(id)));
    settled.forEach((r) => {
      if (r.status === "fulfilled") out[r.value.id] = r.value;
    });
    return out;
  }, streaming ? 15000 : 2000);
  const setDetails = details.setData;
  const detailsData = details.data;
  useStreamEvent<{ offer: OfferDetail }>("offer", (d) => {
    if (!detailIds.includes(d.offer.id)) return;
    setDetails({ ...(detailsData ?? {}), [d.offer.id]: normalizeOffer(d.offer) });
  });
  const refreshDetails = details.refresh;
  useEffect(() => {
    if (idsKey) void refreshDetails();
  }, [idsKey, refreshDetails]);

  if (board.error && !b) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <ErrorState error={board.error} onRetry={board.refresh} />
      </main>
    );
  }

  const s = b?.stats;
  const live = b?.offers.filter((o) => !isFinished(o)) ?? [];
  const finished = b?.offers.filter(isFinished) ?? [];
  const recipients = b ? [...b.recipients].sort((x, y) => y.reliability.total - x.reliability.total) : [];
  const activeDemands = b?.demands.filter((d) => ACTIVE_DEMAND.includes(d.status)) ?? [];
  const doneDemands = (b?.demands.length ?? 0) - activeDemands.length;

  return (
    <main className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8 lg:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-sky uppercase">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-orange opacity-60" aria-hidden />
              <span className="relative inline-flex size-2.5 rounded-full bg-orange" aria-hidden />
            </span>
            {streaming ? "Live · streaming from the server" : "Live · updates every 2 s"}
          </p>
          <h1 className="display mt-4 text-5xl text-white sm:text-6xl">Live Board</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {b ? <span className="tabular text-[15px] text-white/60"><Clock className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />{fmtTime(b.server_time)} IST</span> : null}
          {s?.is_simulated ? <SimulatedBadge label="Includes simulated data" /> : null}
          <ResetControl onDone={() => void board.refresh()} />
        </div>
      </div>

      {liveCall ? <LiveCallBanner call={liveCall} className="mt-6" /> : null}

      {/* headline metrics */}
      <section aria-label="Headline metrics" className="mt-6 grid gap-3 lg:grid-cols-[1.15fr_2fr]">
        {s ? (
          <StatTile
            hero
            icon={<Target className="size-5" aria-hidden />}
            label="Collected within safe window"
            value={pct(s.share_collected_within_window)}
            sub={`${s.offers_collected_within_window} of ${finished.length} finished offers collected in time`}
          />
        ) : <Skeleton className="h-48" />}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {s ? (
            <>
              <StatTile icon={<PackageCheck className="size-4" aria-hidden />} label="Meals rescued" value={s.meals_rescued} />
              <StatTile icon={<Ban className="size-4" aria-hidden />} label="Dropouts caught" value={s.dropouts_caught} sub="Re-matched or covered" />
              <StatTile icon={<LifeBuoy className="size-4" aria-hidden />} label="Backups promoted" value={s.backups_promoted} sub="Took over instantly" />
              <StatTile icon={<MessageSquareText className="size-4" aria-hidden />} label="Replies understood" value={s.replies_understood} sub="Free text that changed state" />
              <StatTile icon={<Recycle className="size-4" aria-hidden />} label="Sent to fallback" value={s.fallback_count} sub="Animal feed / compost (simulated)" />
              <StatTile icon={<Send className="size-4" aria-hidden />} label="Offers listed" value={s.offers_total} />
            </>
          ) : Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        {/* offers */}
        <section aria-labelledby="offers-title">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="offers-title" className="text-2xl font-semibold tracking-tight text-white">
              Offers in progress <span className="tabular text-white/50">{b ? live.length : ""}</span>
            </h2>
            <Link href="/restaurant" className="text-sm font-medium text-sky hover:underline">List leftover food</Link>
          </div>
          <div className="mt-4 space-y-4">
            {!b ? (
              <LoadingBlock label="Loading offers" />
            ) : live.length === 0 ? (
              <EmptyState icon={<PackageOpen className="size-10" aria-hidden />} title="No offers in progress">
                When a restaurant lists leftover food, it appears here and gets matched live.
              </EmptyState>
            ) : (
              live.map((o) => <OfferCard key={o.id} offer={o} detail={details.data?.[o.id]} now={now} />)
            )}
          </div>

          {finished.length ? (
            <>
              <h2 className="mt-10 flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
                <CircleCheck className="size-5 text-sky" aria-hidden /> Finished
                <span className="tabular text-white/50">{finished.length}</span>
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {finished.map((o) => <OfferCard key={o.id} offer={o} detail={details.data?.[o.id]} now={now} />)}
              </div>
            </>
          ) : null}
        </section>

        {/* recipients + demand */}
        <aside className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
                <Users className="size-5 text-sky" aria-hidden /> Recipients
              </h2>
              {recipients.some((r) => r.reliability.is_simulated_history) ? <SimulatedBadge label="Simulated history" /> : null}
            </div>
            <p className="mt-1 text-sm text-white/65">Ranked by reliability. Dot = likely completion, band = 90% range.</p>
            {!b ? (
              <div className="mt-4 space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : (
              <ol className="mt-4 divide-y divide-white/[0.06]">
                {recipients.map((r, i) => (
                  <li key={r.id} className="py-3.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate font-medium text-white">
                        <span className="tabular mr-2 text-white/45">{i + 1}</span>{r.name}
                      </p>
                      <Link href={`/collector/${r.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-sky hover:underline">
                        <Inbox className="size-3.5" aria-hidden /> Inbox
                      </Link>
                    </div>
                    <ReliabilityBar recipient={r} />
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-xl font-semibold tracking-tight text-white">Demand board</h2>
            <p className="mt-1 text-sm text-white/65">What homes have asked for today. Food is only offered against these.</p>
            {!b ? (
              <div className="mt-4 space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : activeDemands.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-white/70">No open needs right now.</p>
            ) : (
              <ul className={cx("mt-2 divide-y divide-white/[0.06]")}>
                {activeDemands.map((d) => <DemandRow key={d.id} d={d} />)}
              </ul>
            )}
            {doneDemands > 0 ? <p className="mt-2 text-xs text-white/60">{doneDemands} earlier needs fulfilled or expired.</p> : null}
          </Card>
        </aside>
      </div>
    </main>
  );
}
