"use client";

import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { Button, inputClass } from "./ui";

/** The AI's follow-up question as a chat bubble. The answer is appended to the original message and re-parsed. */
export function FollowupBubble({ question, onAnswer, busy }: { question: string; onAnswer: (answer: string) => void; busy?: boolean }) {
  const [answer, setAnswer] = useState("");
  return (
    <form
      className="rounded-card border border-sky/20 bg-sky/[0.05] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!answer.trim()) return;
        onAnswer(answer.trim());
        setAnswer("");
      }}
    >
      <p className="flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue text-white">
          <MessageCircleQuestion className="size-4.5" aria-hidden />
        </span>
        <span className="rounded-2xl rounded-tl-sm bg-raised px-3.5 py-2.5 text-base font-medium text-white">{question}</span>
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer, e.g. till 10:30 pm"
          className={inputClass}
          aria-label="Your answer"
          disabled={busy}
        />
        <Button type="submit" variant="secondary" busy={busy} disabled={!answer.trim()} aria-label="Send answer">
          {busy ? null : <Send className="size-4" aria-hidden />}
          Answer
        </Button>
      </div>
    </form>
  );
}
