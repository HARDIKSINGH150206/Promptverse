"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, PhoneCall } from "lucide-react";
import { API_MODE } from "@/lib/api/client";
import { useHealth } from "./providers";
import { Wordmark } from "./Logo";
import { ButtonLink, cx } from "./ui";

const NAV = [
  { href: "/call", label: "Call" },
  { href: "/restaurant", label: "Restaurant" },
  { href: "/recipient", label: "Recipient" },
  { href: "/board", label: "Live Board" },
  { href: "/judge", label: "Judge" },
  { href: "/#how", label: "How it works" },
] as const;

const WORD: Record<string, string> = {
  ready: "ready", mock: "mock", missing_key: "no key", unavailable: "offline",
};

/** "LLM ready · Laya ready", straight from GET /api/health. Mock sources are shown honestly. */
export function AiStatusPill({ className }: { className?: string }) {
  const { health, error } = useHealth();
  const dot = (s: string | undefined) =>
    s === "ready" ? "bg-sky" : s === "mock" ? "border border-white/60" : "bg-orange";
  if (error && !health) {
    return (
      <span className={cx("inline-flex items-center gap-1.5 rounded-full border border-orange/60 px-3 py-1 text-xs font-medium text-white", className)}>
        <span className="size-1.5 rounded-full bg-orange" aria-hidden />
        Server offline
      </span>
    );
  }
  return (
    <span
      className={cx("inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-white/75", className)}
      title="AI status reported by the backend"
    >
      {health ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-1.5 rounded-full", dot(health.llm))} aria-hidden />
            LLM {WORD[health.llm] ?? health.llm}
          </span>
          <span className="text-white/25" aria-hidden>/</span>
          <span className="inline-flex items-center gap-1.5">
            <span className={cx("size-1.5 rounded-full", dot(health.laya))} aria-hidden />
            Laya {WORD[health.laya] ?? health.laya}
          </span>
        </>
      ) : (
        <span>Checking AI…</span>
      )}
    </span>
  );
}

function ModeBadge() {
  if (API_MODE === "live") return null;
  return (
    <span
      className="block rounded-full bg-orange px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-navy"
      title={API_MODE === "mock" ? "Running on the in-browser mock backend" : "Some endpoint groups use the mock backend"}
    >
      {API_MODE === "mock" ? "Mock mode" : "Mixed mode"}
    </span>
  );
}

function NavItems({ path, mobile }: { path: string | null; mobile?: boolean }) {
  return (
    <>
      {NAV.map(({ href, label }) => {
        const active = !!path && !href.includes("#") && (path === href || path.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-full text-sm transition-colors",
              mobile ? "shrink-0 px-3 py-1.5" : "px-3.5 py-1.5",
              active ? "bg-white/10 text-white" : "text-white/60 hover:text-white",
            )}
          >
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
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-navy/80 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-[1240px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 lg:px-8">
        <Link href="/" className="justify-self-start rounded-lg" aria-label="AnnaRelay home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <Suspense fallback={<NavItems path={null} />}>
            <ActiveNav />
          </Suspense>
        </nav>

        <div className="col-start-3 flex items-center justify-self-end gap-2">
          <AiStatusPill className="hidden lg:inline-flex" />
          <span className="hidden sm:block"><ModeBadge /></span>
          <span className="hidden sm:block">
            <ButtonLink href="/call?role=restaurant" variant="onDark" size="sm">
              <PhoneCall className="size-3.5" aria-hidden /> Call AnnaRelay <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          </span>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.06] px-3 py-2 md:hidden" aria-label="Main">
        <Suspense fallback={<NavItems path={null} mobile />}>
          <ActiveNav mobile />
        </Suspense>
        <span className="ml-auto shrink-0 self-center sm:hidden"><ModeBadge /></span>
      </nav>
    </header>
  );
}
