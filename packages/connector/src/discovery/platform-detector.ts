import type { IPlatformDetectionResult } from '@scholaracle/contracts';
import { PLATFORM_DESCRIPTORS } from './platform-registry';

/**
 * Detects what school platform a URL is running by checking:
 *  1. URL pattern matching against known platform descriptors
 *  2. (Optional) HTTP probing of the landing page for platform-specific signals
 *
 * Usage:
 *   const result = detectPlatformFromUrl('https://school.instructure.com');
 *   // → { detected: true, provider: 'canvas', confidence: 'high', ... }
 *
 *   const result = await detectPlatform('https://mystery-school.edu/portal');
 *   // → probes the URL and inspects HTML for platform clues
 */

// ---------------------------------------------------------------------------
// URL-only detection (synchronous, no network)
// ---------------------------------------------------------------------------

/**
 * Detect a platform using only the URL string (no network calls).
 * Fast and safe to call for any URL.
 */
export function detectPlatformFromUrl(url: string): IPlatformDetectionResult {
  const signals: string[] = [];

  for (const descriptor of PLATFORM_DESCRIPTORS) {
    for (const pattern of descriptor.urlPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(url)) {
        signals.push(`URL matches pattern: ${pattern}`);
        return {
          detected: true,
          provider: descriptor.provider,
          adapterId: descriptor.adapterId,
          confidence: 'high',
          signals,
          suggestedAuthMethod: descriptor.authMethod,
          apiBaseUrl: descriptor.apiBaseUrlTemplate
            ? descriptor.apiBaseUrlTemplate.replace('{baseUrl}', extractBaseUrl(url))
            : undefined,
        };
      }
    }
  }

  return {
    detected: false,
    provider: null,
    adapterId: null,
    confidence: 'low',
    signals: ['No URL patterns matched any known platform'],
    suggestedAuthMethod: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Full detection (async, with optional HTTP probing)
// ---------------------------------------------------------------------------

/** HTML signals that indicate a specific platform. */
const HTML_SIGNALS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly provider: string;
  readonly signal: string;
}> = [
  { pattern: /instructure/i, provider: 'canvas', signal: 'HTML contains "instructure"' },
  { pattern: /canvas/i, provider: 'canvas', signal: 'HTML contains "canvas"' },
  { pattern: /schoology/i, provider: 'schoology', signal: 'HTML contains "schoology"' },
  {
    pattern: /google\.com\/classroom/i,
    provider: 'google-classroom',
    signal: 'HTML references Google Classroom',
  },
  { pattern: /powerschool/i, provider: 'powerschool', signal: 'HTML contains "powerschool"' },
  {
    pattern: /infinitecampus/i,
    provider: 'infinite-campus',
    signal: 'HTML contains "infinitecampus"',
  },
  { pattern: /skyward/i, provider: 'skyward-qmlativ', signal: 'HTML contains "skyward"' },
  {
    pattern: /PXP2_Login|parentvue|studentvue/i,
    provider: 'synergy-parentvue',
    signal: 'HTML contains ParentVUE/StudentVUE markers',
  },
  {
    pattern: /blackbaud|myschoolapp/i,
    provider: 'blackbaud',
    signal: 'HTML contains "blackbaud" or "myschoolapp"',
  },
  { pattern: /aeries/i, provider: 'aeries', signal: 'HTML contains "aeries"' },
  {
    pattern: /renweb|factsmgt/i,
    provider: 'facts',
    signal: 'HTML contains "renweb" or "factsmgt"',
  },
  { pattern: /getalma/i, provider: 'alma', signal: 'HTML contains "getalma"' },
  {
    pattern: /ascender|txeis/i,
    provider: 'txeis-ascender',
    signal: 'HTML contains "ascender" or "txeis"',
  },
];

/**
 * Detect a platform by first checking the URL, then optionally
 * fetching the page and inspecting HTML for platform-specific signals.
 *
 * @param url - The school portal URL to probe
 * @param options.probe - Whether to fetch the page HTML (default: true)
 * @param options.timeoutMs - Timeout for the HTTP fetch (default: 10000)
 */
export async function detectPlatform(
  url: string,
  options?: { readonly probe?: boolean; readonly timeoutMs?: number }
): Promise<IPlatformDetectionResult> {
  // Step 1: Try URL-only detection
  const urlResult = detectPlatformFromUrl(url);
  if (urlResult.detected) {
    return urlResult;
  }

  // Step 2: If probing is disabled, return the URL-only result
  if (options?.probe === false) {
    return urlResult;
  }

  // Step 3: Fetch the page and inspect HTML
  const signals: string[] = [...urlResult.signals];
  const timeoutMs = options?.timeoutMs ?? 10_000;

  let html: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'user-agent': 'Scholaracle-PlatformDetector/1.0',
        accept: 'text/html',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      signals.push(`HTTP ${response.status} from ${url}`);
      return {
        detected: false,
        provider: null,
        adapterId: null,
        confidence: 'low',
        signals,
        suggestedAuthMethod: 'unknown',
      };
    }

    html = await response.text();
    signals.push('Successfully fetched landing page HTML');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    signals.push(`Failed to fetch URL: ${message}`);
    return {
      detected: false,
      provider: null,
      adapterId: null,
      confidence: 'low',
      signals,
      suggestedAuthMethod: 'unknown',
    };
  }

  // Step 4: Check HTML against known signals
  for (const htmlSignal of HTML_SIGNALS) {
    if (htmlSignal.pattern.test(html)) {
      signals.push(htmlSignal.signal);

      const descriptor = PLATFORM_DESCRIPTORS.find((p) => p.provider === htmlSignal.provider);
      if (descriptor) {
        return {
          detected: true,
          provider: descriptor.provider,
          adapterId: descriptor.adapterId,
          confidence: 'medium',
          signals,
          suggestedAuthMethod: descriptor.authMethod,
          apiBaseUrl: descriptor.apiBaseUrlTemplate
            ? descriptor.apiBaseUrlTemplate.replace('{baseUrl}', extractBaseUrl(url))
            : undefined,
        };
      }
    }
  }

  signals.push('No platform-specific signals found in HTML');
  return {
    detected: false,
    provider: null,
    adapterId: null,
    confidence: 'low',
    signals,
    suggestedAuthMethod: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the origin (protocol + host) from a URL. */
function extractBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}
