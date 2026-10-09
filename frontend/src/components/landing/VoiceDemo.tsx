import { ArrowRight, Copy, Leaf, Mic } from "lucide-react";
import { cx } from "@/lib/cx";
import { ButtonLink } from "../ui";
import { Container, Lede, Mono, SectionTitle } from "./shared";

type Tok = string | { t: string; k: "num" | "food" | "time" | "place" };

const LINES: Tok[][] = [
  ["Hi, this is Koramangala Kitchen."],
  ["We have around ", { t: "40 plates", k: "num" }, " of ", { t: "veg biryani", k: "food" }, ","],
  ["and some ", { t: "raita", k: "food" }, ", made at ", { t: "7", k: "time" }, "."],
  ["It's safe till ", { t: "10", k: "time" }, ", kept covered and hot."],
  ["Please pick up from the ", { t: "back gate", k: "place" }, "."],
  [],
  ["बाकी खाना भी है, अगर किसी को चाहिए।"],
];

const TOKEN: Record<string, string> = {
  num: "text-orange", food: "text-sky", time: "text-white underline decoration-sky/50 underline-offset-4", place: "text-white/90 italic",
};

const FIELDS = [
  ["Items", "Veg biryani, Raita"],
  ["Meals", "40"],
  ["Cooked at", "7:00 pm"],
  ["Safe until", "10:00 pm"],
  ["Pickup", "Back gate"],
] as const;

/** Like the reference's code + response demo: a voice note and what the AI understood. */
export function VoiceDemo() {
  return (
    <section className="py-24">
      <Container>
        <SectionTitle>
          Say it like you&apos;d tell a friend.
          <br className="hidden sm:block" /> We&apos;ll fill in the form.
        </SectionTitle>
        <Lede className="mt-6">
          Voice notes in English, Hindi or a mix become a structured offer. You review every field before anything is sent.
        </Lede>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/restaurant" variant="onDark">Try it: list food <ArrowRight className="size-4" aria-hidden /></ButtonLink>
          <ButtonLink href="/recipient" variant="outline">Post a need</ButtonLink>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {/* "editor" */}
          <div className="rounded-[1.25rem] border border-line bg-panel p-2">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-raised px-2.5 py-1 font-mono text-[12px] text-white/85">
                <Mic className="size-3 text-orange" aria-hidden /> voice-note.txt
              </span>
              <span className="font-mono text-[12px] text-white/35">en-IN + hi-IN</span>
              <Copy className="ml-auto size-4 text-white/30" aria-hidden />
            </div>
            <div className="rounded-xl border border-white/[0.05] bg-navy py-3 font-mono text-[13.5px] leading-[1.9]">
              {LINES.map((line, i) => (
                <div key={i} className={cx("flex gap-5 px-4", i === 1 && "bg-white/[0.03]")}>
                  <span className="w-4 shrink-0 text-right text-white/25 select-none">{i + 1}</span>
                  <span className="text-white/70">
                    {line.map((tok, j) => typeof tok === "string" ? <span key={j}>{tok}</span> : <span key={j} className={TOKEN[tok.k]}>{tok.t}</span>)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-3 py-2 font-mono text-[11px] text-white/35">
              <span>Speech-to-text · editable</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-sky" aria-hidden />Example</span>
            </div>
          </div>

          {/* "response" */}
          <div className="flex flex-col rounded-[1.25rem] border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <p className="font-medium text-white">Understood</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-white/50"><span className="size-1.5 rounded-full bg-sky" aria-hidden />LLM + Laya</span>
            </div>
            <dl className="flex-1 divide-y divide-white/[0.05] px-5">
              {FIELDS.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-3 text-[15px]">
                  <dt className="text-white/50">{k}</dt>
                  <dd className="text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="grid grid-cols-3 border-t border-white/[0.06]">
              {[
                ["Diet", <span key="d" className="inline-flex items-center gap-1.5"><Leaf className="size-4 text-sky" aria-hidden />Veg 97%</span>],
                ["Safety concern", "6%"],
                ["Missing fields", "None"],
              ].map(([k, v]) => (
                <div key={k as string} className="px-5 py-4">
                  <p className="text-sm text-white/45">{k}</p>
                  <p className="mt-1 text-lg text-white">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Mono className="mt-4 block text-right">Illustrative example</Mono>
      </Container>
    </section>
  );
}
