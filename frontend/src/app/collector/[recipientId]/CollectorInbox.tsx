"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Ban, CircleCheck, CircleX, ExternalLink, Inbox, LifeBuoy, MapPin, PackageCheck, ShieldCheck, ThumbsDown, Truck,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage, type AssignmentAction, type AssignmentStatus, type InboxEntry } from "@/lib/api/types";
import { fmtTime } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { activeDeadline } from "@/components/AssignmentCard";
import { Countdown } from "@/components/Countdown";
import { DietTag, dishNames } from "@/components/OfferCard";
import { useToast } from "@/components/providers";
import { ReliabilityBar } from "@/components/ReliabilityBar";
import { ReplyBox } from "@/components/ReplyBox";
import { StatusChip } from "@/components/StatusChip";
import { Button, Card, EmptyState, ErrorState, LoadingBlock, SimulatedBadge } from "@/components/ui";

type Btn = { action: AssignmentAction; label: string; icon: LucideIcon; variant: "primary" | "secondary" | "outline" };

/** Buttons per status: exactly the transitions the backend allows (contract §5). */
const BUTTONS: Partial<Record<AssignmentStatus, Btn[]>> = {
  offered: [
    { action: "accept", label: "Accept", icon: CircleCheck, variant: "primary" },
    { action: "decline", label: "Decline", icon: CircleX, variant: "outline" },
  ],
  accepted: [
    { action: "collected", label: "Collected", icon: PackageCheck, variant: "secondary" },
    { action: "cancel", label: "Cancel", icon: Ban, variant: "outline" },
  ],
  reconfirm_sent: [
    { action: "reconfirm", label: "Still coming", icon: Truck, variant: "primary" },
    { action: "cancel", label: "Cancel", icon: Ban, variant: "outline" },
  ],
  confirmed: [
    { action: "collected", label: "Collected", icon: PackageCheck, variant: "primary" },
    { action: "cancel", label: "Cancel", icon: Ban, variant: "outline" },
  ],
  standby_requested: [
    { action: "standby_accept", label: "I can stand by", icon: ShieldCheck, variant: "primary" },
    { action: "standby_decline", label: "Not today", icon: ThumbsDown, variant: "outline" },
  ],
};

const DONE_TOAST: Record<AssignmentAction, string> = {
  accept: "Accepted. We'll ask you to reconfirm shortly.",
  decline: "Declined. We'll offer it to someone else.",
  reconfirm: "Thanks. Marked as still coming.",
  cancel: "Cancelled. A backup or another home will take over.",
  collected: "Marked as collected. Thank you!",
  standby_accept: "You're on standby. We'll tell you if you're needed.",
  standby_decline: "No problem. We'll ask someone else.",
};

function prompt(e: InboxEntry): string {
  switch (e.status) {
    case "offered": return `Can you collect ${e.meals} meals?`;
    case "accepted": return "You accepted. We'll ask you to reconfirm shortly.";
    case "reconfirm_sent": return "Are you still coming?";
    case "confirmed": return "Confirmed. Tap Collected once you have the food.";
    case "standby_requested": return `Can you stand by as a backup for ${e.meals} meals?`;
    case "on_standby": return "You're on standby. If the first collector drops out, the pickup becomes yours instantly.";
    default: return "";
  }
}

