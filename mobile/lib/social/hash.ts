/**
 * Normalization for contact matching. Email addresses are normalized to a
 * canonical form here (pure, unit-tested), then SHA-256 hashed in api.ts
 * before they ever leave the device — so we match friends without uploading
 * anyone's raw contact details. Email is the only contact detail we normalize
 * or hash; phone numbers are never read, normalized, or sent.
 */

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
