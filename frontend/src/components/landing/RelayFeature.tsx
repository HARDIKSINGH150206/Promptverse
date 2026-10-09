"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { cx } from "@/lib/cx";
import { ButtonLink } from "../ui";
import { Container, Mono, RelayRings, SectionTitle } from "./shared";

/** Illustrative example of one offer moving through the relay (not live data; labelled "Example"). */
const STAGES = [
  {
    tab: "Understand the note",
    body: "Say it the way you'd tell a friend, in English, Hindi or both. The language model turns it into an editable offer.",
    card: { title: "Voice note", big: "4", unit: "sec", foot: "From voice note to a structured offer",
      steps: [["Heard the voice note", "1s"], ["Found 40 plates of veg biryani", "1s"], ["Read \"safe till 10\" as 10:00 pm", "1s"], ["Asked nothing: every field was there", "1s"]] },
  },
  {
    tab: "Double-check safety",
    body: "Laya, a decision model, gives probabilities for diet and food safety. It can only add a confirmation step, never skip one.",
    card: { title: "Laya guardrail", big: "97", unit: "% veg", foot: "Plus a 3-point safety checklist, every time",
      steps: [["Diet reads as vegetarian", "97%"], ["Safety concern", "6%"], ["Restaurant confirmed diet", "Yes"], ["Kept covered, hot, untouched", "3/3"]] },
  },
  {
    tab: "Choose who collects",
    body: "Only homes that already asked for this food. Ranked by a Bayesian estimate of who shows up, with its uncertainty.",
    card: { title: "Matching", big: "2", unit: "homes", foot: "Split by need, ranked by reliability",
      steps: [["Hope Shelter, 18 of 20 pickups", "20"], ["Sunrise Elders Home, 12 of 12", "20"], ["Saathi NGO skipped: veg only", "—"], ["Both accepted", "2 min"]] },
  },
  {
    tab: "Ready a backup",
    body: "When a reply like \"stuck in traffic\" pushes failure risk past 25%, a backup stands by. If the first home drops out, it takes over instantly.",
    card: { title: "Risk model", big: "81", unit: "% risk", foot: "Backup took over with 38 min to spare",
      steps: [["\"Traffic is really bad\": running late", "90%"], ["Sunrise asked to stand by", "0s"], ["Hope went silent at reconfirm", "30s"], ["Sunrise took over all 20 meals", "0s"]] },
  },
] as const;

const ROTATE_MS = 6000;

export function RelayFeature() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % STAGES.length);
      setCycle((c) => c + 1);
    }, ROTATE_MS);
    return () => clearTimeout(t);
  }, [active, cycle]);
  const stage = STAGES[active];

  return (
    <section id="how" className="scroll-mt-20 py-24">
      <Container>
        <SectionTitle>
          Everything between a full kitchen
          <br className="hidden sm:block" /> and a full plate
        </SectionTitle>

        <div className="relative mt-14 overflow-hidden rounded-[1.4rem] border border-line bg-blue">
          <div className="dot-field absolute inset-0 opacity-50" aria-hidden />
          <RelayRings className="absolute top-1/2 left-1/2 h-[1200px] w-[1200px] -translate-x-1/2 -translate-y-1/2" />
          <div className="relative flex min-h-[460px] items-center justify-center px-5 py-16">
            <div key={active} className="w-full max-w-sm rounded-2xl bg-white p-5 text-navy shadow-[0_30px_80px_-30px_rgb(0_0_0/0.55)] animate-pop">
              <div className="flex items-center justify-between">
                <p className="text-[15px] text-navy/65">{stage.card.title}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue/25 bg-blue/[0.07] px-2.5 py-0.5 text-xs font-medium text-blue">
                  <span className="size-1.5 rounded-full bg-blue" aria-hidden />
                  Example
                </span>
              </div>
              <p className="mt-1.5">
                <span className="text-4xl font-semibold tracking-tight tabular">{stage.card.big}</span>
                <span className="ml-1 text-navy/45">{stage.card.unit}</span>
              </p>
              <ul className="mt-4 space-y-2.5">
                {stage.card.steps.map(([label, v]) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    <CircleCheck className="size-4 shrink-0 fill-blue text-white" aria-hidden />
                    <span className="flex-1">{label}</span>
                    <span className="tabular font-mono text-xs text-navy/50">{v}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-navy/10 pt-3 text-[13px] text-navy/55">{stage.card.foot}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-4" role="tablist" aria-label="How the relay works">
          {STAGES.map((st, i) => (
            <button
              key={st.tab}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => {
                setActive(i);
                setCycle((c) => c + 1);
              }}
              className="group flex flex-col self-start text-left"
            >
              <span className="relative block h-px w-full bg-white/10">
                {i === active ? (
                  <span
                    key={cycle}
                    className="absolute inset-y-0 left-0 bg-white"
                    style={{ animation: `grow ${ROTATE_MS}ms linear forwards` }}
                  />
                ) : null}
              </span>
              <span className={cx("mt-5 block text-[15px] transition-colors", i === active ? "text-white" : "text-white/45 group-hover:text-white/70")}>{st.tab}</span>
              <span className={cx("mt-3 block text-[15px] leading-relaxed text-white/55 transition-opacity", i === active ? "opacity-100" : "opacity-0 md:opacity-0")}>
                {i === active ? st.body : null}
              </span>
            </button>
          ))}
        </div>
        <style>{"@keyframes grow { from { width: 0 } to { width: 100% } }"}</style>

        <div className="mt-10 flex flex-wrap items-center gap-6">
          <ButtonLink href="/restaurant" variant="onDark">
            List leftover food <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
          <Link href="/board" className="text-[15px] text-white/70 transition-colors hover:text-white">Watch it live on the board</Link>
          <Mono className="ml-auto hidden md:inline">Illustrative example · the board shows real runs</Mono>
        </div>
      </Container>
    </section>
  );
}
