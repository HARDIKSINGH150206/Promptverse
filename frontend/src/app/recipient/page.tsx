"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Users, ExternalLink, Inbox, MonitorPlay, Send, Sparkles } from "lucide-react";
import { TELEGRAM_BOT_USERNAME, api } from "@/lib/api/client";
import { errorMessage, type Demand, type ParsedDemand, type Recipient } from "@/lib/api/types";
import { fmtTime, istInputToIso } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { useNow } from "@/lib/useNow";
import {
  ParsedDemandForm, demandDraftFromParsed, validateDemand, type DemandDraft,
} from "@/components/ParsedDemandForm";
import { useHealth, useToast } from "@/components/providers";
import { ReliabilityBar } from "@/components/ReliabilityBar";
import { VoiceInput } from "@/components/VoiceInput";
import { IntakeLayout } from "@/components/IntakeLayout";
import { Button, ButtonLink, Card, ErrorState, SimulatedBadge, Skeleton, cx } from "@/components/ui";

const TYPE_LABEL: Record<Recipient["type"], string> = {
  shelter: "Shelter", orphanage: "Orphanage", old_age_home: "Elders' home", ngo: "NGO",
};

function TelegramPanel({ recipient }: { recipient: Recipient }) {
  const { health } = useHealth();
  const enabled = health?.telegram === "ready";
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium text-white">Get offers on Telegram</h3>
        {recipient.telegram_linked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue px-2.5 py-1 text-xs font-medium text-white">
            <CircleCheck className="size-3.5" aria-hidden /> Linked
          </span>
        ) : null}
      </div>
      {TELEGRAM_BOT_USERNAME && enabled ? (
        <p className="mt-2 text-sm text-white/75">
          Accept, reconfirm and reply in your own words from your phone.
          {recipient.telegram_linked ? " This home is already linked." : ""}
        </p>
      ) : (
        <p className="mt-2 text-sm text-white/75">
          Telegram isn&apos;t switched on for this server right now. The web inbox does everything Telegram does.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {TELEGRAM_BOT_USERNAME && enabled ? (
          <a
            href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(recipient.link_code)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue px-5 text-[15px] font-semibold text-white hover:bg-blue/90"
          >
            <Send className="size-4" aria-hidden />
            {recipient.telegram_linked ? "Open Telegram" : "Link Telegram"}
            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
          </a>
        ) : null}
        <ButtonLink href={`/collector/${recipient.id}`} variant="outline">
          <Inbox className="size-4" aria-hidden />
          {TELEGRAM_BOT_USERNAME && enabled ? "No Telegram? Use the web inbox" : "Open the web inbox"}
        </ButtonLink>
      </div>
      {TELEGRAM_BOT_USERNAME && enabled && !recipient.telegram_linked ? (
        <p className="mt-3 text-xs text-white/60">
          Or send <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-semibold">/start {recipient.link_code}</code> to @{TELEGRAM_BOT_USERNAME}.
        </p>
      ) : null}
    </Card>
  );
}

