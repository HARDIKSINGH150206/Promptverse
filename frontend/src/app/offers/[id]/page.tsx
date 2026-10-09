import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { OfferTimeline } from "./OfferTimeline";

export default function OfferPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10"><LoadingBlock label="Loading offer" /></main>}>
      <OfferTimeline />
    </Suspense>
  );
}
