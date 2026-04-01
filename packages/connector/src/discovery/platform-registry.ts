import type { IPlatformDescriptor } from '@scholaracle/contracts';

/**
 * Static registry of all known school platforms.
 *
 * Each entry describes the platform, its API capabilities, how to detect it
 * from a URL, and the current implementation status within Scholaracle.
 */
export const PLATFORM_DESCRIPTORS: readonly IPlatformDescriptor[] = [
  // -------------------------------------------------------------------------
  // Tier 1: Platforms with Developer APIs
  // -------------------------------------------------------------------------

  {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    displayName: 'Canvas LMS',
    platformType: 'lms',
    tier: 'api',
    authMethod: 'bearer-token',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: false,
      calendar: true,
      courses: true,
      terms: false,
      institutions: false,
    },
    urlPatterns: ['instructure\\.com', '/api/v1/courses', '/login/canvas'],
    apiBaseUrlTemplate: '{baseUrl}/api/v1',
    docsUrl: 'https://canvas.instructure.com/doc/api/',
    marketShareNote: '~30% of LMS market',
    status: 'implemented',
  },

  {
    provider: 'google-classroom',
    adapterId: 'com.google.classroom',
    displayName: 'Google Classroom',
    platformType: 'lms',
    tier: 'api',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: false,
      calendar: false,
      courses: true,
      terms: false,
      institutions: false,
    },
    urlPatterns: ['classroom\\.google\\.com'],
    apiBaseUrlTemplate: 'https://classroom.googleapis.com/v1',
    docsUrl: 'https://developers.google.com/classroom',
    marketShareNote: '~50%+ of K-12 (largest by adoption)',
    status: 'implemented',
  },

  {
    provider: 'schoology',
    adapterId: 'com.schoology.lms',
    displayName: 'Schoology',
    platformType: 'lms',
    tier: 'api',
    authMethod: 'oauth1',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: true,
      courses: true,
      terms: true,
      institutions: false,
    },
    urlPatterns: ['schoology\\.com', 'lms\\..*\\.schoology\\.com'],
    apiBaseUrlTemplate: '{baseUrl}/v1',
    docsUrl: 'https://developers.schoology.com/api-documentation/rest-api-v1/',
    marketShareNote: '~20% of K-12 LMS',
    status: 'planned',
  },

  {
    provider: 'aeries',
    adapterId: 'com.aeries.sis',
    displayName: 'Aeries SIS',
    platformType: 'sis',
    tier: 'api',
    authMethod: 'api-key',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['aeries\\.net', '/aeries/'],
    apiBaseUrlTemplate: '{baseUrl}/api/v5',
    docsUrl:
      'https://support.aeries.com/support/solutions/articles/14000077926-aeries-api-full-documentation',
    marketShareNote: 'Significant in California',
    status: 'planned',
  },

  {
    provider: 'alma',
    adapterId: 'com.getalma.sis',
    displayName: 'Alma SIS',
    platformType: 'sis',
    tier: 'api',
    authMethod: 'api-key',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['getalma\\.com', 'alma\\.app'],
    docsUrl: 'https://developers.exlibrisgroup.com/alma/apis/',
    marketShareNote: 'Growing in private/charter schools',
    status: 'planned',
  },

  // -------------------------------------------------------------------------
  // Tier 2: OneRoster-Compatible Platforms
  // -------------------------------------------------------------------------

  {
    provider: 'oneroster',
    adapterId: 'org.imsglobal.oneroster.1.2',
    displayName: 'OneRoster 1.2 (Generic)',
    platformType: 'sis',
    tier: 'oneroster',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: false,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['/ims/oneroster', '/.well-known/oneroster'],
    apiBaseUrlTemplate: '{baseUrl}/ims/oneroster/v1p2',
    docsUrl: 'https://www.imsglobal.org/spec/oneroster/v1p2',
    marketShareNote: 'Standard supported by many SIS platforms',
    status: 'implemented',
  },

  {
    provider: 'infinite-campus',
    adapterId: 'com.infinitecampus.sis',
    displayName: 'Infinite Campus',
    platformType: 'sis',
    tier: 'oneroster',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['infinitecampus\\.com', '/campus/'],
    apiBaseUrlTemplate: '{baseUrl}/ims/oneroster/v1p2',
    docsUrl: 'https://www.infinitecampus.com/',
    marketShareNote: '~10% of SIS market; uses OneRoster for third-party access',
    status: 'planned',
  },

  {
    provider: 'skyward-qmlativ',
    adapterId: 'com.skyward.qmlativ',
    displayName: 'Skyward Qmlativ',
    platformType: 'sis',
    tier: 'oneroster',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['skyward\\.com', '/skyward/'],
    docsUrl: 'https://www.skyward.com/qmlativ',
    marketShareNote: '~7% of SIS market (modern version)',
    status: 'implemented',
  },

  {
    provider: 'blackbaud',
    adapterId: 'com.blackbaud.k12',
    displayName: 'Blackbaud Education Management',
    platformType: 'sis+lms',
    tier: 'oneroster',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: true,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['myschoolapp\\.com', 'blackbaud\\.com'],
    docsUrl: 'https://developer.blackbaud.com/',
    marketShareNote: '~3% of SIS market; private K-12; also has SKY API',
    status: 'planned',
  },

  {
    provider: 'facts',
    adapterId: 'com.factsmgt.sis',
    displayName: 'FACTS SIS (RenWeb)',
    platformType: 'sis',
    tier: 'oneroster',
    authMethod: 'api-key',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: false,
    },
    urlPatterns: ['factsmgt\\.com', 'renweb\\.com'],
    docsUrl: 'https://factsmgt.com/',
    marketShareNote: '~15% of SIS market; private/faith-based schools; $500/yr API fee',
    status: 'planned',
  },

  // -------------------------------------------------------------------------
  // Tier 3: Partner-Only API
  // -------------------------------------------------------------------------

  {
    provider: 'powerschool',
    adapterId: 'com.powerschool.sis',
    displayName: 'PowerSchool SIS',
    platformType: 'sis',
    tier: 'partner',
    authMethod: 'oauth2',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['powerschool\\.com', '/guardian/', '/public/home\\.html'],
    docsUrl: 'https://support.powerschool.com/developer',
    marketShareNote: '~23% of SIS market (largest single SIS)',
    status: 'needs-partnership',
  },

  {
    provider: 'txeis-ascender',
    adapterId: 'com.txeis.ascender',
    displayName: 'TxEIS / Ascender',
    platformType: 'sis',
    tier: 'partner',
    authMethod: 'api-key',
    capabilities: {
      assignments: false,
      grades: true,
      attendance: true,
      calendar: false,
      courses: true,
      terms: true,
      institutions: true,
    },
    urlPatterns: ['txeis\\.net', 'ascendertx\\.com'],
    docsUrl: 'https://ascendertx.com/',
    marketShareNote: '~3% (850+ Texas districts)',
    status: 'needs-partnership',
  },

  // -------------------------------------------------------------------------
  // Tier 4: No Public API (scraping required)
  // -------------------------------------------------------------------------

  {
    provider: 'synergy-parentvue',
    adapterId: 'com.edupoint.parentvue',
    displayName: 'Synergy / ParentVUE',
    platformType: 'sis',
    tier: 'scrape',
    authMethod: 'credentials',
    capabilities: {
      assignments: true,
      grades: true,
      attendance: true,
      calendar: true,
      courses: true,
      terms: true,
      institutions: false,
    },
    urlPatterns: ['PXP2_Login\\.aspx', '/parentvue/', '/studentvue/'],
    docsUrl: 'https://www.edupoint.com/Products/ParentVUE-StudentVUE',
    marketShareNote: '~3% of SIS market; consistent ASP.NET UI across districts',
    status: 'needs-scraper',
  },
] as const;

/**
 * Look up a platform descriptor by provider name.
 */
export function findPlatformByProvider(provider: string): IPlatformDescriptor | undefined {
  return PLATFORM_DESCRIPTORS.find((p) => p.provider === provider);
}

/**
 * Look up a platform descriptor by adapter ID.
 */
export function findPlatformByAdapterId(adapterId: string): IPlatformDescriptor | undefined {
  return PLATFORM_DESCRIPTORS.find((p) => p.adapterId === adapterId);
}

/**
 * Get all platforms matching a given tier.
 */
export function getPlatformsByTier(
  tier: IPlatformDescriptor['tier']
): readonly IPlatformDescriptor[] {
  return PLATFORM_DESCRIPTORS.filter((p) => p.tier === tier);
}

/**
 * Get all platforms matching a given status.
 */
export function getPlatformsByStatus(
  status: IPlatformDescriptor['status']
): readonly IPlatformDescriptor[] {
  return PLATFORM_DESCRIPTORS.filter((p) => p.status === status);
}
