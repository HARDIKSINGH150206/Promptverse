import type { ReactNode } from "react";
import { PageHeader } from "./ui";

/**
 * Laptop layout for the intake pages: a sticky intro on the left (like the reference's catalog section),
 * the form on the right. Stacks to one column on phones.
 */
export function IntakeLayout({
  eyebrow, icon, title, description, steps, note, children,
}: {
  eyebrow: string;
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  steps: string[];
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto grid max-w-[1240px] gap-10 px-5 py-12 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-16 lg:px-8 lg:py-16">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <PageHeader eyebrow={eyebrow} icon={icon} title={title} description={description} />
        <ol className="mt-10 hidden space-y-0 border-t border-white/[0.07] lg:block">
          {steps.map((s, i) => (
            <li key={s} className="flex items-baseline gap-4 border-b border-white/[0.07] py-3.5 text-[15px] text-white/65">
              <span className="tabular font-mono text-xs text-white/30">0{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        {note ? <div className="mt-8 hidden text-sm leading-relaxed text-white/45 lg:block">{note}</div> : null}
      </aside>
      <div className="min-w-0">{children}</div>
    </main>
  );
}
