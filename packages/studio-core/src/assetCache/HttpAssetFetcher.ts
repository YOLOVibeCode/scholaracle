import type { IAssetFetchInit, IAssetFetcher, IAssetFetchResult } from '@scholaracle/interfaces';

export interface IHttpFetchResponse {
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  readonly headers: { get(name: string): string | null };
}

export type HttpFetchFn = (
  url: string,
  init: { headers: Record<string, string> }
) => Promise<IHttpFetchResponse>;

function defaultFetch(
  url: string,
  init: { headers: Record<string, string> }
): Promise<IHttpFetchResponse> {
  return fetch(url, init);
}

/**
 * IAssetFetcher over HTTP. Sends If-None-Match when the cache already has
 * this hash. downloadUrl is a fetch ticket only.
 */
export function createHttpAssetFetcher(fetchFn: HttpFetchFn = defaultFetch): IAssetFetcher {
  return {
    async fetch(url: string, init: IAssetFetchInit): Promise<IAssetFetchResult> {
      const headers: Record<string, string> = {};
      if (init.ifNoneMatch != null && init.ifNoneMatch !== '') {
        headers['If-None-Match'] = init.ifNoneMatch;
      }
      const res = await fetchFn(url, { headers });
      if (res.status === 304) {
        return { status: 304, body: null };
      }
      const body = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get('content-type');
      return {
        status: res.status,
        body,
        ...(contentType != null && contentType !== '' ? { contentType } : {}),
      };
    },
  };
}
