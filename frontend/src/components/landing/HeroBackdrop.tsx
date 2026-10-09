"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "../motion";
import { Landscape } from "./Landscape";

/**
 * Interactive hero background: the dusk landscape in parallax (scroll + pointer), drifting mist,
 * twinkling sky dots, and a cursor spotlight that reveals a dot grid.
 * One rAF loop writes CSS variables on the hero section (no React re-renders):
 *   --px/--py pointer (-1..1, eased), --sy scroll (px), --mx/--my spotlight (px), --tilt product frame.
 */
export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host || reduced) return;

    let tx = 0, ty = 0, px = 0, py = 0;
    let mx = host.clientWidth / 2, my = 260, smx = mx, smy = my;
    let raf = 0;

    const frame = () => {
      raf = 0;
      px += (tx - px) * 0.07;
      py += (ty - py) * 0.07;
      smx += (mx - smx) * 0.18;
      smy += (my - smy) * 0.18;
      const sy = Math.min(window.scrollY, 1400);
      host.style.setProperty("--px", px.toFixed(4));
      host.style.setProperty("--py", py.toFixed(4));
      host.style.setProperty("--sy", sy.toFixed(1));
      host.style.setProperty("--mx", `${smx.toFixed(1)}px`);
      host.style.setProperty("--my", `${smy.toFixed(1)}px`);
      host.style.setProperty("--tilt", `${Math.max(0, 9 - sy * 0.03).toFixed(2)}deg`);
      if (Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001 || Math.abs(mx - smx) > 0.5 || Math.abs(my - smy) > 0.5) {
        raf = requestAnimationFrame(frame);
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      if (e.clientY > r.bottom) return;
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
      kick();
    };

    kick();
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", kick);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden>
      <Landscape variant="dusk" parallax className="absolute inset-x-0 top-0 h-[1000px] w-full" />
      {/* cursor spotlight: a soft blue glow and a dot grid that only shows near the pointer */}
      {!reduced ? (
        <>
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(520px circle at var(--mx, 50%) var(--my, 260px), rgb(0 153 255 / 0.10), transparent 65%)" }}
          />
          <div
            className="dot-field absolute inset-0 opacity-90"
            style={{
              maskImage: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 260px), black, transparent 75%)",
              WebkitMaskImage: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 260px), black, transparent 75%)",
            }}
          />
        </>
      ) : null}
      <div className="absolute inset-x-0 top-0 h-[520px] bg-linear-to-b from-navy via-navy/80 to-transparent" />
      <div className="absolute inset-x-0 top-[760px] h-[480px] bg-linear-to-b from-transparent to-navy" />
    </div>
  );
}
