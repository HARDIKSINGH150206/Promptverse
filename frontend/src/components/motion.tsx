"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/cx";

// Small, dependency-free motion toolkit. Everything respects "prefers-reduced-motion".

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the visitor asked for less motion (server render: false). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** Element enters the viewport (once by default). */
export function useInView<T extends Element>(options: { once?: boolean; rootMargin?: string; threshold?: number } = {}) {
  const { once = true, rootMargin = "0px 0px -12% 0px", threshold = 0.15 } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);
  return [ref, inView] as const;
}

/** Fades and lifts its children in as they scroll into view. `delay` (ms) staggers siblings. */
export function Reveal({
  children, delay = 0, y = 18, className, style, as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "section" | "li" | "p" | "span";
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLElement>();
  const shown = reduced || inView;
  return (
    <Tag
      ref={ref as never}
      className={cx("transition-[opacity,transform,filter] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform", className)}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translate3d(0, ${y}px, 0)`,
        filter: shown ? "none" : "blur(4px)",
        transitionDelay: shown && !reduced ? `${delay}ms` : "0ms",
      }}
    >
      {children}
    </Tag>
  );
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts up to `value` when visible, and glides to new values when live data changes. */
export function CountUp({
  value, format = (n) => String(Math.round(n)), duration = 1400, className,
}: {
  value: number | null | undefined;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  // start as soon as any part of the number is on screen
  const [ref, inView] = useInView<HTMLSpanElement>({ threshold: 0, rootMargin: "0px" });
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const target = value ?? 0;

  useEffect(() => {
    if (!inView || value === null || value === undefined) return;
    if (reduced) {
      from.current = target;
      const raf = requestAnimationFrame(() => setShown(target));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = begin + (target - begin) * easeOut(t);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [inView, target, value, duration, reduced]);

  return (
    <span ref={ref} className={cx("tabular", className)}>
      {value === null || value === undefined ? "—" : format(shown)}
    </span>
  );
}
