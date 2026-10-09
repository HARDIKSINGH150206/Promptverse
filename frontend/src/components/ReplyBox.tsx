"use client";

import { useState } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError, errorMessage, type OfferDetail, type ReplyUnderstanding } from "@/lib/api/types";
import { useToast } from "./providers";
import { UnderstoodCard } from "./UnderstoodCard";
import { Button, inputClass } from "./ui";

/** Free-text reply ("we can only take 8", "stuck in traffic") -> what the AI understood and what happened. */
export function ReplyBox({
  assignmentId, onDone, disabled,
}: {
  assignmentId: string;
  onDone: (r: { understood: ReplyUnderstanding; offer: OfferDetail }) => void;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReplyUnderstanding | null>(null);
  const inputId = `reply-${assignmentId}`;

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const r = await api.reply(assignmentId, t);
      setResult(r.understood);
      setText("");
      onDone(r);
    } catch (err) {
      toast(errorMessage(err), "error");
      if (err instanceof ApiError && err.status === 404) setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-navy">
          <MessageSquareText className="size-4 text-blue" aria-hidden />
          Reply in your own words
        </label>
        <div className="flex gap-2">
          <input
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'e.g. "we can only take 8" or "stuck in traffic"'}
            maxLength={1000}
            disabled={disabled || busy}
            className={inputClass}
          />
          <Button type="submit" variant="secondary" busy={busy} disabled={disabled || !text.trim()} aria-label="Send reply">
            {busy ? null : <Send className="size-4" aria-hidden />}
            <span className="hidden sm:inline">Send</span>
          </Button>
        </div>
      </form>
      {result ? <UnderstoodCard understood={result} className="mt-3 animate-enter" /> : null}
    </div>
  );
}
