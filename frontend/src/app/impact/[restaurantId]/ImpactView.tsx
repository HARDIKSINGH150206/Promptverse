"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, PackageCheck, Recycle, Send, Target } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { StatTile } from "@/components/StatTile";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, SimulatedBadge } from "@/components/ui";

export function ImpactView() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const poll = usePoll(() => api.impact(restaurantId), 10000, restaurantId);
  const card = poll.data;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/restaurant" className="inline-flex items-center gap-1.5 text-sm font-bold text-blue hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Restaurant
      </Link>
      {!card ? (
        <div className="mt-6">
          {poll.error ? (
            poll.error instanceof ApiError && poll.error.status === 404
              ? <EmptyState title="Restaurant not found" />
              : <ErrorState error={poll.error} onRetry={poll.refresh} />
          ) : <LoadingBlock label="Loading impact" />}
        </div>
      ) : (
        <>
          <div className="mt-4">
            <PageHeader
              eyebrow="Impact"
              title={card.restaurant_name}
              description={card.period_label}
              actions={card.is_simulated ? <SimulatedBadge label="Includes simulated history" /> : null}
            />
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <StatTile
              hero
              className="sm:col-span-2"
              icon={<Target className="size-5" aria-hidden />}
              label="Collected within safe window"
              value={pct(card.share_collected_within_window)}
              sub="Share of finished offers collected before they stopped being safe"
            />
            <StatTile icon={<PackageCheck className="size-4" aria-hidden />} label="Meals rescued" value={card.meals_rescued} />
            <StatTile icon={<Send className="size-4" aria-hidden />} label="Offers made" value={card.offers_made} />
            <StatTile icon={<Recycle className="size-4" aria-hidden />} label="Sent to fallback" value={card.fallback_count} sub="Animal feed or compost partner (simulated)" />
          </div>
          <p className="mt-6 text-sm text-navy/60">
            This is a demo metric only. We don&apos;t claim real-world waste-reduction numbers.
          </p>
        </>
      )}
    </main>
  );
}