export default function RecipientPage() {
  const toast = useToast();
  const now = useNow();
  const recipients = usePoll(() => api.recipients(), 10000);

  const [recipientId, setRecipientId] = useState<string | null>(null);
  const list = recipients.data ?? [];
  const selected = list.find((r) => r.id === recipientId) ?? null;

  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<{ parsed: ParsedDemand; transcript: string } | null>(null);
  const [draft, setDraft] = useState<DemandDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [posted, setPosted] = useState<Demand | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  async function understand(text: string, isFollowup = false) {
    if (!selected || !text.trim()) return;
    setParsing(true);
    try {
      const r = await api.parseDemand({ recipient_id: selected.id, transcript: text.trim() });
      setResult({ parsed: r.parsed, transcript: text.trim() });
      setDraft(demandDraftFromParsed(r.parsed, isFollowup ? draft ?? undefined : undefined));
      setShowErrors(false);
      setPosted(null);
      if (!isFollowup) setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setParsing(false);
    }
  }

  // render-time hints; submit() re-checks against the clock
  const problems = draft ? validateDemand(draft, now) : [];

  async function submit() {
    if (!draft || !result || !selected) return;
    const problems = validateDemand(draft, Date.now());
    if (problems.length) {
      setShowErrors(true);
      document.getElementById(problems[0].field)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const d = await api.createDemand({
        recipient_id: selected.id,
        people_count: Number(draft.people_count),
        diet: draft.diet!,
        needed_by: istInputToIso(draft.needed_by)!,
        max_distance_km: Number(draft.max_distance_km),
        notes: draft.notes.trim() || null,
        raw_transcript: result.transcript,
      });
      setPosted(d);
      setResult(null);
      setDraft(null);
      setTranscript("");
      toast("Your need is posted. We'll offer matching food as soon as it's listed.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = [...list].sort((a, b) => b.reliability.total - a.reliability.total);

  return (
    <IntakeLayout
      eyebrow="Recipient"
      icon={<Users />}
      title="What do you need today?"
      description="Tell us how many people you're feeding and by when. Food is only offered to homes that have said what they need."
      steps={["Pick your home", "Link Telegram, or use the web inbox", "Say what you need today", "Matching food is offered to you"]}
      note="Your reliability is a Bayesian estimate from past pickups, shown with its uncertainty. New homes get a fair chance when time allows."
    >

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-white">Who are you?</h2>
          {list.some((r) => r.reliability.is_simulated_history) ? <SimulatedBadge label="Simulated history" /> : null}
        </div>
        {recipients.error && !recipients.data ? (
          <ErrorState error={recipients.error} onRetry={recipients.refresh} />
        ) : !recipients.data ? (
          <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-label="Who are you?">
            {sorted.map((r) => {
              const on = r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setRecipientId(r.id);
                    setPosted(null);
                  }}
                  className={cx(
                    "block w-full rounded-2xl border bg-panel p-4 text-left transition-colors",
                    on ? "border-sky/60 ring-4 ring-sky/15" : "border-line hover:border-sky/60",
                  )}
                >
                  <span className="mb-2 flex items-center justify-between gap-2">
                    <span>
                      <span className="block font-medium text-white">{r.name}</span>
                      <span className="block text-sm text-white/65">{TYPE_LABEL[r.type]} · {r.area}</span>
                    </span>
                    {r.telegram_linked ? <span className="text-xs font-semibold text-sky">Telegram linked</span> : null}
                  </span>
                  <ReliabilityBar recipient={r} compact />
                </button>
              );
            })}
          </div>
        )}
        {selected ? <p className="mt-3 rounded-2xl bg-white/[0.03] px-4 py-3 text-sm text-white/80">{selected.reliability.explanation}</p> : null}
      </section>

      {selected ? (
        <div className="mt-8 space-y-8">
          <TelegramPanel recipient={selected} />

          {posted ? (
            <Card className="animate-pop border-2 border-sky/60! p-6">
              <p className="flex items-center gap-2 text-lg font-medium text-white">
                <CircleCheck className="size-6 text-sky" aria-hidden />
                Posted: {posted.people_count} {posted.diet === "veg" ? "veg" : posted.diet === "nonveg" ? "non-veg" : ""} meals needed by {fmtTime(posted.needed_by)}
              </p>
              <p className="mt-1 text-white/75">Matching food will be offered to you right away. Keep your inbox open.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/board" variant="secondary"><MonitorPlay className="size-4" aria-hidden /> See it on the Live Board</ButtonLink>
                <ButtonLink href={`/collector/${selected.id}`} variant="outline"><Inbox className="size-4" aria-hidden /> Open my inbox</ButtonLink>
              </div>
            </Card>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-medium text-white">Say what you need</h2>
            <VoiceInput
              id="demand-transcript"
              value={transcript}
              onChange={setTranscript}
              placeholder="We need food for 20 people tonight, veg only, by 9:30."
              disabled={parsing}
            />
            <Button
              size="lg"
              className="mt-5 w-full"
              busy={parsing}
              disabled={!transcript.trim()}
              onClick={() => void understand(transcript)}
            >
              {parsing ? "Understanding…" : <><Sparkles className="size-5" aria-hidden /> Understand my message</>}
            </Button>
          </section>

          {result && draft ? (
            <div ref={formRef} className="scroll-mt-24 animate-enter">
              <ParsedDemandForm
                parsed={result.parsed}
                draft={draft}
                onChange={setDraft}
                reparsing={parsing}
                onFollowupAnswer={(answer) => {
                  const combined = `${result.transcript} ${answer}`;
                  setTranscript(combined);
                  void understand(combined, true);
                }}
                showErrors={showErrors}
                problems={problems.map((p) => p.field)}
              />
              {showErrors && problems.length ? (
                <ul className="mt-5 space-y-1 rounded-2xl border border-orange/70 bg-orange/[0.06] p-4 text-[15px] text-white" role="alert">
                  {problems.map((p) => (
                    <li key={p.message} className="flex gap-2">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-orange" aria-hidden />
                      {p.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button size="lg" className="mt-5 w-full" busy={submitting} onClick={() => void submit()}>
                {submitting ? "Posting…" : <>Post today&apos;s need <ArrowRight className="size-5" aria-hidden /></>}
              </Button>
            </div>
          ) : null}
        </div>
      ) : recipients.data ? (
        <p className="mt-6 text-center text-sm text-white/65">Pick your home above to continue.</p>
      ) : null}

      <p className="mt-10 text-center text-sm text-white/60">
        Already have an offer? <Link href="/board" className="font-semibold text-sky hover:underline">Find it on the Live Board</Link>
      </p>
    </IntakeLayout>
  );
}
