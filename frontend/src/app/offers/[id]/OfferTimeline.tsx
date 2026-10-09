"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, ArrowRightLeft, ClipboardList, MapPin, PackageCheck, Recycle, ShieldAlert, TimerOff,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage, type Assignment, type OfferDetail } from "@/lib/api/types";
import { fmtDuration, fmtTime, fmtTimeDay } from "@/lib/time";
import { useNow } from "@/lib/useNow";
import { usePoll } from "@/lib/usePoll";
import { AssignmentCard } from "@/components/AssignmentCard";
import { Countdown } from "@/components/Countdown";
import { DietTag, MealsBar, dishNames, isFinished, isSimulatedOffer } from "@/components/OfferCard";
import { useToast } from "@/components/providers";
import { RiskMeter } from "@/components/RiskMeter";
import { StatusChip } from "@/components/StatusChip";
import { Timeline } from "@/components/Timeline";
import { Card, EmptyState, ErrorState, LoadingBlock, SimulatedBadge } from "@/components/ui";
import { normalizeOffer } from "@/lib/api/live";
import { useStreamEvent, useStreamStatus } from "@/lib/stream";

/** Primaries in offer order, each standby right after the pickup it covers. */
function orderAssignments(list: Assignment[]): Assignment[] {
  const primaries = list.filter((a) => !a.is_standby);
  const out: Assignment[] = [];
  for (const p of primaries) {
    out.push(p);
    out.push(...list.filter((s) => s.is_standby && s.standby_for_assignment_id === p.id));
  }
  for (const a of list) if (!out.includes(a)) out.push(a);
  return out;
}

