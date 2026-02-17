/**
 * Shared provider registry for the web UI.
 *
 * All providers use browser-based web scraping with the parent's school portal
 * credentials (username + password). No API tokens or OAuth.
 *
 * Each entry contains:
 *  - Identification (id, adapterId, display name)
 *  - Help text for credential entry
 *  - URL patterns for auto-detection
 *  - Capability flags for which data types are available
 *  - UI metadata (brandColor, placeholder URL)
 */

// ---------------------------------------------------------------------------
// Provider descriptor
// ---------------------------------------------------------------------------

export interface IProviderDescriptor {
  /** Short ID: 'canvas', 'skyward', 'aeries', etc. */
  readonly id: string;
  /** Reverse-domain adapter ID. */
  readonly adapterId: string;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Short description for the provider card. */
  readonly description: string;
  /** Whether we have a reference scraper (ready to use) or need AI generation. */
  readonly available: boolean;
  /** Hex color for the provider icon (e.g. #E8471B). */
  readonly brandColor: string;
  /** Placeholder for the school URL input. */
  readonly urlPlaceholder: string;
  /** Regex patterns to auto-detect this provider from a URL. */
  readonly urlPatterns: readonly RegExp[];
  /** Available data types this provider supports. */
  readonly dataTypes: readonly string[];
  /** Help text shown during credential entry. */
  readonly credentialHelp: IProviderCredentialHelp;
}

export interface IProviderCredentialHelp {
  /** Title for the credentials section. */
  readonly title: string;
  /** Step-by-step instructions (e.g. "Enter the URL where you log in to see grades"). */
  readonly steps: readonly string[];
  /** Optional link to official documentation. */
  readonly docsUrl?: string;
  /** Optional note displayed below the form. */
  readonly note?: string;
}

// ---------------------------------------------------------------------------
// Registry — credentials-only web portal scrapers
// ---------------------------------------------------------------------------

export const PROVIDERS: readonly IProviderDescriptor[] = [
  {
    id: 'canvas',
    adapterId: 'com.instructure.canvas',
    name: 'Canvas LMS',
    description: 'By Instructure — used by many schools and universities',
    available: true,
    brandColor: '#E8471B',
    urlPlaceholder: 'https://yourschool.instructure.com',
    urlPatterns: [/instructure\.com/i, /\/api\/v1\/courses/i, /\/login\/canvas/i],
    dataTypes: ['grades', 'assignments', 'calendar'],
    credentialHelp: {
      title: 'Canvas Portal Login',
      steps: [
        'Enter your school\'s Canvas URL above (where you log in to see grades)',
        'Enter the username and password you use to check your child\'s grades',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      docsUrl: 'https://community.canvaslms.com/',
      note: 'Use the same login you use in a browser to view Canvas.',
    },
  },
  {
    id: 'aeries',
    adapterId: 'com.aeries',
    name: 'Aeries',
    description: 'Student information system — used by many California districts',
    available: true,
    brandColor: '#1565C0',
    urlPlaceholder: 'https://yourdistrict.aeries.net/student/LoginParent.aspx',
    urlPatterns: [/aeries\.net/i, /aeries\.com/i],
    dataTypes: ['grades', 'assignments', 'attendance'],
    credentialHelp: {
      title: 'Aeries Parent Portal Login',
      steps: [
        'Enter your district\'s Aeries parent portal URL above',
        'Enter the username and password you use to log in',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      note: 'Use the same login you use in a browser to view Aeries.',
    },
  },
  {
    id: 'skyward',
    adapterId: 'com.skyward',
    name: 'Skyward',
    description: 'Family Access / Student portal — used by many districts',
    available: true,
    brandColor: '#0D47A1',
    urlPlaceholder: 'https://skyward.yourdistrict.net/...',
    urlPatterns: [/skyward\.com/i, /\/skyward\//i, /wsisa\.dll/i],
    dataTypes: ['grades', 'assignments'],
    credentialHelp: {
      title: 'Skyward Portal Login',
      steps: [
        'Enter your Skyward Family Access login URL above',
        'Enter the username and password you use to see grades',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      note: 'Use the same login you use in a browser to view Skyward.',
    },
  },
  {
    id: 'parentvue',
    adapterId: 'com.edupoint.parentvue',
    name: 'ParentVUE / StudentVUE',
    description: 'Synergy SIS — used by many districts',
    available: false,
    brandColor: '#5E35B1',
    urlPlaceholder: 'https://portal.yourdistrict.edu/PXP2_Login.aspx',
    urlPatterns: [/PXP2_Login/i, /parentvue/i, /studentvue/i],
    dataTypes: ['grades', 'assignments', 'attendance', 'calendar'],
    credentialHelp: {
      title: 'ParentVUE / StudentVUE Login',
      steps: [
        'Enter the login URL for your district\'s ParentVUE or StudentVUE portal',
        'Enter the username and password you use to see grades',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      note: 'Coming soon — we are building browser automation for ParentVUE/StudentVUE portals.',
    },
  },
  {
    id: 'powerschool',
    adapterId: 'com.powerschool.sis',
    name: 'PowerSchool',
    description: 'The largest SIS in the US — parent portal login',
    available: false,
    brandColor: '#C62828',
    urlPlaceholder: 'https://powerschool.yourdistrict.edu',
    urlPatterns: [/powerschool\.com/i, /\/guardian\//i, /\/public\/home\.html/i],
    dataTypes: ['grades', 'assignments', 'attendance'],
    credentialHelp: {
      title: 'PowerSchool Parent Portal Login',
      steps: [
        'Enter your district\'s PowerSchool parent portal URL above',
        'Enter the username and password you use to see grades',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      docsUrl: 'https://support.powerschool.com/',
      note: 'Coming soon — we are building browser automation for PowerSchool portals.',
    },
  },
  {
    id: 'schoology',
    adapterId: 'com.schoology.lms',
    name: 'Schoology',
    description: 'By PowerSchool — popular LMS in K-12',
    available: false,
    brandColor: '#00897B',
    urlPlaceholder: 'https://yourschool.schoology.com',
    urlPatterns: [/schoology\.com/i],
    dataTypes: ['grades', 'assignments', 'attendance', 'calendar'],
    credentialHelp: {
      title: 'Schoology Login',
      steps: [
        'Enter your school\'s Schoology URL above',
        'Enter the username and password you use to see grades',
        'Credentials are baked into the downloaded script and never stored on our servers',
      ],
      docsUrl: 'https://support.schoology.com/',
      note: 'Coming soon — we are building browser automation for Schoology.',
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all available (reference scraper ready) providers. */
export function getAvailableProviders(): readonly IProviderDescriptor[] {
  return PROVIDERS.filter((p) => p.available);
}

/** Get all providers (including coming soon). */
export function getAllProviders(): readonly IProviderDescriptor[] {
  return PROVIDERS;
}

/** Find a provider by ID. */
export function findProviderById(id: string): IProviderDescriptor | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Auto-detect a provider from a URL (client-side, no network). */
export function detectProviderFromUrl(url: string): IProviderDescriptor | undefined {
  if (!url) return undefined;
  for (const provider of PROVIDERS) {
    for (const pattern of provider.urlPatterns) {
      if (pattern.test(url)) return provider;
    }
  }
  return undefined;
}
