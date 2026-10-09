import { BrainCircuit, Cpu, FlaskConical, ListChecks } from "lucide-react";
import type { AiSource } from "@/lib/api/types";
import { pct } from "@/lib/time";
import { cx } from "@/lib/cx";

const LABEL: Record<AiSource, string> = {
  laya: "Laya",
  llm: "LLM",
  mock: "Mock",
  fallback_rules: "Rules",
};

const TITLE: Record<AiSource, string> = {
  laya: "Laya decision model (probabilities)",
  llm: "Generative language model",
  mock: "Offline keyword mock, not a real model",
  fallback_rules: "AI unavailable; conservative fallback rules",
};

const ICON = { laya: BrainCircuit, llm: Cpu, mock: FlaskConical, fallback_rules: ListChecks };

/** Every AI output shows its source and, where there is one, its confidence: "Laya 92%". */
export function AiBadge({ source, probability, className }: { source: AiSource; probability?: number | null; className?: string }) {
  const Icon = ICON[source] ?? Cpu;
  const isReal = source === "laya" || source === "llm";
  return (
    <span
      title={TITLE[source]}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap",
        isReal ? "border border-sky/30 bg-sky/10 text-sky" : "border border-dashed border-white/25 text-white/65",
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {LABEL[source] ?? source}
      {probability !== undefined && probability !== null ? <span className="tabular font-semibold opacity-80">{pct(probability)}</span> : null}
    </span>
  );
}
