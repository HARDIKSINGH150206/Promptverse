import { Dices, Gauge, MessageSquareText, ShieldCheck } from "lucide-react";
import { Container } from "./shared";
import { Reveal } from "../motion";

const FEATURES = [
  { icon: Dices, title: "Reliability with honest uncertainty", body: "Each home gets a probability of showing up and a range. New homes get a fair chance when there's time." },
  { icon: Gauge, title: "A backup before the dropout", body: "When failure risk passes 25%, the next best home is asked to stand by. It takes over instantly if needed." },
  { icon: MessageSquareText, title: "Replies in your own words", body: "\"We can only take 8\" or \"stuck in traffic\" are understood, and act only above 70% confidence." },
  { icon: ShieldCheck, title: "Safety is never skipped", body: "Diet and safety are always confirmed. The AI can make the question louder, never remove it." },
] as const;

export function FeatureRow() {
  return (
    <section className="pb-24">
      <Container className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 110}>
            <f.icon className="size-5 text-sky" aria-hidden />
            <h3 className="mt-5 text-[17px] font-medium text-white">{f.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-white/50">{f.body}</p>
          </Reveal>
        ))}
      </Container>
    </section>
  );
}
