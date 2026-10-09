"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { cx } from "./ui";

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
        "inline-flex items-center gap-2 rounded-xl border border-dashed border-navy/40 bg-white px-3 py-1.5 text-left",
        "transition-colors hover:border-navy hover:bg-navy/[0.04] disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      <span className="text-blue">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-navy/55">Demo control</span>
        <span className="text-sm font-semibold text-navy">{children}</span>
      </span>
    </button>
  );
}
