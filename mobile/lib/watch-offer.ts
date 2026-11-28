/**
 * TMDB's watch/providers region block, reduced to what the detail screens
 * show: subscription (flatrate), then rent, then buy. Logos come from TMDB's
 * image CDN. The same provider is listed once, under the way you can watch
 * it without paying extra, so a title on Netflix does not also appear as a
 * rental.
 */

const LOGO = "https://image.tmdb.org/t/p/w154";

export interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string | null;
  priority: number;
}

export interface WatchOffer {
  region: string;
  /** TMDB's page for this title's providers. Null when the region has none. */
  link: string | null;
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
}

interface RawProvider {
  logo_path?: unknown;
  provider_id?: unknown;
  provider_name?: unknown;
  display_priority?: unknown;
}

function asProviders(value: unknown): RawProvider[] {
  return Array.isArray(value) ? (value as RawProvider[]) : [];
}

function logoUrl(path: unknown): string | null {
  return typeof path === "string" && path.startsWith("/") ? `${LOGO}${path}` : null;
}

function readGroup(value: unknown): WatchProvider[] {
  const out: WatchProvider[] = [];
  const seen = new Set<number>();
  for (const raw of asProviders(value)) {
    const id = raw.provider_id;
    const name = raw.provider_name;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) continue;
    if (typeof name !== "string" || !name.trim()) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const priority =
      typeof raw.display_priority === "number" && Number.isFinite(raw.display_priority)
        ? raw.display_priority
        : 1000;
    out.push({ id, name: name.trim(), logoUrl: logoUrl(raw.logo_path), priority });
  }
  out.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
  return out;
}

function without(group: WatchProvider[], drop: Set<number>): WatchProvider[] {
  return group.filter((p) => !drop.has(p.id));
}

/** `block` is one country object from TMDB, or null when that country is absent. */
export function normalizeWatchRegion(region: string, block: unknown): WatchOffer {
  const raw =
    block && typeof block === "object" ? (block as Record<string, unknown>) : null;
  const link = raw && typeof raw.link === "string" && raw.link ? raw.link : null;
  const flatrate = readGroup(raw?.flatrate);
  const have = new Set(flatrate.map((p) => p.id));
  return {
    region,
    link,
    flatrate,
    rent: without(readGroup(raw?.rent), have),
    buy: without(readGroup(raw?.buy), have),
  };
}

export function watchOfferIsEmpty(offer: WatchOffer): boolean {
  return (
    offer.flatrate.length === 0 && offer.rent.length === 0 && offer.buy.length === 0
  );
}
