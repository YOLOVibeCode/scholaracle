/** Canonical public URLs Apple Review and TestFlight must open without a session. */
export const STORE_LEGAL_URLS = {
  privacy: 'https://scholarmancy.com/privacy',
  terms: 'https://scholarmancy.com/terms',
  support: 'https://scholarmancy.com/support',
  deleteAccount: 'https://scholarmancy.com/delete-account',
  marketing: 'https://scholarmancy.com',
  /** Web-only plans (no IAP in app). */
  pricing: 'https://scholarmancy.com/pricing',
  /** Web billing page (manage an existing plan). Shown on iOS to US-locale devices only. */
  billing: 'https://scholarmancy.com/dashboard/billing',
} as const;
