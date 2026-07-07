"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Poster from "@/components/Poster";
import { postJson } from "@/lib/useApi";
import type { RemoteShow } from "@/lib/types";

type Result = RemoteShow & { followed: boolean };

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const generation = useRef(0);

  // Debounced live search.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    const gen = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (gen !== generation.current) return;
        if (!res.ok) {
          setError(json.error ?? "Search failed");
        } else {
          setResults(json.results);
          setError(null);
          setSearched(true);
        }
      } catch (err) {
        if (gen === generation.current) setError((err as Error).message);
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const follow = async (show: Result) => {
    setResults((rs) =>
      rs.map((r) => (r.id === show.id ? { ...r, followed: true } : r))
    );
    const res = await postJson("/api/shows", { tvmazeId: show.id });
    if (!res.ok) {
      setResults((rs) =>
        rs.map((r) => (r.id === show.id ? { ...r, followed: false } : r))
      );
      setError(res.error);
    }
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight">Discover</h1>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a TV show…"
        autoFocus
        className="mb-6 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none placeholder:text-faint focus:border-accent"
      />

      {error && (
        <p className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {loading && <p className="text-sm text-muted">Searching…</p>}

      {!loading && searched && results.length === 0 && (
        <p className="text-sm text-muted">
          No shows found for “{query.trim()}”.
        </p>
      )}

      {!searched && !loading && (
        <p className="text-sm text-faint">
          Search TVmaze&apos;s catalog of 80,000+ shows. Everything you follow
          is stored locally in your own database.
        </p>
      )}

      <div className="space-y-3">
        {results.map((show) => (
          <div
            key={show.id}
            className="flex items-center gap-4 rounded-xl border border-line bg-surface p-3"
          >
            <Link href={`/show/${show.id}`} className="shrink-0">
              <Poster
                src={show.posterUrl}
                name={show.name}
                className="h-24 w-16 rounded-lg"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/show/${show.id}`}
                className="font-bold hover:text-accent"
              >
                {show.name}
              </Link>
              <div className="mt-0.5 text-xs text-muted">
                {[
                  show.premiered?.slice(0, 4),
                  show.network,
                  show.status,
                  show.genres.slice(0, 2).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {show.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-faint">
                  {show.summary}
                </p>
              )}
            </div>
            <button
              onClick={() => follow(show)}
              disabled={show.followed}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-bold transition-colors ${
                show.followed
                  ? "bg-overlay text-muted"
                  : "bg-accent text-ink hover:bg-accent-dim"
              }`}
            >
              {show.followed ? "Following ✓" : "+ Follow"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
