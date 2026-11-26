/**
 * Where a parent can get the phone app today.
 *
 * The site must only offer a download that exists. On 25 Nov 2026 `/get-app`
 * and `/magic` linked to App Store and Google Play listings that answered 404,
 * so a parent who was told to "finish connecting in the app" had nowhere to
 * get it.
 *
 * Change an entry on the day that listing is live, and not before:
 *   App Store   https://apps.apple.com/app/scholarmancy/id6798499288
 *   Google Play https://play.google.com/store/apps/details?id=com.scholarmancy.app
 * The page tests name both listings; update them in the same change.
 */

export type PhonePlatform = 'ios' | 'android';

export interface IAppDownload {
  /** Where the button goes. */
  readonly url: string;
  /** Button text. */
  readonly label: string;
  /** One line under the button for what the parent should know first. */
  readonly hint?: string;
}

/** `null` means there is no way to get the app on that platform today. */
export const APP_DOWNLOADS: Readonly<Record<PhonePlatform, IAppDownload | null>> = {
  ios: {
    // TestFlight public link for the PilotTesting group (production API build).
    url: 'https://testflight.apple.com/join/YMAKAqh8',
    label: 'Get the iPhone app (beta)',
    hint: 'The iPhone and iPad app is in beta. The link opens TestFlight, Apple’s app for beta versions.',
  },
  android: null,
};

/** What to say where a platform has no download. */
export const NO_APP_NOTE: Readonly<Record<PhonePlatform, string>> = {
  ios: 'The iPhone app is not in the App Store yet.',
  android: 'The Android app is not in Google Play yet.',
};

/** How to name the devices a platform's app runs on, mid-sentence. */
export const PLATFORM_DEVICES: Readonly<Record<PhonePlatform, string>> = {
  ios: 'an iPhone or iPad',
  android: 'an Android phone',
};

export function otherPlatform(platform: PhonePlatform): PhonePlatform {
  return platform === 'ios' ? 'android' : 'ios';
}

/** Which phone app, if any, this browser could open. `null` on a computer. */
export function detectPhonePlatform(userAgent: string): PhonePlatform | null {
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'ios';
  }
  if (/android|mobile/i.test(userAgent)) {
    return 'android';
  }
  return null;
}
