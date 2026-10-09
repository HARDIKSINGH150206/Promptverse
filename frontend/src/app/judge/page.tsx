"use client";

// Projector screen: judges scan the QR, become a shelter on Telegram, and get the live offer on their phone.
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, PhoneCall, QrCode, Smartphone, UserRound } from "lucide-react";
import { isLive } from "@/lib/api/client";
import { API_BASE_URL, getJson } from "@/lib/api/live";
import { useStreamEvent } from "@/lib/stream";
import { usePoll } from "@/lib/usePoll";
import { EmptyState, SimulatedBadge, Skeleton, cx } from "@/components/ui";

interface JudgeInfo {
  enabled: boolean;
  link: string | null;
  qr_svg_url: string | null;
  bot_username: string | null;
  judges: { id: string; name: string; telegram_linked: boolean }[];
}

const STEPS = [
  { icon: QrCode, title: "Scan", body: "Open your phone camera and scan the code." },
  { icon: Smartphone, title: "Tap Start", body: "Telegram opens. You become a shelter 0.8 km from the kitchen." },
  { icon: BellRing, title: "Get the offer", body: "When food is listed on stage, it lands on your phone, as text and a voice note." },
];

export default function JudgePage() {
  const live = isLive("board");
  const info = usePoll(() => (live ? getJson<JudgeInfo>("/api/judge") : Promise.resolve(null)), 3000);
  const refresh = info.refresh;
  // a new judge shows up on the board instantly
  useStreamEvent("board", () => void refresh());
  const [qrLoaded, setQrLoaded] = useState(false);
  const d = info.data;

  if (!live) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <EmptyState title="Judge mode needs the live backend">Set NEXT_PUBLIC_API_MODE=live and link a Telegram bot on the backend.</EmptyState>
      </main>
    );
  }

  return (
    <main className="relative mx-auto max-w-[1240px] px-5 py-10 lg:px-8 lg:py-14">
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[560px] bg-[radial-gradient(50%_60%_at_70%_20%,color-mix(in_srgb,#0099ff_16%,transparent),transparent)]" aria-hidden />
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-sky uppercase">Judge mode · live demo</p>
          <h1 className="display mt-4 text-5xl leading-[1.02] text-white sm:text-7xl">Be the shelter.<br />Get the food.</h1>
          <p className="mt-5 max-w-lg text-lg text-white/65">
            Scan to join as a shelter that needs food tonight. When the restaurant calls AnnaRelay on stage, the AI picks the most reliable collector, and that should be you.
          </p>
          <ol className="mt-8 space-y-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-line bg-panel text-sky"><s.icon className="size-5" aria-hidden /></span>
                <div>
                  <p className="font-medium text-white"><span className="tabular mr-2 text-white/35">0{i + 1}</span>{s.title}</p>
                  <p className="text-white/60">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/call?role=restaurant" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-navy">
              <PhoneCall className="size-4" aria-hidden /> Make the restaurant call
            </Link>
            <Link href="/board" className="inline-flex items-center gap-2 rounded-full border border-line px-5 py-3 font-semibold text-white">
              Live Board <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative rounded-[2rem] bg-white p-6 shadow-[0_40px_120px_-30px_rgb(0_153_255/0.45)] sm:p-8">
            {d?.qr_svg_url ? (
              <>
                {!qrLoaded ? <Skeleton className="absolute inset-6 rounded-xl bg-navy/10! sm:inset-8" /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from the backend, no optimisation wanted */}
                <img
                  src={`${API_BASE_URL}${d.qr_svg_url}`}
                  alt={`QR code that opens ${d.link}`}
                  className={cx("size-[min(72vw,360px)] transition-opacity duration-500", qrLoaded ? "opacity-100" : "opacity-0")}
                  onLoad={() => setQrLoaded(true)}
                />
              </>
            ) : (
              <div className="flex size-[min(72vw,360px)] items-center justify-center text-center text-navy/70">
                {d && !d.enabled ? "Judge mode needs the Telegram bot running on the backend." : <Skeleton className="size-full rounded-xl bg-navy/10!" />}
              </div>
            )}
          </div>
          {d?.bot_username ? <p className="mt-4 font-mono text-sm text-white/55">t.me/{d.bot_username} · start code JUDGE</p> : null}

          <div className="mt-6 w-full max-w-md rounded-card border border-line bg-panel p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10.5px] tracking-[0.12em] text-white/50 uppercase">Judges joined</p>
              <span className="tabular text-2xl font-medium text-white">{d?.judges.length ?? 0}</span>
            </div>
            {d?.judges.length ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.judges.map((j) => (
                  <li key={j.id} className="flex animate-pop items-center gap-1.5 rounded-full bg-sky/15 px-3 py-1 text-sm text-white">
                    <UserRound className="size-3.5 text-sky" aria-hidden /> {j.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-white/50">Waiting for the first scan…</p>
            )}
            <SimulatedBadge className="mt-3" label="Judge shelters use simulated history" />
          </div>
        </div>
      </div>
    </main>
  );
}
