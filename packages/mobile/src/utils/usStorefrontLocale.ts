/**
 * US storefront gating uses the device locale string (not Apple/Google storefront APIs).
 * Treat en-US (and en-US-*) as US for outbound web pricing links per App Review 3.1.3.
 * Screens ask `canLinkToWebPlans`, which also takes the platform into account.
 */
export function resolvedDeviceLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

export function isUsStorefrontLocale(locale: string): boolean {
  const normalized = locale.trim().replace(/_/g, '-').toLowerCase();
  return normalized === 'en-us' || normalized.startsWith('en-us-');
}

/**
 * Whether this app may show an outbound link to plans or billing on scholarmancy.com.
 *
 * - iOS: only on a US-locale device. The US App Store allows a link to purchases made
 *   outside the app; other storefronts do not.
 * - Android: never. Google Play allows such links only in apps enrolled in its external
 *   content links program, and this app is not enrolled.
 * - Anything else: never.
 *
 * `platformOs` is React Native's `Platform.OS`, passed in so this stays a pure function.
 */
export function canLinkToWebPlans(platformOs: string, locale: string): boolean {
  return platformOs === 'ios' && isUsStorefrontLocale(locale);
}
