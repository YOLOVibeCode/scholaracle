/**
 * US storefront gating uses the device locale string (not Apple/Google storefront APIs).
 * Treat en-US (and en-US-*) as US for outbound web pricing links per App Review 3.1.3.
 */
export function resolvedDeviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function isUsStorefrontLocale(locale: string): boolean {
  const normalized = locale.trim().replace(/_/g, '-').toLowerCase();
  return normalized === 'en-us' || normalized.startsWith('en-us-');
}
