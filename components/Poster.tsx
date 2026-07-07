"use client";

import { useState } from "react";

/** Poster image with a generated-initials fallback when artwork is missing. */
export default function Poster({
  src,
  name,
  className = "",
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
    // Deterministic hue from the show name so fallbacks stay distinct.
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    const hue = Math.abs(hash) % 360;
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 35% 22%), hsl(${(hue + 40) % 360} 45% 12%))`,
        }}
        role="img"
        aria-label={name}
      >
        <span className="select-none text-2xl font-extrabold text-white/70">
          {initials}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
