import { SCHOLARMANCY_SMS_BRAND, SMS_STOP_SUFFIX } from '@scholaracle/contracts';

const GSM_SINGLE_SEGMENT = 160;
const ELLIPSIS = '...';

/**
 * Prefix the brand when missing, end with STOP language when missing, and trim the
 * message (never the STOP language) to one segment when possible.
 */
export function ensureBrandSmsBody(body: string, brand = SCHOLARMANCY_SMS_BRAND): string {
  const trimmed = body.trim();
  const withBrand = trimmed.startsWith(`${brand}:`) ? trimmed : `${brand}: ${trimmed}`;
  const suffix = /\bSTOP\b/.test(withBrand) ? '' : ` ${SMS_STOP_SUFFIX}`;
  if (withBrand.length + suffix.length <= GSM_SINGLE_SEGMENT) {
    return `${withBrand}${suffix}`;
  }
  const room = GSM_SINGLE_SEGMENT - suffix.length - ELLIPSIS.length;
  return `${withBrand.slice(0, room).trimEnd()}${ELLIPSIS}${suffix}`;
}
