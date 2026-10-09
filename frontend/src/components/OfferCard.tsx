"use client";

import Link from "next/link";
import { ChevronRight, Drumstick, Leaf, LifeBuoy, MapPin } from "lucide-react";
import type { Offer, OfferDetail } from "@/lib/api/types";
import { fmtTimeDay } from "@/lib/time";
import { Countdown } from "./Countdown";
import { RiskMeter } from "./RiskMeter";
import { StatusChip } from "./StatusChip";
import { EventTag } from "./Timeline";
import { SimulatedBadge, cx } from "./ui";

export const TERMINAL_OFFER = ["collected", "partially_collected", "fallback", "expired"] as const;
export const isFinished = (o: Offer) => (TERMINAL_OFFER as readonly string[]).includes(o.status);
export const isSimulatedOffer = (o: Offer) => !!o.raw_transcript?.toLowerCase().startsWith("(simulated)");
export const dishNames = (o: Offer) => o.items.map((i) => i.name).filter(Boolean).join(", ") || "Cooked food";

export function DietTag({ diet, className }: { diet: "veg" | "nonveg"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", diet === "veg" ? "border-sky/30 text-sky" : "border-orange text-white", className)}>
      {diet === "veg" ? <Leaf className="size-3" aria-hidden /> : <Drumstick className="size-3" aria-hidden />}
      {diet === "veg" ? "Veg" : "Non-veg"}
    </span>
  );
}

/** Collected / assigned / unassigned, as one bar with a text legend. */
export function MealsBar({ offer, large }: { offer: Offer; large?: boolean }) {
  const total = Math.max(1, offer.meal_count);
  const collected = Math.min(offer.meals_collected, offer.meal_count);
  const assigned = Math.max(0, Math.min(offer.meals_assigned - collected, offer.meal_count - collected));
  const open = Math.max(0, offer.meal_count - collected - assigned);
  const label = `${collected} collected, ${assigned} assigned, ${open} unassigned of ${offer.meal_count} meals`;
  return (
    <div>
      <div role="img" aria-label={label} className={cx("flex w-full overflow-hidden rounded-full bg-white/[0.06]", large ? "h-4" : "h-3")}>
        <div className="bg-sky transition-[width] duration-700" style={{ width: `${(collected / total) * 100}%` }} />
        <div className="bg-sky/35 transition-[width] duration-700" style={{ width: `${(assigned / total) * 100}%` }} />
      </div>
      <p className={cx("tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-white/75", large ? "text-sm" : "text-xs")}>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky" aria-hidden />{collected} collected</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-sky/35" aria-hidden />{assigned} assigned</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-white/15" aria-hidden />{open} unassigned</span>
      </p>
    </div>
  );
}

export function OfferCard({ offer, detail, now }: { offer: Offer; detail?: OfferDetail; now: number }) {
  const finished = isFinished(offer);
  const last = detail?.timeline[detail.timeline.length - 1];
  const showRisk = !finished && detail && detail.assignments.some((a) => ["accepted", "reconfirm_sent", "confirmed"].includes(a.status));

  return (
    <Link
      href={`/offers/${offer.id}`}
      className={cx(
        "group block rounded-card border bg-panel p-5 transition-colors hover:border-white/25",
        finished ? "border-line" : "border-line",
        offer.status === "collected" && "border-l-2 border-l-emerald/70",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white/70">
            <MapPin className="size-3.5" aria-hidden />
            {offer.restaurant_name}
            {isSimulatedOffer(offer) ? <SimulatedBadge /> : null}
          </p>
          <h3 className={cx("mt-1 font-semibold tracking-tight text-white", finished ? "text-lg" : "text-xl sm:text-2xl")}>
            <span className="tabular">{offer.meal_count}</span> meals · {dishNames(offer)}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <DietTag diet={offer.diet} />
          <StatusChip kind="offer" status={offer.status} />
        </div>
      </div>

      <div className="mt-4"><MealsBar offer={offer} /></div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {finished ? (
          <span className="text-sm text-white/65">Safe window ended {fmtTimeDay(offer.safe_until, now || undefined)}</span>
        ) : (
          <Countdown to={offer.safe_until} label="Safe for" showClock />
        )}
        {detail?.risk.standby_active && !finished ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange px-2.5 py-1 text-xs font-medium text-white">
            <LifeBuoy className="size-3.5 text-orange" aria-hidden /> Backup on standby
          </span>
        ) : null}
      </div>

      {showRisk && detail ? (
        <RiskMeter className="mt-4" compact pFail={detail.risk.highest_p_fail} threshold={detail.risk.threshold} label="Highest failure risk" />
      ) : null}

      {last && !finished ? (
        <div key={last.id} className="mt-4 flex items-start gap-2 rounded-2xl bg-white/[0.03] px-3 py-2.5 animate-enter">
          <EventTag type={last.type} className="mt-0.5 shrink-0" />
          <p className="line-clamp-2 text-sm text-white">{last.message}</p>
        </div>
      ) : null}

      <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky">
        Open timeline <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
