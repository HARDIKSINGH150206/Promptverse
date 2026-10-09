"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChartNoAxesColumn, Check, Send, Sparkles, Store } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage, type CreateOfferBody, type ParsedOffer } from "@/lib/api/types";
import { istInputToIso } from "@/lib/time";
import { usePoll } from "@/lib/usePoll";
import { useNow } from "@/lib/useNow";
import { ParsedOfferForm, draftFromParsed, validateOffer, type OfferDraft } from "@/components/ParsedOfferForm";
import { PhotoInput } from "@/components/PhotoInput";
import { useToast } from "@/components/providers";
import { VoiceInput } from "@/components/VoiceInput";
import { IntakeLayout } from "@/components/IntakeLayout";
import { Button, ErrorState, Skeleton, cx } from "@/components/ui";

interface ParseResult { parsed: ParsedOffer; photo_url: string | null; transcript: string }

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="animate-enter">
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-medium text-white">
        <span className={cx("tabular flex size-7 items-center justify-center rounded-full text-sm", done ? "bg-blue text-white" : "bg-raised text-white")}>
          {done ? <Check className="size-4" aria-hidden /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function RestaurantPage() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const restaurants = usePoll(() => api.restaurants(), 60000);

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  // no silent default: the restaurant says who it is
  const selectedId = restaurantId;
  const [transcript, setTranscript] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [parsing, setParsing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [checklistFlash, setChecklistFlash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  async function understand(text: string, isFollowup = false) {
    if (!selectedId || !text.trim()) return;
    setParsing(true);
    try {
      // a photo is uploaded once; follow-up re-parses reuse its photo_url
      const sendPhoto = photo && !(isFollowup && result?.photo_url) ? photo : undefined;
      const r = await api.parseOffer({ restaurant_id: selectedId, transcript: text.trim(), photo: sendPhoto });
      setResult({ parsed: r.parsed, photo_url: r.photo_url ?? result?.photo_url ?? null, transcript: text.trim() });
      setDraft(draftFromParsed(r.parsed, isFollowup ? draft ?? undefined : undefined));
      setShowErrors(false);
      setChecklistFlash(false);
      if (!isFollowup) setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setParsing(false);
    }
  }

  // render-time hints; submit() re-checks against the clock
  const problems = draft ? validateOffer(draft, now) : [];

  async function submit() {
    if (!draft || !result || !selectedId) return;
    const problems = validateOffer(draft, Date.now());
    if (problems.length) {
      setShowErrors(true);
      if (problems.some((p) => p.field === "checklist")) setChecklistFlash(true);
      document.getElementById(problems[0].field === "checklist" ? "safety-checklist" : problems[0].field === "diet" ? "guardrail-title" : problems[0].field)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const body: CreateOfferBody = {
      restaurant_id: selectedId,
      items: draft.items.map((i) => ({ name: i.name.trim(), quantity: Number(i.quantity) || 0, unit: i.unit.trim() || "plates" })),
      meal_count: Number(draft.meal_count),
      diet: draft.diet!,
      cooked_at: istInputToIso(draft.cooked_at)!,
      safe_until: istInputToIso(draft.safe_until)!,
      photo_url: result.photo_url,
      raw_transcript: result.transcript,
      pickup_notes: draft.pickup_notes.trim() || null,
      confirmations: {
        diet_confirmed: draft.diet_confirmed,
        safety_checklist_confirmed: Object.values(draft.checklist).every(Boolean),
      },
    };
    setSubmitting(true);
    try {
      const offer = await api.createOffer(body);
      toast("Offer sent. Matching has started.", "success");
      router.push(`/offers/${offer.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CONFIRMATION_REQUIRED") {
        setChecklistFlash(true);
        document.getElementById("safety-checklist")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      toast(errorMessage(err), "error");
      setSubmitting(false);
    }
  }

  return (
    <IntakeLayout
      eyebrow="Restaurant"
      icon={<Store />}
      title="What's left today?"
      description="Say it the way you'd tell a friend. We'll turn it into an offer, double-check diet and safety, then find a shelter that needs it."
      steps={["Pick your restaurant", "Speak or type what's left", "We double-check diet and safety", "Only homes that need it are offered"]}
      note="The AI suggests; you confirm every field. Diet and the safety checklist are always asked before anything is sent."
    >
      <div className="space-y-10">
        <Step n={1} title="Your restaurant" done={!!selectedId}>
          {restaurants.error && !restaurants.data ? (
            <ErrorState error={restaurants.error} onRetry={restaurants.refresh} />
          ) : !restaurants.data ? (
            <div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Your restaurant">
                {restaurants.data.map((r) => {
                  const on = r.id === selectedId;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setRestaurantId(r.id)}
                      className={cx(
                        "flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-colors",
                        on ? "border-sky/60 bg-blue text-white" : "border-line bg-white/[0.03] text-white hover:border-sky/60",
                      )}
                    >
                      <Store className={cx("size-6 shrink-0", on ? "text-white" : "text-sky")} aria-hidden />
                      <span>
                        <span className="block font-medium">{r.name}</span>
                        <span className={cx("block text-sm", on ? "text-white/75" : "text-white/65")}>{r.area}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedId ? (
                <Link href={`/impact/${selectedId}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-sky hover:underline">
                  <ChartNoAxesColumn className="size-4" aria-hidden /> See this restaurant&apos;s impact
                </Link>
              ) : null}
            </>
          )}
        </Step>

        <Step n={2} title="Tell us about the food" done={!!result}>
          <VoiceInput
            id="offer-transcript"
            value={transcript}
            onChange={setTranscript}
            placeholder="Around 40 plates veg biryani, made at 7, safe till 10, pick up from back gate."
            disabled={parsing}
          />
          <div className="mt-4">
            <PhotoInput file={photo} onChange={setPhoto} disabled={parsing} />
          </div>
          <Button
            size="lg"
            className="mt-5 w-full"
            busy={parsing}
            disabled={!selectedId || !transcript.trim()}
            onClick={() => void understand(transcript)}
          >
            {parsing ? "Understanding…" : <><Sparkles className="size-5" aria-hidden /> Understand my message</>}
          </Button>
          {!selectedId ? <p className="mt-2 text-center text-sm text-white/65">Choose your restaurant above first.</p> : null}
        </Step>

        {result && draft ? (
          <div ref={formRef} className="scroll-mt-24">
            <Step n={3} title="Check and send">
              <ParsedOfferForm
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
                highlightChecklist={checklistFlash}
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
                {submitting ? "Sending…" : <><Send className="size-5" aria-hidden /> Send to recipients</>}
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-white/65">
                Only shelters that already need this food will be offered it. <ArrowRight className="size-3.5" aria-hidden /> You&apos;ll see each step live.
              </p>
            </Step>
          </div>
        ) : null}
      </div>
    </IntakeLayout>
  );
}
