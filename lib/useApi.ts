"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal data-fetching hook: GET a JSON endpoint, expose refresh(). */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const gen = ++generation.current;
    setLoading(true);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (gen !== generation.current) return; // stale response
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
      } else {
        setData(json);
        setError(null);
      }
    } catch (err) {
      if (gen === generation.current) setError((err as Error).message);
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refresh: load };
}

export async function postJson<T = unknown>(
  url: string,
  body?: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST"
): Promise<{ ok: boolean; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        error:
          (data as { error?: string } | null)?.error ??
          `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: data as T, error: null };
  } catch (err) {
    return { ok: false, data: null, error: (err as Error).message };
  }
}
