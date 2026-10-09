import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft, Ban, BellRing, CheckCheck, CircleCheck, CircleX, ClockAlert, Compass, Gauge, LifeBuoy,
  MessageSquareText, PackageCheck, PackagePlus, Recycle, Search, Send, ShieldAlert, ShieldCheck, Shuffle, Split,
  StickyNote, TimerOff, UserMinus,
} from "lucide-react";
import type { TimelineEvent, TimelineEventType } from "@/lib/api/types";
import { fmtTime } from "@/lib/time";
import { cx } from "@/lib/cx";

/*
  Event colours from the frontend plan, mapped onto the four-colour palette, each with a text label:
    neutral (offered, accepted)              navy tint
    info    (reply understood, risk, explore) blue tint
    amber   (backup alerted, rematch, split)  orange outline
    red     (no response, cancelled)          solid orange
    green   (standby promoted, collected)     solid blue
    grey    (fallback, released)              dashed, faded
*/
type Cat = "neutral" | "info" | "amber" | "red" | "green" | "grey";

const EVENT: Record<TimelineEventType, { label: string; cat: Cat; icon: LucideIcon }> = {
  offer_created: { label: "Offer listed", cat: "neutral", icon: PackagePlus },
  guardrail_flag: { label: "Safety flag", cat: "amber", icon: ShieldAlert },
  matching_started: { label: "Matching", cat: "neutral", icon: Search },
  offered: { label: "Offered", cat: "neutral", icon: Send },
  exploration: { label: "Exploration", cat: "info", icon: Compass },
  accepted: { label: "Accepted", cat: "neutral", icon: CircleCheck },
  declined: { label: "Declined", cat: "neutral", icon: CircleX },
  reconfirm_sent: { label: "Reconfirm asked", cat: "neutral", icon: BellRing },
  confirmed: { label: "Confirmed", cat: "neutral", icon: CheckCheck },
  cancelled: { label: "Cancelled", cat: "red", icon: Ban },
  no_response: { label: "No response", cat: "red", icon: ClockAlert },
  reply_understood: { label: "Reply understood", cat: "info", icon: MessageSquareText },
  risk_check: { label: "Risk check", cat: "info", icon: Gauge },
  backup_alerted: { label: "Backup alerted", cat: "amber", icon: LifeBuoy },
  standby_ready: { label: "Backup ready", cat: "amber", icon: ShieldCheck },
  standby_promoted: { label: "Backup took over", cat: "green", icon: ArrowRightLeft },
  standby_released: { label: "Backup released", cat: "grey", icon: UserMinus },
  rematch: { label: "Re-matching", cat: "amber", icon: Shuffle },
  split: { label: "Split", cat: "amber", icon: Split },
  collected: { label: "Collected", cat: "green", icon: PackageCheck },
  fallback: { label: "Fallback", cat: "grey", icon: Recycle },
  expired: { label: "Expired", cat: "red", icon: TimerOff },
  note: { label: "Note", cat: "neutral", icon: StickyNote },
};

const DOT: Record<Cat, string> = {
  neutral: "bg-panel text-white/70 border-white/15",
  info: "bg-sky/10 text-sky border-sky/30",
  amber: "bg-panel text-orange border-orange/70",
  red: "bg-orange text-navy border-orange",
  green: "bg-blue text-white border-sky/40",
  grey: "bg-navy text-white/40 border-dashed border-white/20",
};

const TAG: Record<Cat, string> = {
  neutral: "bg-white/[0.06] text-white/75",
  info: "bg-sky/10 text-sky",
  amber: "border border-orange/60 text-white",
  red: "bg-orange text-navy",
  green: "bg-blue text-white",
  grey: "border border-dashed border-white/20 text-white/50",
};

export function eventSpec(type: TimelineEventType) {
  return EVENT[type] ?? EVENT.note;
}

export function EventTag({ type, className }: { type: TimelineEventType; className?: string }) {
  const spec = eventSpec(type);
  const Icon = spec.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap uppercase", TAG[spec.cat], className)}>
      <Icon className="size-3" aria-hidden />
      {spec.label}
    </span>
  );
}

/** Every event as a sentence with its IST time. The backup takeover is unmistakable. */
export function Timeline({ events, highlightId }: { events: TimelineEvent[]; highlightId?: string | null }) {
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const spec = eventSpec(e.type);
        const Icon = spec.icon;
        const climax = e.type === "standby_promoted";
        const last = i === events.length - 1;
        return (
          <li key={e.id} className={cx("relative flex gap-4 pb-5 animate-enter", climax && "py-1")}>
            {!last ? <span className="absolute top-9 bottom-0 left-[17px] w-px bg-white/10" aria-hidden /> : null}
            <span
              className={cx(
                "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border",
                DOT[spec.cat],
                climax && "animate-pulse-ring",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div
              className={cx(
                "min-w-0 flex-1 pt-1",
                climax && "rounded-2xl bg-orange p-4 pt-3 text-navy",
                highlightId === e.id && !climax && "rounded-xl bg-white/[0.04] px-2",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx("tabular font-mono text-[11px]", climax ? "text-navy/70" : "text-white/40")}>{fmtTime(e.at)}</span>
                <EventTag type={e.type} className={climax ? "bg-navy! text-white!" : undefined} />
              </div>
              <p className={cx("mt-1.5 leading-relaxed", climax ? "text-lg font-semibold text-navy" : "text-[15px] text-white/80")}>{e.message}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
