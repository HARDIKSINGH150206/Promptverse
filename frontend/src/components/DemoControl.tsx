"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "@/lib/cx";

/** Buttons that bend time or state for the demo. Always labelled "Demo control". */
export function DemoControl({
  onClick, busy, disabled, icon, children, title, className,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={cx(
        "inline-flex items-center gap-2.5 rounded-xl border border-dashed border-white/25 bg-white/[0.02] px-3 py-1.5 text-left",
        "transition-colors hover:border-white/50 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      <span className="text-sky">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="font-mono text-[9.5px] tracking-[0.14em] text-white/45 uppercase">Demo control</span>
        <span className="text-[13px] font-medium text-white">{children}</span>
      </span>
    </button>
  );
}
