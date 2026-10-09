import Link from "next/link";
import {
  ArrowRight, BrainCircuit, Cpu, Dices, Gauge, ListChecks, MonitorPlay, Store, Users,
} from "lucide-react";
import { HubPreview } from "@/components/HubPreview";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { cx } from "@/lib/cx";

const TILES = [
  {
    href: "/restaurant", icon: Store, title: "Restaurant",
    line: "Say what's left. Add a photo, a safe-until time and tick the safety checklist.",
    cta: "List leftover food",
  },
  {
    href: "/recipient", icon: Users, title: "Recipient",
    line: "Shelters, homes and NGOs say what they need today, by voice.",
    cta: "Post today's need",
  },
  {
    href: "/board", icon: MonitorPlay, title: "Live Board",
    line: "Watch every offer get matched, watched for risk, and collected in time.",
    cta: "Open the board",
    dark: true,
  },
] as const;

const AI_STEPS = [
  {
    icon: Cpu, who: "Generative LLM", title: "Understand",
    body: "Turns messy voice notes in mixed languages into structured offers and needs.",
    acts: "No. You review and confirm every field.",
  },
  {
    icon: BrainCircuit, who: "Laya decision model", title: "Double-check",
    body: "Gives probabilities for diet and food-safety concerns, and for what a free-text reply means.",
    acts: "No. It can only add a confirmation step.",
  },
  {
    icon: Dices, who: "Bayesian reliability", title: "Choose who",
    body: "Ranks collectors by how likely they are to show up, with honest uncertainty. New shelters get a fair chance when time allows.",
    acts: "Yes. Deterministic, logged and explained.",
  },
  {
    icon: Gauge, who: "Risk model", title: "Call a backup",
    body: "Watches each pickup. When failure risk passes 25%, a backup stands by before anyone drops out.",
    acts: "Yes. Deterministic, logged and explained.",
  },
  {
    icon: ListChecks, who: "Plain, tested code", title: "Hard rules",
    body: "Deadlines, safety windows, matching rules and fallbacks.",
    acts: "AI never makes these calls alone.",
  },
] as const;

export default function Home() {
  return (
    <main>
      {/* hero */}
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-12 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-sm font-semibold text-white/85">
              <span className="size-2 rounded-full bg-orange" aria-hidden />
              Food rescue, relayed
            </p>
            <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Leftover food, matched to people who need it,{" "}
              <span className="text-orange">collected before it spoils.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/75">
              AnnaRelay offers restaurant leftovers only to shelters that already said what they need, picks the collector
              most likely to show up, and puts a backup on standby before anyone drops out.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/restaurant" size="lg">
                List leftover food <ArrowRight className="size-5" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/board" variant="onDark" size="lg">
                <MonitorPlay className="size-5" aria-hidden /> Watch the Live Board
              </ButtonLink>
            </div>
          </div>
          <HubPreview />
        </div>
      </section>

      {/* three roles */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Eyebrow>Start here</Eyebrow>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Who are you today?</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TILES.map((t) => {
            const dark = "dark" in t && t.dark;
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cx(
                  "group flex min-h-60 flex-col rounded-[1.5rem] p-7 transition-colors",
                  dark ? "bg-blue text-white hover:bg-blue/95" : "border border-navy/10 bg-white hover:border-blue",
                )}
              >
                <span className={cx("flex size-14 items-center justify-center rounded-2xl", dark ? "bg-white text-blue" : "bg-blue/10 text-blue")}>
                  <Icon className="size-7" aria-hidden />
                </span>
                <h3 className="mt-6 text-2xl font-extrabold">{t.title}</h3>
                <p className={cx("mt-2 text-base", dark ? "text-white/80" : "text-navy/70")}>{t.line}</p>
                <span className={cx("mt-auto inline-flex items-center gap-1.5 pt-6 font-bold", dark ? "text-white" : "text-blue")}>
                  {t.cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* where the AI is */}
      <section className="border-t border-navy/10 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <Eyebrow>Where the AI is (and isn&apos;t)</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-3xl font-extrabold tracking-tight">
            Every decision shows its confidence and its source.
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {AI_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="relative flex flex-col rounded-[1.25rem] border border-navy/10 bg-mist p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-navy text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="tabular text-sm font-bold text-navy/35">0{i + 1}</span>
                  </div>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wider text-blue">{s.who}</p>
                  <h3 className="mt-1 text-xl font-extrabold">{s.title}</h3>
                  <p className="mt-2 text-sm text-navy/70">{s.body}</p>
                  <p className="mt-auto pt-4 text-sm">
                    <span className="font-bold">Acts alone?</span> <span className="text-navy/75">{s.acts}</span>
                  </p>
                </li>
              );
            })}
          </ol>
          <p className="mt-6 text-sm text-navy/60">
            We claim one demo metric: the share of offers collected within their safe window. Laya&apos;s probabilities
            aren&apos;t guaranteed to be calibrated, so every threshold leans cautious.
          </p>
        </div>
      </section>
    </main>
  );
}