function Outcome({ offer }: { offer: OfferDetail }) {
  const promoted = [...offer.timeline].reverse().find((e) => e.type === "standby_promoted");
  const fallback = [...offer.timeline].reverse().find((e) => e.type === "fallback");
  const collectedAt = offer.assignments
    .filter((a) => a.status === "collected" && a.collected_at)
    .map((a) => Date.parse(a.collected_at!))
    .sort((x, y) => y - x)[0];

  return (
    <div className="space-y-3">
      {promoted ? (
        <div className="flex items-start gap-4 rounded-card bg-orange p-5 text-navy animate-pop sm:p-6" role="status">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-raised text-white animate-pulse-ring">
            <ArrowRightLeft className="size-6" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em]">Dropout caught · backup took over at {fmtTime(promoted.at)}</p>
            <p className="mt-1 text-xl font-semibold sm:text-2xl">{promoted.message}</p>
          </div>
        </div>
      ) : null}

      {offer.status === "collected" && collectedAt ? (
        <div className="flex items-center gap-4 rounded-card bg-emerald p-5 text-navy animate-pop sm:p-6" role="status">
          <PackageCheck className="size-10 shrink-0" aria-hidden />
          <p className="text-xl font-semibold sm:text-2xl">
            All {offer.meal_count} meals collected{" "}
            {Date.parse(offer.safe_until) >= collectedAt
              ? `with ${fmtDuration((Date.parse(offer.safe_until) - collectedAt) / 60000)} to spare.`
              : `${fmtDuration((collectedAt - Date.parse(offer.safe_until)) / 60000)} after the safe window.`}
          </p>
        </div>
      ) : null}

      {(offer.status === "fallback" || offer.status === "partially_collected" || offer.status === "expired") ? (
        <div className="flex items-start gap-4 rounded-card border border-dashed border-white/25 bg-panel p-5 text-white" role="status">
          {offer.status === "expired" ? <TimerOff className="size-8 shrink-0 text-orange" aria-hidden /> : <Recycle className="size-8 shrink-0 text-sky" aria-hidden />}
          <div>
            <p className="text-lg font-semibold">
              {offer.status === "partially_collected"
                ? `${offer.meals_collected} of ${offer.meal_count} meals collected; the rest had a recorded outcome.`
                : offer.status === "expired" ? "Safe window closed." : "Nobody could reach it in time, so it went to a fallback."}
            </p>
            {fallback ? <p className="mt-1 text-white/80">{fallback.message}</p> : null}
            <SimulatedBadge className="mt-2" label="Partner simulated" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OfferTimeline() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const now = useNow();
  const streaming = useStreamStatus() === "live";
  const poll = usePoll(() => api.getOffer(id), streaming ? 15000 : 2000, id);
  useStreamEvent<{ offer: OfferDetail }>("offer", (d) => {
    if (d.offer.id === id) poll.setData(normalizeOffer(d.offer));
  });
  const [skipping, setSkipping] = useState<string | null>(null);
  const offer = poll.data;

  async function skip(assignmentId: string) {
    setSkipping(assignmentId);
    try {
      poll.setData(await api.demoFastForward(assignmentId));
    } catch (err) {
      toast(errorMessage(err), err instanceof ApiError && err.code === "INVALID_TRANSITION" ? "info" : "error");
      void poll.refresh();
    } finally {
      setSkipping(null);
    }
  }

  if (!offer) {
    return (
      <main className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8">
        {poll.error ? (
          poll.error instanceof ApiError && poll.error.status === 404
            ? <EmptyState title="Offer not found">It may have been cleared by a demo reset. <Link className="font-semibold text-sky" href="/board">Back to the Live Board</Link></EmptyState>
            : <ErrorState error={poll.error} onRetry={poll.refresh} />
        ) : <LoadingBlock label="Loading offer" />}
      </main>
    );
  }

  const finished = isFinished(offer);
  const names = new Map(offer.assignments.map((a) => [a.id, a.recipient_name]));
  const ordered = orderAssignments(offer.assignments);
  const guardFlag = offer.timeline.find((e) => e.type === "guardrail_flag");
  const anyActive = offer.assignments.some((a) => ["accepted", "reconfirm_sent", "confirmed"].includes(a.status));

  return (
    <main className="mx-auto max-w-[1240px] px-5 py-12 lg:px-8">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm font-medium text-sky hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Live Board
      </Link>

      {/* header */}
      <Card className="mt-4 overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[auto_1fr]">
          {offer.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- backend-served upload
            <img src={offer.photo_url} alt={`Photo of ${dishNames(offer)}`} className="h-56 w-full object-cover md:h-full md:w-64" />
          ) : null}
          <div className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/70">
              <MapPin className="size-4" aria-hidden /> {offer.restaurant_name}
              <span aria-hidden>·</span> listed {fmtTimeDay(offer.created_at, now || undefined)}
              {isSimulatedOffer(offer) ? <SimulatedBadge /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <h1 className="display text-4xl text-white sm:text-5xl">
                <span className="tabular">{offer.meal_count}</span> meals · {dishNames(offer)}
              </h1>
              <StatusChip kind="offer" status={offer.status} size="lg" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/75">
              <DietTag diet={offer.diet} />
              <span>Cooked {fmtTime(offer.cooked_at)}</span>
              <span aria-hidden>·</span>
              <span>Safe until <b className="text-white">{fmtTime(offer.safe_until)}</b></span>
              {offer.pickup_notes ? <><span aria-hidden>·</span><span>Pickup: {offer.pickup_notes}</span></> : null}
            </div>

            <div className="mt-5 grid items-end gap-5 lg:grid-cols-[auto_1fr]">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">{finished ? "Safe window" : "Safe for"}</p>
                {finished ? (
                  <p className="text-2xl font-semibold text-white/65">Ended {fmtTime(offer.safe_until)}</p>
                ) : (
                  <Countdown to={offer.safe_until} size="xl" urgentMins={20} doneText="Window closed" />
                )}
              </div>
              <MealsBar offer={offer} large />
            </div>
          </div>
        </div>
      </Card>

      {guardFlag ? (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-orange/60 bg-orange/[0.06] px-4 py-3 text-[15px] text-white">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-orange" aria-hidden /> {guardFlag.message}
        </p>
      ) : null}

      <div className="mt-4"><Outcome offer={offer} /></div>

      {!finished && anyActive ? (
        <Card className="mt-4 p-5">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto]">
            <RiskMeter pFail={offer.risk.highest_p_fail} threshold={offer.risk.threshold} label="Highest failure risk" />
            <p className="text-sm font-semibold text-white/80 md:max-w-xs">
              {offer.risk.standby_active
                ? "A backup is involved. If a pickup fails, it takes over instantly."
                : offer.risk.highest_p_fail > offer.risk.threshold
                  ? "Risk is above the threshold. Looking for a backup."
                  : "Risk is below the threshold. No backup needed yet."}
            </p>
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="assignments-title">
          <h2 id="assignments-title" className="text-2xl font-semibold tracking-tight text-white">Who it went to</h2>
          {ordered.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<ClipboardList className="size-10" aria-hidden />} title="No one offered yet">
                The engine is waiting for a home whose need matches this food. The timeline explains why.
              </EmptyState>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {ordered.map((a) => (
                <AssignmentCard
                  key={a.id}
                  a={a}
                  coversName={a.standby_for_assignment_id ? names.get(a.standby_for_assignment_id) : undefined}
                  threshold={offer.risk.threshold}
                  onSkip={finished ? undefined : () => void skip(a.id)}
                  skipping={skipping === a.id}
                />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="timeline-title">
          <Card className="p-5 sm:p-6">
            <h2 id="timeline-title" className="text-2xl font-semibold tracking-tight text-white">Timeline</h2>
            <p className="mt-1 text-sm text-white/65">Every decision, in order, with its reason. Times in IST.</p>
            <div className="mt-5"><Timeline events={offer.timeline} /></div>
          </Card>
        </section>
      </div>
    </main>
  );
}
