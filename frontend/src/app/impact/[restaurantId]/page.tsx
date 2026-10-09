import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { ImpactView } from "./ImpactView";

export default function ImpactPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-10"><LoadingBlock label="Loading impact" /></main>}>
      <ImpactView />
    </Suspense>
  );
}
