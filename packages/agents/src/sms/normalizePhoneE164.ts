import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalizes a phone string to E.164 using libphonenumber-js (default region US).
 */
export function normalizePhoneE164(input: string, defaultRegion: 'US' = 'US'): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Phone number is required');
  }
  const parsed = parsePhoneNumberFromString(trimmed, defaultRegion);
  if (!parsed?.isValid()) {
    return null;
  }
  return parsed.number;
}
