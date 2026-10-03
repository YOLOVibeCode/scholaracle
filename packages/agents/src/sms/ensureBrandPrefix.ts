import { SCHOLARMANCY_SMS_BRAND } from '@scholaracle/contracts';

const GSM_SINGLE_SEGMENT = 160;

/** Prefix brand when missing; trim to one segment when possible. */
export function ensureBrandSmsBody(body: string, brand = SCHOLARMANCY_SMS_BRAND): string {
  const trimmed = body.trim();
  const prefix = `${brand}: `;
  const withBrand = trimmed.startsWith(`${brand}:`) ? trimmed : `${prefix}${trimmed}`;
  if (withBrand.length <= GSM_SINGLE_SEGMENT) {
    return withBrand;
  }
  return `${withBrand.slice(0, GSM_SINGLE_SEGMENT - 3)}...`;
}
