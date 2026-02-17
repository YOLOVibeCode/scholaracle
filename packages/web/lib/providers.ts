/**
 * Shared provider registry for the web UI.
 *
 * Single source of truth consumed by AddStudentWizard, AddProviderWizard,
 * and any other component that needs to display or configure providers.
 *
 * Each entry contains:
 *  - Identification (id, adapterId, display name)
 *  - Auth method and what credentials the parent needs
 *  - Help text guiding the parent to find their credentials
 *  - URL patterns for auto-detection
 *  - Capability flags for which data types are available
 *  - UI metadata (icon hint, placeholder URL)
 */

// ---------------------------------------------------------------------------
// Auth method type
// ---------------------------------------------------------------------------

export type ProviderAuthMethod =
  | 'bearer-token'
  | 'oauth2'
  | 'credentials'
  | 'api-key';

// ---------------------------------------------------------------------------
// Provider descriptor
// ---------------------------------------------------------------------------

export interface IProviderDescriptor {
  /** Short ID: 'canvas', 'google-classroom', etc. */
  readonly id: string;
  /** Reverse-domain adapter ID. */
  readonly adapterId: string;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Short description for the provider card. */
  readonly description: string;
  /** Whether the adapter is implemented and available. */
  readonly available: boolean;
  /** Required authentication method. */
  readonly authMethod: ProviderAuthMethod;
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
  /** Step-by-step instructions to obtain credentials. */
  readonly steps: readonly string[];
  /** Which fields to show in the credential form. */
  readonly fields: readonly ProviderCredentialField[];
  /** Optional link to official documentation. */
  readonly docsUrl?: string;
  /** Optional note displayed below the form. */
  readonly note?: string;
}

