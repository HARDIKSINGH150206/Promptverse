"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Poll<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Fetch now (after an action). Newer responses always win over older ones. */
  refresh: () => Promise<void>;
  /** Show a fresh value immediately (e.g. the OfferDetail an action returned). */
  setData: (d: T) => void;
}

/**
 * Poll `fn` every `intervalMs`. `key` identifies what is being polled (e.g. an offer id);
 * data for an old key is never shown for a new one.
 */
export function usePoll<T>(fn: () => Promise<T>, intervalMs = 2000, key = ""): Poll<T> {
  const [state, setState] = useState<{ key: string; data: T | null; error: unknown; done: boolean }>({
    key, data: null, error: null, done: false,
  });
  const fnRef = useRef(fn);
  const keyRef = useRef(key);
  const seq = useRef(0);
  const applied = useRef(0);
  const inflight = useRef(0);

  useEffect(() => {
    fnRef.current = fn;
    keyRef.current = key;
  });

  const load = useCallback(async (fromTimer: boolean) => {
    if (fromTimer && inflight.current > 0) return;
    const mine = ++seq.current;
    const forKey = keyRef.current;
    inflight.current += 1;
    try {
      const data = await fnRef.current();
      if (mine < applied.current || forKey !== keyRef.current) return;
      applied.current = mine;
      setState({ key: forKey, data, error: null, done: true });
    } catch (error) {
      if (mine < applied.current || forKey !== keyRef.current) return;
      applied.current = mine;
      setState((s) => ({ key: forKey, data: s.key === forKey ? s.data : null, error, done: true }));
    } finally {
      inflight.current -= 1;
    }
  }, []);

  useEffect(() => {
    void load(false);
    const t = setInterval(() => void load(true), intervalMs);
    return () => clearInterval(t);
  }, [load, intervalMs, key]);

  const refresh = useCallback(() => load(false), [load]);
  const setData = useCallback((data: T) => {
    applied.current = ++seq.current;
    setState({ key: keyRef.current, data, error: null, done: true });
  }, []);

  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !current || !state.done,
    refresh,
    setData,
  };
}
