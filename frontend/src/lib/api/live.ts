// Real backend. Errors are `{ error: { code, message } }` and become ApiError.
import { setServerTime } from "../time";
import {
  ApiError,
  type Api, type Assignment, type Board, type Demand, type Health, type ImpactCard, type Inbox, type Offer,
  type OfferDetail, type ParsedDemand, type ParsedOffer, type Recipient, type ReplyUnderstanding,
  type Restaurant, type Transcription,
} from "./types";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("NETWORK_ERROR", `Can't reach the AnnaRelay server at ${API_BASE_URL}.`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(e?.code ?? `HTTP_${res.status}`, e?.message ?? `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

const postJson = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Relative `/uploads/...` paths are served by the backend. */
function absolutePhoto(url: string | null): string | null {
  if (!url) return url;
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}

function withPhoto<T extends Offer>(o: T): T {
  return { ...o, photo_url: absolutePhoto(o.photo_url) };
}

export const live: Api = {
  health: () => request<Health>("/api/health"),
  restaurants: () => request<Restaurant[]>("/api/restaurants"),
  recipients: () => request<Recipient[]>("/api/recipients"),

  async parseOffer({ restaurant_id, transcript, photo }) {
    const form = new FormData();
    form.set("transcript", transcript);
    form.set("restaurant_id", restaurant_id);
    if (photo) form.set("photo", photo);
    // photo_url stays relative here: it is sent back unchanged in createOffer.
    return request<{ parsed: ParsedOffer; photo_url: string | null }>("/api/offers/parse", { method: "POST", body: form });
  },

  createOffer: async (body) => withPhoto(await postJson<OfferDetail>("/api/offers", body)),
  getOffer: async (id) => withPhoto(await request<OfferDetail>(`/api/offers/${encodeURIComponent(id)}`)),

  parseDemand({ recipient_id, transcript }) {
    const form = new FormData();
    form.set("transcript", transcript);
    form.set("recipient_id", recipient_id);
    return request<{ parsed: ParsedDemand }>("/api/demands/parse", { method: "POST", body: form });
  },

  createDemand: (body) => postJson<Demand>("/api/demands", body),

  async board() {
    const b = await request<Board>("/api/board");
    setServerTime(b.server_time);
    return { ...b, offers: b.offers.map(withPhoto) };
  },

  assignmentAction: async (id, action) =>
    withPhoto(await postJson<OfferDetail>(`/api/assignments/${encodeURIComponent(id)}/${action}`)),

  async reply(id, text) {
    const r = await postJson<{ understood: ReplyUnderstanding; offer: OfferDetail }>(
      `/api/assignments/${encodeURIComponent(id)}/reply`, { text },
    );
    return { understood: r.understood, offer: withPhoto(r.offer) };
  },

  async collectorInbox(recipientId) {
    const r = await request<Inbox>(`/api/collector/${encodeURIComponent(recipientId)}/inbox`);
    return {
      recipient: r.recipient,
      assignments: r.assignments.map((a: Assignment & { offer: Offer }) => ({ ...a, offer: withPhoto(a.offer) })),
    };
  },

  impact: (restaurantId) => request<ImpactCard>(`/api/impact/${encodeURIComponent(restaurantId)}`),
  demoReset: () => postJson<{ ok: true }>("/api/demo/reset"),
  demoFastForward: async (assignmentId) =>
    withPhoto(await postJson<OfferDetail>(`/api/demo/fast-forward/${encodeURIComponent(assignmentId)}`)),

  transcribe({ audio, language_code }) {
    const form = new FormData();
    const ext = audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm";
    form.set("audio", audio, `voice.${ext}`);
    if (language_code) form.set("language_code", language_code);
    return request<Transcription>("/api/transcribe", { method: "POST", body: form });
  },
};
