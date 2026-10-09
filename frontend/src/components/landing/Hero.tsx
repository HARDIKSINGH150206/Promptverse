"use client";

import Link from "next/link";
import {
  ArrowRight, Bell, ChevronLeft, Gauge, Inbox, LifeBuoy, MapPin, MessageSquareText, MonitorPlay, PackageCheck,
  Store, Target, Users,
} from "lucide-react";
import type { Board } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { cx } from "@/lib/cx";
import { Logo } from "../Logo";
import { ReliabilityBar } from "../ReliabilityBar";
import { ButtonLink, Skeleton } from "../ui";
import { HeroBackdrop } from "./HeroBackdrop";
import { Container } from "./shared";

const FINISHED = ["collected", "partially_collected", "fallback", "expired"];

/** The product frame under the hero: a light window onto the real Live Board data. */
function ProductFrame({ board }: { board: Board | null }) {
  const s = board?.stats;
  const recipients = board ? [...board.recipients].sort((a, b) => b.reliability.total - a.reliability.total) : [];
  const offers = board?.offers.slice(0, 5) ?? [];
  const live = board?.offers.filter((o) => !FINISHED.includes(o.status)).length ?? 0;
  const SLOTS = 16;
  const recent = board?.offers.slice(0, SLOTS).reverse().map((o) => o.meal_count) ?? [];
  const bars = [...Array.from({ length: Math.max(0, SLOTS - recent.length) }, () => 0), ...recent];
  const maxBar = Math.max(1, ...bars);
  const finished = board?.offers.filter((o) => FINISHED.includes(o.status)).length ?? 0;

  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-white/20 bg-snow text-navy shadow-[0_40px_120px_-30px_rgb(0_0_0/0.8)]">
      <div className="grid lg:grid-cols-[208px_1fr]">
        {/* sidebar */}
        <aside className="hidden border-r border-navy/[0.08] bg-mist p-4 lg:block">
          <div className="flex items-center gap-2.5">
            <Logo className="size-8" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">AnnaRelay</p>
              <p className="text-[11px] text-navy/50">Food relay</p>
            </div>
          </div>
          <p className="mt-6 px-2 text-[11px] text-navy/45">Main</p>
          <nav className="mt-1.5 space-y-0.5 text-[13px]">
            {[
              { href: "/board", label: "Live Board", icon: MonitorPlay, active: true },
              { href: "/restaurant", label: "Restaurant", icon: Store },
              { href: "/recipient", label: "Recipients", icon: Users },
              { href: "/collector/rc_hope", label: "Inbox", icon: Inbox, count: live || undefined },
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors",
                  n.active ? "bg-navy text-white" : "text-navy/75 hover:bg-navy/[0.05]",
                )}
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
                {n.count ? <span className="ml-auto rounded-md bg-navy/[0.07] px-1.5 text-[11px] text-navy/60">{n.count}</span> : null}
              </Link>
            ))}
          </nav>
          <p className="mt-6 px-2 text-[11px] text-navy/45">Recent offers</p>
          <ul className="mt-1.5 space-y-0.5 border-l border-navy/10 pl-2.5 text-[12.5px] text-navy/65">
            {offers.length
              ? offers.map((o) => (
                <li key={o.id} className="truncate py-1">
                  <Link href={`/offers/${o.id}`} className="hover:text-navy">{o.meal_count} meals · {o.items.map((i) => i.name).join(", ") || "Cooked food"}</Link>
                </li>
              ))
              : Array.from({ length: 4 }, (_, i) => <li key={i}><Skeleton className="my-1 h-3.5 bg-navy/[0.06]!" /></li>)}
          </ul>
          <div className="mt-6 rounded-xl border border-zinc bg-snow p-2.5">
            <p className="text-[12.5px] font-medium">Koramangala Kitchen</p>
            <p className="text-[11px] text-navy/50">Restaurant · simulated</p>
          </div>
        </aside>

        {/* main */}
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-lg border border-navy/10 px-2.5 py-1 text-[13px] font-medium">
              <ChevronLeft className="size-3.5" aria-hidden /> Live Board
            </span>
            <span className="inline-flex items-center gap-2 text-[12px] text-navy/55">
              <Bell className="size-3.5" aria-hidden />
              {board ? `${fmtTime(board.server_time)} IST` : "—"}
            </span>
          </div>

          <div className="mt-4 rounded-2xl border border-navy/[0.08] bg-mist p-5">
            <p className="text-[12px] font-medium text-blue">Tonight</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">Every offer, collected in time</p>
            <p className="mt-1.5 max-w-md text-[13px] text-navy/60">
              Matched only to homes that asked, ranked by who is most likely to show up, with a backup ready before anyone drops out.
            </p>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr_1.15fr]">
            <div className="rounded-2xl border border-navy/[0.08] p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-medium"><Target className="size-3.5 text-blue" aria-hidden />Collected in safe window</p>
              <p className="mt-0.5 text-[11px] text-navy/45">Finished offers</p>
              {s ? <p className="mt-3 text-[2rem] leading-none font-semibold tracking-tight tabular">{pct(s.share_collected_within_window)}</p> : <Skeleton className="mt-3 h-8 w-20 bg-navy/[0.06]!" />}
              <p className="mt-1.5 text-[11.5px] text-blue">{s ? `${s.offers_collected_within_window} of ${finished} on time` : " "}</p>
              <div className="mt-4 flex h-10 items-end gap-1" aria-hidden>
                {Array.from({ length: Math.max(finished, 1) }, (_, i) => (
                  <span key={i} className={cx("flex-1 rounded-sm", i < (s?.offers_collected_within_window ?? 0) ? "h-full bg-blue" : "h-1/3 bg-orange")} />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-navy/[0.08] p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-medium"><PackageCheck className="size-3.5 text-blue" aria-hidden />Meals rescued</p>
              <p className="mt-0.5 text-[11px] text-navy/45">All offers</p>
              {s ? <p className="mt-3 text-[2rem] leading-none font-semibold tracking-tight tabular">{s.meals_rescued}</p> : <Skeleton className="mt-3 h-8 w-16 bg-navy/[0.06]!" />}
              <div className="mt-3 flex h-10 items-end gap-1" aria-hidden>
                {bars.map((m, i, arr) => (
                  <span key={i} className={cx("flex-1 rounded-sm", m === 0 ? "bg-navy/[0.06]" : i === arr.length - 1 ? "bg-navy" : "bg-navy/20")} style={{ height: `${m === 0 ? 10 : Math.max(18, (m / maxBar) * 100)}%` }} />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-navy/[0.08]">
              <p className="flex items-center gap-1.5 px-4 pt-4 text-[13px] font-medium"><MapPin className="size-3.5 text-blue" aria-hidden />Homes by reliability</p>
              <ul className="mt-2 divide-y divide-navy/[0.06]">
                {(recipients.length ? recipients.slice(0, 3) : []).map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <p className="mb-1 text-[12.5px] font-medium">{r.name}</p>
                    <ReliabilityBar recipient={r} compact light />
                  </li>
                ))}
                {!recipients.length ? Array.from({ length: 3 }, (_, i) => <li key={i} className="px-4 py-2.5"><Skeleton className="h-8 bg-navy/[0.06]!" /></li>) : null}
              </ul>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: LifeBuoy, label: "Backups promoted", v: s?.backups_promoted },
              { icon: Gauge, label: "Dropouts caught", v: s?.dropouts_caught },
              { icon: MessageSquareText, label: "Replies understood", v: s?.replies_understood },
              { icon: MonitorPlay, label: "Offers in progress", v: board ? live : undefined },
            ].map((q) => (
              <div key={q.label} className="flex items-center gap-3 rounded-2xl border border-navy/[0.08] p-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-mist text-blue"><q.icon className="size-4" aria-hidden /></span>
                <div>
                  <p className="text-[15px] leading-tight font-semibold tabular">{q.v ?? "—"}</p>
                  <p className="text-[11px] text-navy/50">{q.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero({ board }: { board: Board | null }) {
  const s = board?.stats;
  return (
    <section className="relative overflow-hidden">
      <HeroBackdrop />
      <Container className="relative pt-20 sm:pt-28">
        <div className="mx-auto max-w-5xl text-center">
          <Link
            href="/board"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3.5 pl-1 text-sm text-white/80 transition-colors hover:border-white/25"
          >
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-navy">Live</span>
            {s ? `${s.meals_rescued} meals rescued, ${s.backups_promoted} backups promoted` : "A backup on standby before anyone drops out"}
          </Link>
          <h1 className="display mt-8 text-5xl text-white sm:text-6xl lg:text-[4.6rem]">
            Leftover food,
            <br />
            collected before it spoils
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            Restaurants say what&apos;s left. Shelters say what they need. AnnaRelay picks the collector most likely to show up
            and readies a backup before anyone drops out.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <ButtonLink href="/restaurant" size="lg">
              List leftover food <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <div className="flex items-center gap-3 text-left">
              <Target className="size-5 text-orange" aria-hidden />
              <p className="text-sm leading-tight text-white/55">
                <span className="tabular font-medium text-white">{s ? pct(s.share_collected_within_window) : "—"}</span> collected in the safe window
                <br />
                across finished offers (incl. simulated)
              </p>
            </div>
          </div>
        </div>

        {/* settles from a slight tilt to flat as you scroll (var set by HeroBackdrop) */}
        <div
          className="relative mx-auto mt-16 max-w-[1104px] sm:mt-20"
          style={{ transform: "perspective(1600px) rotateX(var(--tilt, 0deg))", transformOrigin: "50% 0%" }}
        >
          <ProductFrame board={board} />
        </div>
      </Container>
    </section>
  );
}
