import { ArrowRight } from "lucide-react";
import { Wordmark } from "../Logo";
import { ButtonLink } from "../ui";
import { Landscape } from "./Landscape";
import { Container } from "./shared";
import { Reveal } from "../motion";

export function FinalCta() {
  return (
    <section className="py-24">
      <Container>
        <Reveal y={40}>
        <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 p-8 sm:p-11">
          <Landscape variant="day" className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-navy/60 via-navy/10 to-transparent" aria-hidden />
          <div className="relative flex min-h-[340px] flex-col justify-between gap-10">
            <Wordmark />
            <div className="flex flex-wrap items-end justify-between gap-8">
              <h2 className="display max-w-2xl text-5xl text-white sm:text-6xl">Ready to rescue tonight&apos;s leftovers?</h2>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/restaurant" variant="secondary" size="lg">List leftover food <ArrowRight className="size-4" aria-hidden /></ButtonLink>
                <ButtonLink href="/board" variant="onDark" size="lg">Open Live Board</ButtonLink>
              </div>
            </div>
          </div>
        </div>
        </Reveal>
      </Container>
    </section>
  );
}
