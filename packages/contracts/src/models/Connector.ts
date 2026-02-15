/**
 * Connector specification types.
 *
 * Defines the contract for platform adapters, platform discovery,
 * credential handling, and capability reporting.
 */

// ---------------------------------------------------------------------------
// Platform integration tiers
// ---------------------------------------------------------------------------

/** How a platform is integrated — determines the adapter implementation strategy. */
export type ConnectorTier =
  | 'api' // Platform has a documented REST API (Canvas, Google Classroom, Schoology, Aeries, Alma)
  | 'oneroster' // Platform supports the OneRoster 1.2 interop standard (Infinite Campus, Skyward, Blackbaud, FACTS)
  | 'partner' // API exists but requires formal partnership / approval (PowerSchool, Skyward SMS 2.0, TxEIS)
  | 'scrape'; // No public API — browser automation required (Synergy/ParentVUE, custom portals)

// ---------------------------------------------------------------------------
// Authentication methods
// ---------------------------------------------------------------------------

/** Authentication method required by the platform. */
export type ConnectorAuthMethod =
  | 'bearer-token' // Static API token in Authorization header (Canvas)
  | 'oauth2' // OAuth 2.0 authorization code or client credentials (Google Classroom, OneRoster)
  | 'oauth1' // OAuth 1.0a three-legged (Schoology)
  | 'api-key' // API key in header or query param (Aeries, Alma, FACTS)
  | 'certificate' // Client certificate + API key (Aeries districts)
  | 'credentials'; // Username/password for browser-based scraping

// ---------------------------------------------------------------------------
// Adapter capabilities
// ---------------------------------------------------------------------------

/** What SLC entity types an adapter can provide. */
export interface IConnectorCapabilities {
  readonly assignments: boolean;
  readonly grades: boolean;
  readonly attendance: boolean;
  readonly calendar: boolean;
  readonly courses: boolean;
  readonly terms: boolean;
  readonly institutions: boolean;
}

// ---------------------------------------------------------------------------
// Platform descriptors (static registry of known platforms)
// ---------------------------------------------------------------------------

/** Metadata describing a known school platform and how to integrate with it. */
export interface IPlatformDescriptor {
  /** Short identifier: 'canvas', 'google-classroom', 'schoology', etc. */
  readonly provider: string;
  /** Reverse-domain adapter ID: 'com.instructure.canvas', etc. */
  readonly adapterId: string;
  /** Human-readable name: 'Canvas LMS' */
  readonly displayName: string;
  /** Platform type: SIS, LMS, or both. */
  readonly platformType: 'sis' | 'lms' | 'sis+lms';
  /** Integration tier. */
  readonly tier: ConnectorTier;
  /** Required authentication method. */
  readonly authMethod: ConnectorAuthMethod;
  /** What data this platform can provide. */
  readonly capabilities: IConnectorCapabilities;
  /** Regex patterns to detect this platform from a URL (matched against the full URL). */
  readonly urlPatterns: readonly string[];
  /** Template for constructing API base URL: '{baseUrl}/api/v1' */
  readonly apiBaseUrlTemplate?: string;
  /** Link to official developer documentation. */
  readonly docsUrl?: string;
  /** Approximate US K-12 market share (informational). */
  readonly marketShareNote?: string;
  /** Implementation status within Scholaracle. */
  readonly status: 'implemented' | 'planned' | 'needs-partnership' | 'needs-scraper';
}

// ---------------------------------------------------------------------------
// Credentials (extended, backwards-compatible with ILmsCredentials)
// ---------------------------------------------------------------------------

/**
 * Extended credentials supporting all authentication methods.
 *
 * Each adapter validates that the fields it needs are present in `authenticate()`.
 * All fields except `baseUrl` are optional to support the widest range of platforms.
 */
export interface IConnectorCredentials {
  /** Base URL of the school platform (e.g., 'https://school.instructure.com'). */
  readonly baseUrl: string;

  // --- Bearer token / OAuth 2.0 ---
  /** Access token (static API token or OAuth access token). */
  readonly accessToken?: string;
  /** OAuth 2.0 refresh token for token renewal. */
  readonly refreshToken?: string;
  /** OAuth 2.0 client ID. */
  readonly clientId?: string;
  /** OAuth 2.0 client secret. */
  readonly clientSecret?: string;

  // --- OAuth 1.0a (Schoology) ---
  /** OAuth 1.0a consumer key. */
  readonly consumerKey?: string;
  /** OAuth 1.0a consumer secret. */
  readonly consumerSecret?: string;
  /** OAuth 1.0a access token. */
  readonly oauthToken?: string;
  /** OAuth 1.0a token secret. */
  readonly oauthTokenSecret?: string;

  // --- API key (Aeries, Alma, FACTS) ---
  /** API key for key-based authentication. */
  readonly apiKey?: string;

  // --- Browser scraping ---
  /** Username for form-based login. */
  readonly username?: string;
  /** Password for form-based login. */
  readonly password?: string;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** Result of attempting to detect what platform a school URL is running. */
export interface IPlatformDetectionResult {
  /** Whether a platform was detected. */
  readonly detected: boolean;
  /** Provider identifier (null if not detected). */
  readonly provider: string | null;
  /** Adapter ID (null if not detected). */
  readonly adapterId: string | null;
  /** Confidence level of the detection. */
  readonly confidence: 'high' | 'medium' | 'low';
  /** Human-readable descriptions of what signals were found. */
  readonly signals: readonly string[];
  /** Suggested authentication method based on the detected platform. */
  readonly suggestedAuthMethod: ConnectorAuthMethod | 'unknown';
  /** Detected API base URL (if applicable). */
  readonly apiBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Capability probing (optional interface for adapters)
// ---------------------------------------------------------------------------

/**
 * Optional interface for adapters that can report their capabilities.
 *
 * Not all adapters implement this. Use a type guard or `instanceof` check.
 * Adapters that implement this can dynamically report what entity types
 * they support, which may vary based on the specific school/district config.
 */
export interface IConnectorCapabilityProber {
  probeCapabilities(): Promise<IConnectorCapabilities>;
}