function EntryCard({ e, onChanged }: { e: InboxEntry; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<AssignmentAction | null>(null);
  const deadline = activeDeadline(e);
  const buttons = BUTTONS[e.status] ?? [];

  async function act(action: AssignmentAction) {
    setBusy(action);
    try {
      await api.assignmentAction(e.id, action);
      toast(DONE_TOAST[action], "success");
    } catch (err) {
      toast(errorMessage(err), err instanceof ApiError && err.code === "INVALID_TRANSITION" ? "info" : "error");
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  return (
    <Card className={e.is_standby ? "border-2 border-dashed border-orange! p-5" : "p-5"}>
      {e.is_standby ? (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-orange px-2.5 py-1 text-xs font-bold text-navy">
          <LifeBuoy className="size-3.5" aria-hidden /> Backup request
        </p>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy/65">
            <MapPin className="size-3.5" aria-hidden /> {e.offer.restaurant_name} · {e.distance_km} km
          </p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">
            <span className="tabular">{e.meals}</span> meals · {dishNames(e.offer)}
          </h2>
        </div>
        <StatusChip kind="assignment" status={e.status} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-navy/70">
        <DietTag diet={e.offer.diet} />
        <span>Safe until <b className="text-navy">{fmtTime(e.offer.safe_until)}</b></span>
        {e.offer.pickup_notes ? <span>· {e.offer.pickup_notes}</span> : null}
      </div>

      <div className="mt-4 rounded-2xl bg-navy/[0.04] p-4">
        <p className="text-lg font-bold text-navy">{prompt(e)}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {deadline ? <Countdown to={deadline.to} label={deadline.label} urgentMins={0.5} doneText="Deadline passed" /> : null}
          <Countdown to={e.offer.safe_until} label="Food safe for" size="sm" />
        </div>
        {buttons.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {buttons.map((b) => (
              <Button
                key={b.action}
                variant={b.variant}
                size="lg"
                className="w-full px-3"
                busy={busy === b.action}
                disabled={busy !== null}
                onClick={() => void act(b.action)}
              >
                {busy === b.action ? null : <b.icon className="size-5" aria-hidden />}
                {b.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <ReplyBox assignmentId={e.id} onDone={onChanged} disabled={busy !== null} />
      </div>
    </Card>
  );
}

export function CollectorInbox() {
  const { recipientId } = useParams<{ recipientId: string }>();
  const poll = usePoll(() => api.collectorInbox(recipientId), 2000, recipientId);
  const inbox = poll.data;

  if (!inbox) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        {poll.error ? (
          poll.error instanceof ApiError && poll.error.status === 404
            ? <EmptyState title="Recipient not found"><Link className="font-semibold text-blue" href="/recipient">Choose your home</Link></EmptyState>
            : <ErrorState error={poll.error} onRetry={poll.refresh} />
        ) : <LoadingBlock label="Loading inbox" />}
      </main>
    );
  }

  const r = inbox.recipient;
  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-10">
      <div className="rounded-card bg-navy p-5 text-white">
        <p className="flex items-center gap-2 text-sm font-semibold text-white/75">
          <Inbox className="size-4" aria-hidden /> Web inbox · updates every 2 s
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{r.name}</h1>
        <p className="text-white/70">{r.area}</p>
        <div className="mt-4 rounded-2xl bg-white p-3">
          <ReliabilityBar recipient={r} compact />
          {r.reliability.is_simulated_history ? <SimulatedBadge className="mt-2" label="Simulated history" /> : null}
        </div>
        <p className="mt-3 text-sm text-white/70">
          {r.telegram_linked ? "Telegram is linked too; both stay in sync." : "Works without Telegram."}{" "}
          <Link href="/recipient" className="inline-flex items-center gap-1 font-semibold text-white underline-offset-2 hover:underline">
            Post a new need <ExternalLink className="size-3" aria-hidden />
          </Link>
        </p>
      </div>

      {poll.error ? <div className="mt-4"><ErrorState error={poll.error} onRetry={poll.refresh} compact /></div> : null}

      <div className="mt-6 space-y-4">
        {inbox.assignments.length === 0 ? (
          <EmptyState icon={<Inbox className="size-10" aria-hidden />} title="Nothing waiting for you right now">
            New offers and backup requests appear here the moment they&apos;re sent. Keep this page open.
          </EmptyState>
        ) : (
          inbox.assignments.map((e) => <EntryCard key={e.id} e={e} onChanged={() => void poll.refresh()} />)
        )}
      </div>
    </main>
  );
}
