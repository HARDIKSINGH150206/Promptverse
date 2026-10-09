import { config } from "../config";
import { addEvent, updateOffer } from "../db/repo";
import { fmtTime } from "./format";
import { refreshOffer } from "./offerState";
import type { FallbackRoute, OfferRow } from "./types";

const LABEL: Record<FallbackRoute, string> = {
  people: "people",
  animal_feed: "animal feed partner",
  compost: "compost partner",
};

/** Route the meals nobody can collect in time. Partners are simulated and the event says so. */
export function applyFallback(offer: OfferRow, meals: number): void {
  if (offer.fallback_route || meals <= 0) return;
  const route = (config.FALLBACK_ORDER[0] ?? "compost") as FallbackRoute;
  updateOffer(offer.id, { fallback_route: route });
  addEvent(
    offer.id, "fallback",
    `No recipient can reach it before ${fmtTime(offer.safe_until)}. ${meals} meals routed to ${LABEL[route]} (simulated).`
  );
  refreshOffer(offer.id);
}
