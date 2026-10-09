"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { FlaskConical, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { errorMessage } from "@/lib/api/types";
import { cx } from "@/lib/cx";

export { cx };

type Variant = "primary" | "secondary" | "outline" | "quiet" | "onDark";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  // orange is the one CTA colour; navy text keeps it readable
  primary: "bg-orange text-navy hover:bg-orange/90 active:bg-orange/80",
  secondary: "bg-blue text-white hover:bg-blue/90 active:bg-blue/80",
  outline: "border border-blue/30 bg-white text-blue hover:border-blue hover:bg-blue/5",
  quiet: "text-blue hover:bg-blue/10",
  onDark: "border border-white/25 text-white hover:border-white/60 hover:bg-white/10",
};
const SIZE: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-xl px-3 text-sm",
  md: "h-11 gap-2 rounded-2xl px-5 text-[15px]",
  lg: "h-14 gap-2.5 rounded-2xl px-7 text-lg",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string): string {
  return cx(
    "inline-flex select-none items-center justify-center font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-45",
    VARIANT[variant], SIZE[size], extra,
  );
}

export function Button({
  variant = "primary", size = "md", busy = false, className, children, disabled, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button {...rest} disabled={disabled || busy} aria-busy={busy || undefined} className={buttonClass(variant, size, className)}>
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary", size = "md", className, ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...rest} className={buttonClass(variant, size, className)} />;
}

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div {...rest} className={cx("rounded-card border border-navy/10 bg-white", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("text-xs font-bold uppercase tracking-[0.14em] text-blue", className)}>{children}</p>;
}

export function PageHeader({
  eyebrow, title, description, actions,
}: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-base text-navy/70">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Seeded or simulated data must always say so. */
export function SimulatedBadge({ className, label = "Simulated" }: { className?: string; label?: string }) {
  return (
    <span
      title="Seeded demo data, not real-world records"
      className={cx(
        "inline-flex items-center gap-1 rounded-full border border-dashed border-navy/35 px-2 py-0.5",
        "text-[11px] font-bold uppercase tracking-wider text-navy/70",
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden />
      {label}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-navy/60" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-navy/[0.06]", className)} aria-hidden />;
}

export function LoadingBlock({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-3" aria-busy>
      <Spinner label={label} />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-20" />)}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-navy/20 px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-blue/70">{icon}</div> : null}
      <p className="text-base font-semibold text-navy">{title}</p>
      {children ? <div className="mt-1 max-w-sm text-sm text-navy/65">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-3 rounded-2xl border-2 border-orange bg-white text-navy",
        compact ? "p-3 text-sm" : "p-4",
      )}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-orange" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Couldn&apos;t load this</p>
        <p className="text-navy/75">{errorMessage(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/** Inline field-level label used in forms. */
export function FieldLabel({ children, htmlFor, missing }: { children: ReactNode; htmlFor?: string; missing?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-navy">
      {children}
      {missing ? (
        <span className="rounded-full bg-orange px-2 py-px text-[11px] font-bold uppercase tracking-wide text-navy">Missing</span>
      ) : null}
    </label>
  );
}

/** Input styling without a width, for inputs sized by their flex/grid parent. */
export const inputBase = cx(
  "rounded-2xl border border-navy/20 bg-white px-4 py-3 text-navy placeholder:text-navy/40",
  "outline-none transition-colors focus:border-blue focus:ring-2 focus:ring-blue/20",
);

export const inputClass = `${inputBase} w-full`;

export function missingRing(missing: boolean): string {
  return missing ? "border-orange! ring-2 ring-orange/30" : "";
}
