import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { CallScreen } from "./CallScreen";

// CallScreen reads ?role= / ?restaurant_id= from the URL, so it renders on the client inside Suspense.
export default function CallPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1240px] px-5 py-14 lg:px-8"><LoadingBlock label="Opening the call" /></main>}>
      <CallScreen />
    </Suspense>
  );
}
