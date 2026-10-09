import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mx-auto w-full max-w-[1240px] px-5 lg:px-8", className)}>{children}</div>;
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx("display text-4xl text-white sm:text-5xl lg:text-[3.5rem]", className)}>{children}</h2>;
}

export function Lede({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("max-w-xl text-lg leading-relaxed text-white/55", className)}>{children}</p>;
}

/** Small mono caption, used for "Example" and data labels. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[11px] tracking-[0.12em] text-white/40 uppercase", className)}>{children}</span>;
}

/** Flat concentric "relay" rings with a few orbiting stops: depth without gradients or photos. */
export function RelayRings({ className }: { className?: string }) {
  const rings = [120, 210, 300, 390, 480, 570];
  const stops: [number, number][] = [[210, 205], [300, 330], [390, 25], [480, 150], [570, 285], [300, 100]];
  return (
    <svg viewBox="-600 -600 1200 1200" className={cx("pointer-events-none", className)} fill="none" aria-hidden>
      {rings.map((r, i) => (
        <circle key={r} r={r} stroke="#F9F9F9" strokeOpacity={0.07 + (rings.length - i) * 0.012} strokeDasharray={i % 2 ? "3 7" : undefined} />
      ))}
      {stops.map(([r, deg], i) => {
        const a = (deg * Math.PI) / 180;
        return <circle key={i} cx={r * Math.cos(a)} cy={r * Math.sin(a)} r={i === 2 ? 6 : 4} fill={i === 2 ? "#FF6E42" : "#F9F9F9"} fillOpacity={i === 2 ? 1 : 0.5} />;
      })}
    </svg>
  );
}
