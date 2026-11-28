/**
 * ISO 3166-1 alpha-2 region for TMDB watch providers.
 *
 * Taken from the device locale ("en-GB", "zh-Hans-CN", "pt_BR"), never from
 * GPS. A locale with no region ("en") falls back to US, which is what TMDB
 * has the most complete provider data for.
 */

export const FALLBACK_REGION = "US";

export function regionFromLocale(
  locale: string | null | undefined,
  fallback = FALLBACK_REGION
): string {
  if (!locale) return fallback;
  // Drop a Unicode extension ("en-US-u-ca-gregory") and a legacy @suffix.
  const base = locale.trim().replace(/_/g, "-").split("@")[0]?.split("-u-")[0] ?? "";
  const parts = base.split("-").filter(Boolean);
  if (parts.length < 2) return fallback;
  // Language, optional 4-letter script, then the region.
  const region = /^[A-Za-z]{4}$/.test(parts[1]) ? parts[2] : parts[1];
  if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  return fallback;
}
