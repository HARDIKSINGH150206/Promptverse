import type { LucideIcon } from "lucide-react";
import {
  Ban, BellRing, CheckCheck, CircleCheck, CircleDashed, CircleDot, CircleX, ClockAlert, Hourglass, PackageCheck,
  Recycle, Search, ShieldCheck, TimerOff, UserMinus, Users,
} from "lucide-react";
import type { AssignmentStatus, DemandStatus, OfferStatus } from "@/lib/api/types";
import { cx } from "@/lib/cx";

/**
 * Four-colour status language. Never colour-only: every tone has an icon and a text label.
 *   good    solid blue    (collected, fulfilled)
 *   info    blue tint     (accepted, confirmed, on standby)
 *   warn    orange outline (needs attention: reconfirm asked, standby asked)
 *   bad     solid orange  (dropouts: cancelled, no response, expired)
 *   neutral navy tint     (offered, matching)
 *   muted   dashed, faded (declined, released, fallback)
 */
export type Tone = "good" | "info" | "warn" | "bad" | "neutral" | "muted";

export const TONE_CLASS: Record<Tone, string> = {
  good: "bg-blue text-white border-blue",
  info: "bg-blue/10 text-blue border-blue/25",
  warn: "bg-white text-navy border-orange",
  bad: "bg-orange text-navy border-orange",
  neutral: "bg-navy/[0.07] text-navy border-navy/15",
  muted: "bg-transparent text-navy/60 border-dashed border-navy/30",
};

type Spec = { label: string; tone: Tone; icon: LucideIcon };

const ASSIGNMENT: Record<AssignmentStatus, Spec> = {
  offered: { label: "Offered", tone: "neutral", icon: CircleDot },
  accepted: { label: "Accepted", tone: "info", icon: CircleCheck },
  reconfirm_sent: { label: "Reconfirm asked", tone: "warn", icon: BellRing },
  confirmed: { label: "Confirmed", tone: "info", icon: CheckCheck },
  declined: { label: "Declined", tone: "muted", icon: CircleX },
  cancelled: { label: "Cancelled", tone: "bad", icon: Ban },
  no_response: { label: "No response", tone: "bad", icon: ClockAlert },
  collected: { label: "Collected", tone: "good", icon: PackageCheck },
  standby_requested: { label: "Standby asked", tone: "warn", icon: Hourglass },
  on_standby: { label: "On standby", tone: "info", icon: ShieldCheck },
  released: { label: "Released", tone: "muted", icon: UserMinus },
};

const OFFER: Record<OfferStatus, Spec> = {
  open: { label: "Open", tone: "neutral", icon: CircleDashed },
  matching: { label: "Matching", tone: "neutral", icon: Search },
  assigned: { label: "Assigned", tone: "info", icon: Users },
  collected: { label: "Collected", tone: "good", icon: PackageCheck },
  partially_collected: { label: "Partly collected", tone: "warn", icon: PackageCheck },
  fallback: { label: "Fallback", tone: "muted", icon: Recycle },
  expired: { label: "Expired", tone: "bad", icon: TimerOff },
};

const DEMAND: Record<DemandStatus, Spec> = {
  open: { label: "Open", tone: "neutral", icon: CircleDashed },
  partially_matched: { label: "Part matched", tone: "info", icon: CircleDot },
  matched: { label: "Matched", tone: "info", icon: CircleCheck },
  fulfilled: { label: "Fulfilled", tone: "good", icon: PackageCheck },
  expired: { label: "Expired", tone: "muted", icon: TimerOff },
};

type Props =
  | { kind: "assignment"; status: AssignmentStatus; size?: "sm" | "md" | "lg"; className?: string }
  | { kind: "offer"; status: OfferStatus; size?: "sm" | "md" | "lg"; className?: string }
  | { kind: "demand"; status: DemandStatus; size?: "sm" | "md" | "lg"; className?: string };

export function statusSpec(p: Pick<Props, "kind" | "status">): Spec {
  if (p.kind === "assignment") return ASSIGNMENT[p.status as AssignmentStatus];
  if (p.kind === "offer") return OFFER[p.status as OfferStatus];
  return DEMAND[p.status as DemandStatus];
}

export function StatusChip(props: Props) {
  const spec = statusSpec(props) ?? { label: props.status, tone: "neutral" as Tone, icon: CircleDot };
  const Icon = spec.icon;
  const size = props.size ?? "md";
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap",
        size === "sm" && "px-2 py-0.5 text-xs",
        size === "md" && "px-2.5 py-1 text-[13px]",
        size === "lg" && "px-3.5 py-1.5 text-base",
        TONE_CLASS[spec.tone],
        props.className,
      )}
    >
      <Icon className={size === "lg" ? "size-4.5" : "size-3.5"} aria-hidden />
      {spec.label}
    </span>
  );
}
