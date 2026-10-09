import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { CollectorInbox } from "./CollectorInbox";

export default function CollectorPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-4 py-10"><LoadingBlock label="Loading inbox" /></main>}>
      <CollectorInbox />
    </Suspense>
  );
}
