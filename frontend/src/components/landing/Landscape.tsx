import { useId } from "react";
import { cx } from "@/lib/cx";

// Original landscape artwork (no photos): layered mountain ridges from seeded noise, mist and a field.
// Deterministic, so server and client render the same paths.

const W = 1440;
const H = 900;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A mountain ridge: linear interpolation between random peaks (sharp summits) plus a fine jitter octave. */
function ridge(seed: number, base: number, amp: number, step: number): string {
  const r = rng(seed);
  const coarse = Array.from({ length: Math.ceil((W + 192) / step) + 2 }, () => r());
  const fine = Array.from({ length: Math.ceil((W + 192) / (step / 4)) + 2 }, () => r());
  const at = (arr: number[], t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  };
  const OVER = 96;
  let d = `M${-OVER} ${H + OVER}`;
  for (let x = -OVER; x <= W + OVER; x += 8) {
    const t = (x + OVER) / step;
    const v = at(coarse, t) * 0.82 + at(fine, (x + OVER) / (step / 4)) * 0.18;
    d += ` L${x} ${(base - amp * v).toFixed(1)}`;
  }
  return `${d} L${W + OVER} ${H + OVER} Z`;
}

// Peaks stay below y≈380 so wide, short panels (which keep the bottom of the art) never crop a summit.
const RIDGES = {
  far: ridge(3, 610, 230, 150),
  mid: ridge(7, 690, 180, 125),
  near: ridge(11, 770, 130, 110),
  forest: ridge(19, 850, 70, 55),
};

// Faint sky dots for the dusk scene (deterministic).
const STARS = (() => {
  const r = rng(97);
  return Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * 420, s: 0.6 + r() * 1.1, d: r() * 4 }));
})();

/** Parallax offset for a layer: driven by CSS variables a parent sets (--px pointer, --sy scroll). */
const layer = (pointer: number, scroll: number) => ({
  transform: `translate(calc(var(--px, 0) * ${pointer}px), calc(var(--sy, 0) * ${scroll}px))`,
});

const PALETTE = {
  day: {
    sky: ["#7fb1dc", "#bcd7ec", "#e4eef6"],
    far: ["#f6f9fc", "#b9cfe3"],
    mid: ["#c6d9ea", "#8fb0cf"],
    near: ["#8fb0cf", "#5f86ae"],
    forest: ["#4d7299", "#2f4f72"],
    mist: 0.55,
    field: ["#e3cd4f", "#b9a83c"],
  },
  dusk: {
    sky: ["#0a0a0a", "#0f1620", "#1e2c3c"],
    far: ["#3b5068", "#22303f"],
    mid: ["#2a3a4c", "#18222e"],
    near: ["#1b2632", "#10161d"],
    forest: ["#121920", "#0b0f13"],
    mist: 0.08,
    field: ["#4a4218", "#2a2510"],
  },
} as const;

export function Landscape({
  variant = "day", parallax = false, className,
}: { variant?: "day" | "dusk"; parallax?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  const p = PALETTE[variant];
  const L = (pointer: number, scroll: number) => (parallax ? layer(pointer, scroll) : undefined);
  const g = (name: string) => `${id}-${name}`;
  const grad = (name: string, [a, b]: readonly [string, string], y1 = 0.35) => (
    <linearGradient id={g(name)} x1="0" y1={y1} x2="0" y2="1">
      <stop offset="0" stopColor={a} />
      <stop offset="1" stopColor={b} />
    </linearGradient>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className={cx("pointer-events-none", className)} aria-hidden>
      <defs>
        <linearGradient id={g("sky")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.55" stopColor={p.sky[1]} />
          <stop offset="1" stopColor={p.sky[2]} />
        </linearGradient>
        {grad("far", p.far, 0.2)}
        {grad("mid", p.mid)}
        {grad("near", p.near)}
        {grad("forest", p.forest)}
        <linearGradient id={g("field")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={p.field[0]} />
          <stop offset="1" stopColor={p.field[1]} stopOpacity="0" />
        </linearGradient>
        <filter id={g("blur")} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>

      <rect x={-96} y={-96} width={W + 192} height={H + 192} fill={`url(#${g("sky")})`} />
      {variant === "dusk" ? (
        <g style={L(-3, 0.22)}>
          {STARS.map((st, i) => (
            <circle key={i} cx={st.x} cy={st.y} r={st.s} fill="#F2EFE9" className={parallax ? "animate-blink" : undefined} opacity={0.5} style={{ animationDelay: `${st.d}s` }} />
          ))}
        </g>
      ) : null}
      {variant === "day" ? <circle cx={1150} cy={300} r={170} fill="#ffffff" opacity={0.35} filter={`url(#${g("blur")})`} /> : null}

      <g style={L(-6, 0.18)}>
        <path d={RIDGES.far} fill={`url(#${g("far")})`} />
      </g>
      <g className={parallax ? "animate-mist" : undefined}>
        <ellipse cx={720} cy={610} rx={900} ry={60} fill="#ffffff" opacity={p.mist * 0.7} filter={`url(#${g("blur")})`} />
      </g>
      <g style={L(-12, 0.13)}>
        <path d={RIDGES.mid} fill={`url(#${g("mid")})`} />
      </g>
      <g className={parallax ? "animate-mist-slow" : undefined}>
        <ellipse cx={400} cy={690} rx={700} ry={55} fill="#ffffff" opacity={p.mist * 0.8} filter={`url(#${g("blur")})`} />
        <ellipse cx={1200} cy={715} rx={600} ry={50} fill="#ffffff" opacity={p.mist * 0.6} filter={`url(#${g("blur")})`} />
      </g>
      <g style={L(-20, 0.08)}>
        <path d={RIDGES.near} fill={`url(#${g("near")})`} />
      </g>
      <g className={parallax ? "animate-mist" : undefined}>
        <ellipse cx={800} cy={800} rx={900} ry={45} fill="#ffffff" opacity={p.mist * 0.7} filter={`url(#${g("blur")})`} />
      </g>
      <g style={L(-30, 0.03)}>
        <path d={RIDGES.forest} fill={`url(#${g("forest")})`} />
        <path d={`M-96 ${H + 96} L-96 862 Q 420 842 860 ${H + 96} Z`} fill={`url(#${g("field")})`} />
      </g>
    </svg>
  );
}
