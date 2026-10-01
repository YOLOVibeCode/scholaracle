/**
 * US-default E.164 normalizer. Toll-free compliance targets libphonenumber-js once
 * the lockfile is updated (human-reviewed dependency gate).
 */
export function normalizePhoneE164(input: string, defaultRegion: 'US' = 'US'): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Phone number is required');
  }
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    if (digits.length >= 10 && digits.length <= 15) {
      return `+${digits}`;
    }
    throw new Error('Invalid phone number');
  }
  if (defaultRegion === 'US') {
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
  }
  throw new Error('Invalid phone number');
}
