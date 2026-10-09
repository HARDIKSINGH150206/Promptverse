import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Reveal } from "../motion";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1240px] px-5 lg:px-8", className)}>{children}</div>;
}

/** Section headline; rises into view as it scrolls in. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Reveal y={28}>
      <h2 className={cx("display text-4xl text-white sm:text-5xl lg:text-[3.5rem]", className)}>{children}</h2>
    </Reveal>
  );
}

export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Reveal delay={120}>
      <p className={cx("max-w-xl text-lg leading-relaxed text-white/55", className)}>{children}</p>
    </Reveal>
  );
}

/** Small mono caption, used for "Example" and data labels. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11px] tracking-[0.12em] text-white/40 uppercase", className)}>{children}</span>;
}

