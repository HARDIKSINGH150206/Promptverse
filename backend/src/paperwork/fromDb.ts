// Builds paperwork from what the database already holds about an offer. Compliance details (FSSAI
// numbers) aren't stored yet, so they come from a lookup; a voice call can pass its exact record.
import { config } from "../config";
import { getRecipient, getRestaurant, listOfferRows } from "../db/repo";
import { offerDetail } from "../domain/timeline";
import { AppError, type OfferDetail } from "../domain/types";
import { buildDeclaration, buildHandover, buildRegister, localDate } from "./build";
import { NO_COMPLIANCE, type CallRecord, type ComplianceLookup, type ConfirmMethod, type DonationDeclaration, type HandoverNote, type Register, type RegisterRow } from "./types";

export interface FromDbOptions {
  compliance?: ComplianceLookup;
  call?: CallRecord | null;
  sample?: boolean;
  now?: number;
}

/** How the donor confirmed, read from the offer_created event that intake writes. */
function methodOf(detail: OfferDetail): ConfirmMethod {
  const created = detail.timeline.find((e) => e.type === "offer_created")?.message ?? "";
  if (/aloud on the voice call/i.test(created)) return "voice_call";
  if (/confirmed/i.test(created)) return "web_form";
  return "unknown";
}

function load(offerId: string): OfferDetail {
  try {
    return offerDetail(offerId);
  } catch {
    throw new AppError(404, "NOT_FOUND", `Offer ${offerId} not found`);
  }
}

function declarationFrom(detail: OfferDetail, opts: FromDbOptions): DonationDeclaration {
  const compliance = opts.compliance ?? NO_COMPLIANCE;
  const restaurant = getRestaurant(detail.restaurant_id);
  const flag = detail.timeline.find((e) => e.type === "guardrail_flag");
  const decl = buildDeclaration({
    offer: detail,
    donor: { id: detail.restaurant_id, name: restaurant?.name ?? detail.restaurant_name, area: restaurant?.area ?? "" },
    compliance: compliance.restaurant(detail.restaurant_id),
    guardrail: null, // not stored on the offer; the timeline note below keeps what the check said
    method: opts.call ? "voice_call" : methodOf(detail),
    call: opts.call ?? null,
    sample: opts.sample,
    now: opts.now,
  });
  if (flag) {
    // keep the AI check's explanation from the timeline when the raw result isn't available
    decl.ai_check = { source: "timeline", needs_confirmation: true, diet_label: null, diet_probability: null, safety_concern_probability: null, notes: [flag.message] };
  }
  return decl;
}

/** The donation declaration for an offer: available as soon as the offer exists. */
export function declarationForOffer(offerId: string, opts: FromDbOptions = {}): DonationDeclaration {
  return declarationFrom(load(offerId), opts);
}

/** One handover note per completed pickup of this offer (none until something is collected). */
export function handoversForOffer(offerId: string, opts: FromDbOptions = {}): HandoverNote[] {
  const detail = load(offerId);
  const compliance = opts.compliance ?? NO_COMPLIANCE;
  const declaration = declarationFrom(detail, opts);
  return detail.assignments
    .filter((a) => a.status === "collected" && a.collected_at)
    .map((a) => {
      const r = getRecipient(a.recipient_id);
      return buildHandover({
        declaration,
        assignment: a,
        recipient: { id: a.recipient_id, name: r?.name ?? a.recipient_name, area: r?.area ?? "", type: r?.type ?? "ngo" },
        compliance: compliance.recipient(a.recipient_id),
        // pickups are marked collected from Telegram or the web inbox; which one isn't stored
        received: { at: a.collected_at!, method: "unknown" },
        now: opts.now,
      });
    });
}

/** YYYY-MM of an ISO time in the local time zone. */
function localMonth(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.TZ_NAME, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
}

const OUTCOME: Record<string, string> = {
  open: "Awaiting pickup", matching: "Awaiting pickup", assigned: "Awaiting pickup",
  collected: "Collected", partially_collected: "Partly collected", fallback: "Sent to fallback (not for people)", expired: "Expired, not collected",
};

/** Every donation listed in a month (by cooking date, local time), optionally for one donor. */
export function registerForMonth(period: string, opts: FromDbOptions & { restaurantId?: string } = {}): Register {
  const compliance = opts.compliance ?? NO_COMPLIANCE;
  const rows: RegisterRow[] = listOfferRows()
    .filter((o) => localMonth(o.cooked_at) === period && (!opts.restaurantId || o.restaurant_id === opts.restaurantId))
    .map((o) => {
      const detail = load(o.id);
      const decl = declarationFrom(detail, opts);
      const collected = detail.assignments.filter((a) => a.status === "collected" && a.collected_at);
      const last = collected.map((a) => a.collected_at!).sort().at(-1) ?? null;
      return {
        date: localDate(o.cooked_at).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
        doc_no: decl.doc_no,
        offer_id: o.id,
        donor: decl.donor.name,
        donor_fssai: compliance.restaurant(o.restaurant_id)?.fssai_number ?? null,
        food: detail.items.map((i) => i.name).join(", ") || "Cooked food",
        diet: detail.diet,
        meals_offered: detail.meal_count,
        meals_collected: detail.meals_collected,
        cooked_at: detail.cooked_at,
        safe_until: detail.safe_until,
        collected_by: collected.map((a) => a.recipient_name).join("; "),
        picked_up_at: last,
        outcome: detail.fallback_route && detail.fallback_route !== "people" ? `Fallback: ${detail.fallback_route.replace("_", " ")}` : OUTCOME[detail.status] ?? detail.status,
        safety_confirmed: decl.confirmations.every((c) => c.confirmed),
      };
    });
  return buildRegister(period, rows, { donorId: opts.restaurantId ?? null, sample: opts.sample, now: opts.now });
}