export type ProviderCredentialField =
  | 'accessToken'
  | 'username'
  | 'password'
  | 'clientId'
  | 'clientSecret'
  | 'apiKey';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const PROVIDERS: readonly IProviderDescriptor[] = [
  {
    id: 'canvas',
    adapterId: 'com.instructure.canvas',
    name: 'Canvas LMS',
    description: 'By Instructure — used by many schools and universities',
    available: true,
    authMethod: 'bearer-token',
    urlPlaceholder: 'https://yourschool.instructure.com',
    urlPatterns: [/instructure\.com/i, /\/api\/v1\/courses/i, /\/login\/canvas/i],
    dataTypes: ['grades', 'assignments', 'calendar'],
    credentialHelp: {
      title: 'Canvas API Token',
      steps: [
        'Log in to Canvas as the student (or parent/observer)',
        'Click the profile icon → Settings',
        'Scroll to "Approved Integrations" and click "+ New Access Token"',
        'Enter a purpose (e.g., "Scholaracle") and click "Generate Token"',
        'Copy the token — you won\'t be able to see it again!',
      ],
      fields: ['accessToken'],
      docsUrl: 'https://community.canvaslms.com/t5/Canvas-Basics-Guide/How-do-I-manage-API-access-tokens/ta-p/47',
      note: 'The token gives read-only access to the student\'s courses, grades, and assignments.',
    },
  },
  {
    id: 'google-classroom',
    adapterId: 'com.google.classroom',
    name: 'Google Classroom',
    description: 'By Google — the most widely used LMS in K-12',
    available: true,
    authMethod: 'oauth2',
    urlPlaceholder: 'https://classroom.google.com',
    urlPatterns: [/classroom\.google\.com/i],
    dataTypes: ['grades', 'assignments'],
    credentialHelp: {
      title: 'Google Account Sign-In',
      steps: [
        'Click "Connect with Google" below',
        'Sign in with the student\'s Google account (or the parent\'s if linked as a guardian)',
        'Grant Scholaracle permission to read courses and grades',
        'You\'ll be redirected back here automatically',
      ],
      fields: [],
      docsUrl: 'https://support.google.com/edu/classroom/answer/6388136',
      note: 'We only request read-only access. We never modify grades or assignments.',
    },
  },
  {
    id: 'skyward',
    adapterId: 'com.skyward',
    name: 'Skyward',
    description: 'Family Access / Student portal — used by many districts',
    available: true,
    authMethod: 'credentials',
    urlPlaceholder: 'https://skyward.yourdistrict.net/...',
    urlPatterns: [/skyward\.com/i, /\/skyward\//i, /wsisa\.dll/i],
    dataTypes: ['grades', 'assignments'],
    credentialHelp: {
      title: 'Skyward Portal Login',
      steps: [
        'Enter your student\'s Skyward Family Access login URL above',
        'This is the URL where you normally sign in to see grades',
        'Enter the student\'s username and password below',
        'These are the same credentials the student uses to log in',
      ],
      fields: ['username', 'password'],
      note: 'Credentials are encrypted before storage. We use them only to fetch grade data.',
    },
  },
  {
    id: 'oneroster',
    adapterId: 'org.imsglobal.oneroster.1.2',
    name: 'OneRoster (Infinite Campus, etc.)',
    description: 'Universal standard — works with Infinite Campus, Skyward Qmlativ, Blackbaud, and more',
    available: true,
    authMethod: 'oauth2',
    urlPlaceholder: 'https://sis.yourdistrict.edu/ims/oneroster/v1p2',
    urlPatterns: [/\/ims\/oneroster/i, /infinitecampus\.com/i, /\/campus\//i],
    dataTypes: ['grades', 'assignments', 'attendance'],
    credentialHelp: {
      title: 'OneRoster API Credentials',
      steps: [
        'Ask your school\'s IT administrator for OneRoster API access',
        'They will provide a Client ID and Client Secret',
        'Enter the OneRoster endpoint URL above (your school will provide this)',
        'Enter the credentials below',
      ],
      fields: ['clientId', 'clientSecret'],
      docsUrl: 'https://www.1edtech.org/standards/oneroster',
      note: 'OneRoster is an industry standard supported by most modern school systems. Your school\'s IT department can enable this.',
    },
  },
  {
    id: 'schoology',
    adapterId: 'com.schoology.lms',
    name: 'Schoology',
    description: 'By PowerSchool — popular LMS in K-12',
    available: false,
    authMethod: 'oauth2',
    urlPlaceholder: 'https://yourschool.schoology.com',
    urlPatterns: [/schoology\.com/i],
    dataTypes: ['grades', 'assignments', 'attendance', 'calendar'],
    credentialHelp: {
      title: 'Schoology API Keys',
      steps: [
        'Log in to Schoology',
        'Go to your account settings → API',
        'Generate a new consumer key and secret',
      ],
      fields: ['apiKey'],
      docsUrl: 'https://developers.schoology.com/',
    },
  },
  {
    id: 'powerschool',
    adapterId: 'com.powerschool.sis',
    name: 'PowerSchool SIS',
    description: 'The largest SIS in the US — requires district partnership',
    available: false,
    authMethod: 'oauth2',
    urlPlaceholder: 'https://powerschool.yourdistrict.edu',
    urlPatterns: [/powerschool\.com/i, /\/guardian\//i, /\/public\/home\.html/i],
    dataTypes: ['grades', 'assignments', 'attendance'],
    credentialHelp: {
      title: 'PowerSchool API Access',
      steps: [
        'PowerSchool requires district-level API partnership',
        'Contact your school district to request API access',
      ],
      fields: ['clientId', 'clientSecret'],
      docsUrl: 'https://support.powerschool.com/developer',
      note: 'We are working to establish direct partnerships with PowerSchool districts.',
    },
  },
  {
    id: 'parentvue',
    adapterId: 'com.edupoint.parentvue',
    name: 'ParentVUE / StudentVUE',
    description: 'Synergy SIS — used by many districts',
    available: false,
    authMethod: 'credentials',
    urlPlaceholder: 'https://portal.yourdistrict.edu/PXP2_Login.aspx',
    urlPatterns: [/PXP2_Login/i, /parentvue/i, /studentvue/i],
    dataTypes: ['grades', 'assignments', 'attendance', 'calendar'],
    credentialHelp: {
      title: 'ParentVUE / StudentVUE Login',
      steps: [
        'Enter the login URL for your district\'s ParentVUE or StudentVUE portal',
        'Enter the student\'s username and password',
      ],
      fields: ['username', 'password'],
      note: 'Coming soon — we are building browser automation for ParentVUE/StudentVUE portals.',
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all available (implemented) providers. */
export function getAvailableProviders(): readonly IProviderDescriptor[] {
  return PROVIDERS.filter((p) => p.available);
}

/** Get all providers (including unavailable / coming soon). */
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
