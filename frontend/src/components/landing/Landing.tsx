"use client";

import { api } from "@/lib/api/client";
import { usePoll } from "@/lib/usePoll";
import { FeatureRow } from "./FeatureRow";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { HomesStrip } from "./HomesStrip";
import { MetricSection } from "./MetricSection";
import { NetworkMap } from "./NetworkMap";
import { RelayCanvas } from "./RelayCanvas";
import { RelayFeature } from "./RelayFeature";
import { ReliabilityCatalog } from "./ReliabilityCatalog";
import { VoiceDemo } from "./VoiceDemo";

/** One poll of the real board feeds every data-backed section. */
export function Landing() {
  const { data: board } = usePoll(() => api.board(), 4000);
  const { data: restaurants } = usePoll(() => api.restaurants(), 60000);
  return (
    <main>
      <Hero board={board} />
      <HomesStrip board={board} />
      <RelayFeature />
      <RelayCanvas />
      <NetworkMap board={board} restaurants={restaurants} />
      <FeatureRow />
      <VoiceDemo />
      <ReliabilityCatalog board={board} />
      <MetricSection board={board} />
      <FinalCta />
    </main>
  );
}
