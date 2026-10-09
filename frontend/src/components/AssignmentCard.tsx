"use client";

import Link from "next/link";
import { FastForward, Inbox, LifeBuoy, MapPin, PackageCheck } from "lucide-react";
import type { Assignment } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { Countdown } from "./Countdown";
import { DemoControl } from "./DemoControl";
import { RiskMeter } from "./RiskMeter";
import { SelectionNote } from "./SelectionNote";
import { StatusChip } from "./StatusChip";
import { UnderstoodCard } from "./UnderstoodCard";
import { cx } from "./ui";

const ACTIVE = ["accepted", "reconfirm_sent", "confirmed"];
const INACTIVE = ["declined", "cancelled", "no_response", "released"];
export const FAST_FORWARDABLE = ["offered", "standby_requested", "reconfirm_sent", "accepted"];

/** The deadline that matters right now for this assignment. */
export function activeDeadline(a: Assignment): { to: string; label: string } | null {
  if (a.status === "offered") return { to: a.respond_by, label: "Reply within" };
  if (a.status === "standby_requested") return { to: a.respond_by, label: "Answer within" };
  if (a.status === "reconfirm_sent" && a.reconfirm_by) return { to: a.reconfirm_by, label: "Reconfirm within" };
  return null;
}

export function AssignmentCard({
  a, coversName, threshold, onSkip, skipping,
}: {
  a: Assignment;
  coversName?: string;
  threshold: number;
  onSkip?: () => void;
  skipping?: boolean;
}) {
  const deadline = activeDeadline(a);
  const inactive = INACTIVE.includes(a.status);
  const active = ACTIVE.includes(a.status);

  return (
    <article
      className={cx(
        "flex flex-col rounded-card border bg-panel p-5",
        a.status === "collected" ? "border-2 border-sky/60" : a.is_standby ? "border-2 border-dashed border-orange" : "border-line",
        inactive && "self-start opacity-65",
      )}
    >
      {a.is_standby ? (
        <p className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-orange px-2.5 py-1 text-xs font-medium text-navy">
          <LifeBuoy className="size-3.5" aria-hidden />
          Backup{coversName ? ` for ${coversName}` : ""}
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-white">{a.recipient_name}</h3>
          <p className="tabular mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-white/70">
            <span className="font-semibold text-white">{a.meals} meals</span>
            <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{a.distance_km} km</span>
            <span>reliability {pct(a.reliability_at_assignment)}</span>
          </p>
        </div>
        <StatusChip kind="assignment" status={a.status} />
      </div>

      <div className="mt-3 space-y-1">
        {deadline ? <Countdown to={deadline.to} label={deadline.label} urgentMins={0.5} doneText="Deadline passed" /> : null}
        {active && a.eta_promised ? <p className="text-sm text-white/80">Promised arrival around <b className="text-white">{fmtTime(a.eta_promised)}</b></p> : null}
        {a.status === "collected" && a.collected_at ? (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-sky"><PackageCheck className="size-4" aria-hidden /> Collected at {fmtTime(a.collected_at)}</p>
        ) : null}
      </div>

      {!inactive ? <SelectionNote selection={a.selection} className="mt-3" /> : null}

      {!a.is_standby && active ? (
        <RiskMeter className="mt-4" pFail={a.p_fail} threshold={threshold} />
      ) : null}

      {a.last_reply ? <UnderstoodCard understood={a.last_reply} compact className="mt-4" /> : null}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <Link href={`/collector/${a.recipient_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-sky hover:underline">
          <Inbox className="size-4" aria-hidden /> Open inbox
        </Link>
        {onSkip && FAST_FORWARDABLE.includes(a.status) ? (
          <DemoControl onClick={onSkip} busy={skipping} icon={<FastForward className="size-4" aria-hidden />} title="Moves this assignment's active deadline to now">
            Skip wait
          </DemoControl>
        ) : null}
      </div>
    </article>
  );
}
