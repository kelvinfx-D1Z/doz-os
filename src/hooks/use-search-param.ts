"use client";
import { useState, useEffect } from "react";

/**
 * Reads a URL search param on the client side.
 * Returns null during SSR / first render, then returns the actual value.
 */
export function useSearchParam(key: string): string | null {
  const [state, setState] = useState<{ value: string | null; ready: boolean }>({
    value: null,
    ready: false,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const val = params.get(key);
    // defer to microtask to avoid synchronous setState in effect
    Promise.resolve().then(() => setState({ value: val, ready: true }));
  }, [key]);

  if (!state.ready) return null;
  return state.value;
}
