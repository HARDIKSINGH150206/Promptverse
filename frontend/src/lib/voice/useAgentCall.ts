"use client";

// Client for the backend voice-agent call (contract v3: ws /api/agent/call).
import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE_URL, normalizeOffer } from "../api/live";
import type { Demand, IntakeGuardrail, OfferDetail, OfferItem, Diet } from "../api/types";
import { ClipPlayer, startMic, type Mic } from "./audio";

export type CallRole = "restaurant" | "recipient";
export type CallPhase = "collect" | "confirm_details" | "safety_checklist" | "submitting" | "narrating" | "done" | "ended";
export type CallStatus = "idle" | "connecting" | "live" | "ended" | "error";

export interface CallDraft {
  restaurant_id?: string; restaurant_name?: string | null;
  recipient_id?: string; recipient_name?: string | null;
  items?: OfferItem[]; meal_count?: number; people_count?: number;
  diet?: Diet; cooked_at?: string; safe_until?: string; needed_by?: string;
  max_distance_km?: number; pickup_notes?: string; notes?: string;
}

export interface Line { id: number; speaker: "agent" | "user"; text: string; final: boolean }

export interface CallState {
  status: CallStatus;
  callId: string | null;
  phase: CallPhase;
  lines: Line[];
  draft: CallDraft;
  missing: string[];
  guardrail: IntakeGuardrail | null;
  confirmations: { diet_confirmed: boolean; safety_checklist_confirmed: boolean };
  thinking: boolean;
  speaking: boolean;
  micOn: boolean;
  micError: string | null;
  notice: string | null;
  offer: OfferDetail | null;
  demand: Demand | null;
  /** false when the backend runs with matching paused (intake only: nobody is contacted) */
  matching: boolean;
  outcome: string | null;
  error: string | null;
}

const INITIAL: CallState = {
  status: "idle", callId: null, phase: "collect", lines: [], draft: {}, missing: [], guardrail: null,
  confirmations: { diet_confirmed: false, safety_checklist_confirmed: false },
  thinking: false, speaking: false, micOn: false, micError: null, notice: null,
  offer: null, demand: null, matching: true, outcome: null, error: null,
};

interface Msg { type: string; [k: string]: unknown }

