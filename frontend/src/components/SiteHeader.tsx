"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MonitorPlay, Store, Users } from "lucide-react";
import { API_MODE } from "@/lib/api/client";
import { useHealth } from "./providers";
import { Logo } from "./Logo";
import { SimulatedBadge, cx } from "./ui";

const NAV = [
  { href: "/restaurant", label: "Restaurant", icon: Store },
  { href: "/recipient", label: "Recipient", icon: Users },
  { href: "/board", label: "Live Board", icon: MonitorPlay },
] as const;

const WORD: Record<string, string> = {
  ready: "ready", mock: "mock", missing_key: "no key", unavailable: "unavailable",
};

/** "LLM: ready · Laya: ready", straight from GET /api/health. Mock sources are shown honestly. */
export function AiStatusPill({ className }: { className?: string }) {
  const { health, error } = useHealth();
  const dot = (s: string | undefined) => (s === "ready" ? "bg-white" : s === "mock" ? "border border-white/70" : "bg-orange");
  if (error && !health) {
    return (
      <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-orange px-3 py-1 text-xs font-semibold text-white", className)}>
        <span className="size-2 rounded-full bg-orange" aria-hidden />
        Server offline
      </span>
    );
  }
  return (
    <span
      className={cx("inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white sm:gap-2.5 sm:px-3 sm:text-xs", className)}
      title="AI status reported by the backend"
    >
      {health ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-2 rounded-full", dot(health.llm))} aria-hidden />
            LLM: {WORD[health.llm] ?? health.llm}
          </span>
          <span className="text-white/40" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-2 rounded-full", dot(health.laya))} aria-hidden />
            Laya: {WORD[health.laya] ?? health.laya}
          </span>
        </>
      ) : (
        <span className="text-white/70">Checking AI…</span>
      )}
    </span>
  );
}

function ModeBadge() {
  if (API_MODE === "live") return null;
  return (
    <span
      className="block rounded-full bg-orange px-2.5 py-1 text-[11px] font-bold whitespace-nowrap uppercase tracking-wider text-navy"
      title={API_MODE === "mock" ? "Running on the in-browser mock backend" : "Some endpoint groups use the mock backend"}
    >
      {API_MODE === "mock" ? "Mock mode" : "Mixed mode"}
    </span>
  );
}

function NavItems({ path, mobile }: { path: string | null; mobile?: boolean }) {
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = !!path && (path === href || path.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex items-center rounded-xl font-semibold transition-colors",
              mobile ? "shrink-0 gap-1.5 px-3 py-1.5 text-sm" : "gap-2 px-3 py-2 text-sm",
              active ? "bg-white text-navy" : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}

/** Reads the URL, so it streams in after prerendering (dynamic routes). */
function ActiveNav({ mobile }: { mobile?: boolean }) {
  return <NavItems path={usePathname()} mobile={mobile} />;
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-navy text-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-xl" aria-label="AnnaRelay home">
          <Logo className="size-9" />
          <span className="text-lg font-extrabold tracking-tight">AnnaRelay</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
          <Suspense fallback={<NavItems path={null} />}>
            <ActiveNav />
          </Suspense>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <AiStatusPill />
          <span className="hidden lg:block">
            <SimulatedBadge label="Simulated data" className="border-white/40! text-white/85!" />
          </span>
          <span className="hidden sm:block"><ModeBadge /></span>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 md:hidden" aria-label="Main">
        <Suspense fallback={<NavItems path={null} mobile />}>
          <ActiveNav mobile />
        </Suspense>
        <span className="ml-auto shrink-0 self-center sm:hidden"><ModeBadge /></span>
      </nav>
    </header>
  );
}
