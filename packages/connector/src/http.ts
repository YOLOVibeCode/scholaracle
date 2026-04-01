/**
 * Build a URL from a base path and optional query params.
 * Strips trailing slash from base to avoid double-slashes.
 */
export function buildUrl(base: string, path: string, params?: Record<string, string>): string {
  const url = `${base.replace(/\/$/, '')}${path}`;
  if (!params || Object.keys(params).length === 0) return url;
  const search = new URLSearchParams(params).toString();
  return `${url}?${search}`;
}

export interface IGetJsonResult<TResponse> {
  readonly data: TResponse;
  readonly headers: Headers;
}

export async function getJson<TResponse>(
  url: string,
  token?: string
): Promise<IGetJsonResult<TResponse>> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  const data = (await res.json()) as TResponse;
  return { data, headers: res.headers };
}

export async function postJson<TResponse>(
  url: string,
  body: unknown,
  token?: string
): Promise<TResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    // ignore
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText}: ${typeof json === 'object' ? JSON.stringify(json) : text}`
    );
  }
  return json as TResponse;
}
