"use client";

import type { ReactNode } from "react";
import { Check, CircleCheck, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import type { CallDraft, CallPhase, CallRole } from "@/lib/voice/useAgentCall";
import type { IntakeGuardrail } from "@/lib/api/types";
import { fmtTime, pct } from "@/lib/time";
import { cx, Skeleton } from "@/components/ui";

const STEPS_R: { key: CallPhase[]; label: string }[] = [
  { key: ["collect"], label: "Details" },
  { key: ["confirm_details"], label: "Read-back" },
  { key: ["safety_checklist"], label: "Safety check" },
  { key: ["submitting", "narrating", "done"], label: "Live" },
];
const STEPS_D: { key: CallPhase[]; label: string }[] = [
  { key: ["collect"], label: "Details" },
  { key: ["confirm_details"], label: "Read-back" },
  { key: ["submitting", "narrating", "done"], label: "Live" },
];

function Stepper({ role, phase }: { role: CallRole; phase: CallPhase }) {
  const steps = role === "restaurant" ? STEPS_R : STEPS_D;
  const idx = Math.max(0, steps.findIndex((s) => s.key.includes(phase)));
  const current = phase === "ended" ? -1 : idx;
  return (
    <ol className="flex items-center gap-1.5" aria-label="Call progress">
      {steps.map((s, i) => {
        const done = current > i || (phase === "done" && i === steps.length - 1);
        const active = current === i && phase !== "done";
        return (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              className={cx(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.08em] uppercase transition-colors duration-300",
                done ? "bg-emerald/15 text-emerald" : active ? "bg-sky/15 text-sky" : "bg-white/[0.04] text-white/40",
              )}
              aria-current={active ? "step" : undefined}
            >
              {done ? <Check className="size-3" aria-hidden /> : <span className={cx("size-1.5 rounded-full", active ? "bg-sky animate-blink" : "bg-white/25")} aria-hidden />}
              {s.label}
            </span>
            {i < steps.length - 1 ? <span className="h-px w-3 bg-white/10" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** A field that shows a skeleton until the agent hears it, then fades in with a brief highlight. */
function Field({ label, value, wide, big }: { label: string; value: ReactNode | null | undefined; wide?: boolean; big?: boolean }) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <div className={cx("min-w-0", wide && "col-span-2")}>
      <p className="font-mono text-[10.5px] tracking-[0.12em] text-white/40 uppercase">{label}</p>
      {has ? (
        <p
          key={String(typeof value === "string" || typeof value === "number" ? value : label)}
          className={cx(
            "mt-1 animate-enter rounded-md text-white [animation-duration:420ms]",
            big ? "display text-3xl sm:text-4xl" : "text-[17px] font-medium",
          )}
        >
          {value}
        </p>
      ) : (
        <Skeleton className={cx("mt-2 bg-white/[0.06]!", big ? "h-9 w-3/4" : "h-5 w-2/3")} />
      )}
    </div>
  );
}

function Checks({ g }: { g: IntakeGuardrail }) {
  const dietP = g.diet_check?.probability ?? null;
  const safety = g.safety_concern_probability;
  const rows = [
    {
      label: "Diet check",
      value: g.diet_check ? `${g.diet_check.label === "veg" ? "veg" : "non-veg"} ${pct(dietP)}` : "unavailable",
      ok: !!g.diet_check && g.diet_check.agrees_with_extraction && (dietP ?? 0) >= 0.95,
      bar: dietP,
    },
    {
      label: "Food-safety concern",
      value: safety === null ? "unavailable" : pct(safety),
      ok: safety !== null && safety <= 0.3,
      bar: safety,
    },
  ];
  return (
    <div className="animate-enter rounded-2xl border border-line bg-panel p-4">
      <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-white/50 uppercase">
        <Sparkles className="size-3.5 text-sky" aria-hidden /> AI checks · source {g.source}
      </p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-2 text-[14px] text-white/85">
              {r.ok ? <CircleCheck className="size-4 text-emerald" aria-hidden /> : <ShieldAlert className="size-4 text-orange" aria-hidden />}
              {r.label}
              <span className="sr-only">{r.ok ? "(passed)" : "(needs attention)"}</span>
            </span>
            <span className="tabular font-mono text-[12.5px] text-white/70">{r.value}</span>
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span
                className={cx("block h-full rounded-full transition-[width] duration-700", r.ok ? "bg-emerald" : "bg-orange")}
                style={{ width: `${Math.round((r.bar ?? 0) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      {g.needs_confirmation && g.reasons.length ? (
        <ul className="mt-3 space-y-1 rounded-xl border border-orange/40 bg-orange/[0.07] px-3 py-2 text-[13px] text-white/90">
          {g.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function Confirm({ done, label, active }: { done: boolean; label: string; active: boolean }) {
  return (
    <li className={cx("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[14px] transition-colors duration-300",
      done ? "border-emerald/40 bg-emerald/[0.08] text-white" : active ? "border-sky/50 bg-sky/[0.06] text-white" : "border-line text-white/50")}>
      <span className={cx("flex size-5 items-center justify-center rounded-md border transition-colors",
        done ? "border-emerald bg-emerald text-navy" : active ? "border-sky animate-pulse-ring" : "border-white/25")}>
        {done ? <Check className="size-3.5" aria-hidden /> : null}
      </span>
      {label}
      <span className="ml-auto font-mono text-[10.5px] tracking-[0.1em] text-white/40 uppercase">
        {done ? "said yes" : active ? "asking now" : "pending"}
      </span>
    </li>
  );
}

export function DraftCard({
  role, phase, draft, guardrail, confirmations, live,
}: {
  role: CallRole;
  phase: CallPhase;
  draft: CallDraft;
  guardrail: IntakeGuardrail | null;
  confirmations: { diet_confirmed: boolean; safety_checklist_confirmed: boolean };
  live: boolean;
}) {
  const items = draft.items?.map((i) => i.name).join(", ");
  const diet = draft.diet === "veg" ? "Veg" : draft.diet === "nonveg" ? "Non-veg" : draft.diet === "any" ? "Any" : null;
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-raised p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-sky/10 blur-3xl" aria-hidden />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <Stepper role={role} phase={phase} />
        <span className={cx("rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase",
          live ? "bg-emerald text-navy" : "border border-white/15 text-white/60")}>
          {live ? "Live" : "Draft"}
        </span>
      </div>

      {role === "restaurant" ? (
        <div className="relative mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
          <Field wide big label="Food" value={draft.meal_count && items ? `${draft.meal_count} plates · ${items}` : items ?? (draft.meal_count ? `${draft.meal_count} plates` : null)} />
          <Field label="Kitchen" value={draft.restaurant_name} />
          <Field label="Diet" value={diet} />
          <Field label="Cooked at" value={draft.cooked_at ? fmtTime(draft.cooked_at) : null} />
          <Field label="Safe until" value={draft.safe_until ? fmtTime(draft.safe_until) : null} />
          <Field wide label="Pickup" value={draft.pickup_notes ?? (phase !== "collect" ? "Not specified" : null)} />
        </div>
      ) : (
        <div className="relative mt-6 grid grid-cols-2 gap-x-6 gap-y-5">
          <Field wide big label="Need" value={draft.people_count ? `Food for ${draft.people_count} people` : null} />
          <Field label="Shelter" value={draft.recipient_name} />
          <Field label="Diet" value={diet} />
          <Field label="Needed by" value={draft.needed_by ? fmtTime(draft.needed_by) : null} />
          <Field label="Within" value={draft.max_distance_km ? `${draft.max_distance_km} km` : phase !== "collect" ? "5 km (default)" : null} />
        </div>
      )}

      {role === "restaurant" && guardrail ? <div className="relative mt-6"><Checks g={guardrail} /></div> : null}

      <ul className="relative mt-6 space-y-2" aria-label="Spoken confirmations">
        <Confirm
          label={role === "restaurant" ? "Details and diet confirmed aloud" : "Request confirmed aloud"}
          done={role === "restaurant" ? confirmations.diet_confirmed : ["submitting", "narrating", "done"].includes(phase)}
          active={phase === "confirm_details"}
        />
        {role === "restaurant" ? (
          <Confirm
            label="Safety checklist: covered, hot or chilled, never plated"
            done={confirmations.safety_checklist_confirmed}
            active={phase === "safety_checklist"}
          />
        ) : null}
      </ul>
      <p className="relative mt-3 flex items-center gap-1.5 text-[12.5px] text-white/45">
        <ShieldCheck className="size-3.5" aria-hidden /> The AI fills this in; only the caller&apos;s spoken &ldquo;yes&rdquo; confirms it.
      </p>
    </div>
  );
}
