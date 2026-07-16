/**
 * Normalization for contact matching. Phone numbers and emails are normalized
 * to a canonical form here (pure, unit-tested), then SHA-256 hashed in api.ts
 * before they ever leave the device — so we match friends without uploading
 * anyone's raw contact details.
 */

/**
 * Best-effort E.164-ish normalization: strip everything but digits, honor a
 * leading "+", and apply a default country calling code to local numbers.
 * Returns null for anything too short to be a real number.
 */
export function normalizePhone(
  raw: string,
  defaultCountryCode = ""
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;

  if (hasPlus) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2); // 00 international prefix
  } else if (digits.startsWith("0")) {
    // national trunk prefix → replace with country code
    digits = defaultCountryCode.replace(/\D/g, "") + digits.slice(1);
  } else if (defaultCountryCode) {
    digits = defaultCountryCode.replace(/\D/g, "") + digits;
  }

  if (digits.length < 7 || digits.length > 15) return null;
  return "+" + digits;
}

export function normalizeEmail(raw: string): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