export function useAgentCall(role: CallRole, opts: { restaurantId?: string; recipientId?: string; language?: string } = {}) {
  const [state, setState] = useState<CallState>(INITIAL);
  const wsRef = useRef<WebSocket | null>(null);
  const micRef = useRef<Mic | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const playerRef = useRef<ClipPlayer | null>(null);
  const lineId = useRef(0);
  const micLevel = useRef(0);
  // the backend's echo guard needs to know when a reply has *fully* played, not just when the queue
  // drained between two sentences: report it once audio_end for the latest turn arrived and all is quiet
  const turnRef = useRef(0);
  const audioEndRef = useRef(0);
  const reportedRef = useRef(0);

  const maybePlaybackDone = useCallback(() => {
    const turn = turnRef.current;
    if (!turn || audioEndRef.current !== turn || reportedRef.current === turn) return;
    if (playerRef.current?.playing || (typeof window !== "undefined" && window.speechSynthesis?.speaking)) return;
    reportedRef.current = turn;
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ event: "playback_done", turn }));
  }, []);

  const patch = useCallback((p: Partial<CallState> | ((s: CallState) => Partial<CallState>)) => {
    setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) }));
  }, []);

  /** Loudness for visuals: agent playback when speaking, otherwise the mic. */
  const level = useCallback(() => {
    const p = playerRef.current;
    return p?.playing ? p.level() : micLevel.current;
  }, []);

  const teardown = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    playerRef.current?.interrupt();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    playerRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const onMessage = useCallback((m: Msg) => {
    switch (m.type) {
      case "ready":
        patch({ status: "live", callId: String(m.call_id) });
        break;
      case "caption": {
        const text = String(m.text ?? "");
        const final = !!m.final;
        patch((s) => {
          const lines = [...s.lines];
          const last = lines[lines.length - 1];
          if (last && last.speaker === "user" && !last.final) lines[lines.length - 1] = { ...last, text, final };
          else if (text) lines.push({ id: ++lineId.current, speaker: "user", text, final });
          return { lines };
        });
        break;
      }
      case "thinking":
        patch({ thinking: true });
        break;
      case "agent":
        if (typeof m.turn === "number") turnRef.current = m.turn;
        patch((s) => ({
          thinking: false,
          phase: (m.phase as CallPhase) ?? s.phase,
          lines: [...s.lines.filter((l) => l.final || l.speaker !== "user"), { id: ++lineId.current, speaker: "agent", text: String(m.text), final: true }],
        }));
        break;
      case "audio":
        if (typeof m.data === "string") playerRef.current?.enqueue(m.data);
        break;
      case "audio_unavailable":
        if (typeof window !== "undefined" && "speechSynthesis" in window && typeof m.text === "string") {
          const u = new SpeechSynthesisUtterance(m.text);
          u.onend = maybePlaybackDone;
          window.speechSynthesis.speak(u);
        }
        break;
      case "audio_end":
        if (typeof m.turn === "number") audioEndRef.current = m.turn;
        maybePlaybackDone();
        break;
      case "interrupt":
        playerRef.current?.interrupt();
        window.speechSynthesis?.cancel();
        reportedRef.current = turnRef.current; // the backend already knows playback stopped
        patch({ speaking: false });
        break;
      case "error":
        patch({ status: "error", error: String(m.message ?? "The voice agent couldn't start the call.") });
        break;
      case "draft":
        patch({
          phase: m.phase as CallPhase,
          draft: (m.draft as CallDraft) ?? {},
          missing: (m.missing as string[]) ?? [],
          guardrail: (m.guardrail as IntakeGuardrail | null) ?? null,
          confirmations: (m.confirmations as CallState["confirmations"]) ?? INITIAL.confirmations,
        });
        break;
      case "offer_created":
        patch({ offer: normalizeOffer(m.offer as OfferDetail), matching: m.matching !== false });
        break;
      case "demand_created":
        patch({ demand: m.demand as Demand, matching: m.matching !== false });
        break;
      case "notice":
        patch({ notice: String(m.message ?? "") });
        break;
      case "ended":
        patch({ outcome: String(m.outcome ?? "ended"), phase: "ended" as CallPhase, thinking: false });
        break;
    }
  }, [patch, maybePlaybackDone]);

  const start = useCallback(async () => {
    teardown();
    turnRef.current = audioEndRef.current = reportedRef.current = 0;
    setState({ ...INITIAL, status: "connecting" });
    // AudioContext must be created inside the click handler (autoplay policy)
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    const player = new ClipPlayer(ctx);
    player.onStart = () => patch({ speaking: true });
    player.onIdle = () => {
      patch({ speaking: false });
      maybePlaybackDone();
    };
    playerRef.current = player;

    const q = new URLSearchParams({ role, language_code: opts.language ?? "auto" });
    if (opts.restaurantId) q.set("restaurant_id", opts.restaurantId);
    if (opts.recipientId) q.set("recipient_id", opts.recipientId);
    const ws = new WebSocket(`${WS_BASE_URL}/api/agent/call?${q}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      try {
        onMessage(JSON.parse(e.data) as Msg);
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => patch({ status: "error", error: "Couldn't reach the voice agent. Is the backend running?" });
    ws.onclose = () => {
      micRef.current?.stop();
      micRef.current = null;
      patch((s) => ({ status: s.status === "error" ? "error" : "ended", micOn: false, thinking: false }));
    };
    ws.onopen = async () => {
      try {
        micRef.current = await startMic(
          (pcm) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
          },
          (l) => {
            micLevel.current = l;
          },
          ctx,
        );
        patch({ micOn: true, micError: null });
      } catch {
        patch({ micOn: false, micError: "Microphone unavailable. You can type your answers instead." });
      }
    };
  }, [role, opts.restaurantId, opts.recipientId, opts.language, onMessage, patch, teardown, maybePlaybackDone]);

  const sendText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!text.trim() || ws?.readyState !== WebSocket.OPEN) return;
    playerRef.current?.interrupt();
    ws.send(JSON.stringify({ event: "text", text: text.trim() })); // the backend echoes it back as a final caption
  }, []);

  const hangUp = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: "end" }));
    teardown();
    patch({ status: "ended", micOn: false, speaking: false, thinking: false });
  }, [patch, teardown]);

  return { state, start, hangUp, sendText, level };
}
