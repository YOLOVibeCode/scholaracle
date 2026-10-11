import { SCHOLARMANCY_SMS_BRAND, SMS_STOP_SUFFIX } from '@scholaracle/contracts';
import { toGsm7 } from './gsm7';

const GSM_SINGLE_SEGMENT = 160;
const ELLIPSIS = '...';

/**
 * Rewrite to GSM-7 (a single non-GSM character makes the whole text UCS-2 and triples the
 * segments), prefix the brand when missing, end with STOP language when missing, and trim the
 * message (never the STOP language) to one segment when possible.
 */
export function ensureBrandSmsBody(body: string, brand = SCHOLARMANCY_SMS_BRAND): string {
  const trimmed = toGsm7(body);
  const withBrand = trimmed.startsWith(`${brand}:`) ? trimmed : `${brand}: ${trimmed}`;
  const suffix = /\bSTOP\b/.test(withBrand) ? '' : ` ${SMS_STOP_SUFFIX}`;
  // A cut link is worse than a second segment: never shorten a text that carries a URL.
  if (withBrand.length + suffix.length <= GSM_SINGLE_SEGMENT || /https?:\/\//.test(withBrand)) {
    return `${withBrand}${suffix}`;
  }
  const room = GSM_SINGLE_SEGMENT - suffix.length - ELLIPSIS.length;
  return `${withBrand.slice(0, room).trimEnd()}${ELLIPSIS}${suffix}`;
}
