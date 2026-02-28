/**
 * Probes a URL with HEAD to determine link accessibility (public, authenticated, or unknown).
 * Used during sync to set courseMaterial.linkAccessibility for type 'link'.
 */
export type LinkAccessibility = 'public' | 'authenticated' | 'unknown';

const PROBE_TIMEOUT_MS = 5000;

export async function probeLinkAccessibility(url: string): Promise<LinkAccessibility> {
  if (!url || !url.startsWith('http')) return 'unknown';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.status === 200) return 'public';
    if (res.status === 401 || res.status === 403) return 'authenticated';
    const location = res.headers.get('location') ?? '';
    if (/login|signin|auth|sso/i.test(location) || /login|signin|auth|sso/i.test(res.url)) {
      return 'authenticated';
    }
    return 'unknown';
  } catch {
    clearTimeout(timeoutId);
    return 'unknown';
  }
}

/** Run up to `concurrency` probes in parallel. */
export async function probeLinkAccessibilityBatch(
  urls: readonly string[],
  concurrency: number = 5
): Promise<Map<string, LinkAccessibility>> {
  const result = new Map<string, LinkAccessibility>();
  const queue = [...urls];
  const running: Promise<void>[] = [];

  const runOne = async (): Promise<void> => {
    const url = queue.shift();
    if (!url) return;
    const acc = await probeLinkAccessibility(url);
    result.set(url, acc);
    if (queue.length > 0) {
      running.push(runOne());
    }
  };

  for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
    running.push(runOne());
  }
  await Promise.all(running);
  return result;
}
