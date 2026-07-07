"use client";

import Link from "next/link";

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <p className="text-lg font-bold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-bold text-ink hover:bg-accent-dim"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

export function SkeletonList({ height = 136 }: { height?: number }) {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{ height }}
          className="animate-pulse rounded-xl border border-line bg-surface"
        />
      ))}
    </div>
  );
}

/** Yellow-on-dark progress bar used across show cards and detail pages. */
export function ProgressBar({
  value,
  max,
  className = "",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-overlay ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  watching: "Watching",
  up_to_date: "Up to date",
  not_started: "Not started",
  finished: "Finished",
  archived: "Archived",
};
