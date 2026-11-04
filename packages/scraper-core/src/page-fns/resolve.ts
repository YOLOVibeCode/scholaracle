import { PAGE_FNS } from './registry';
import { PAGE_FN_SOURCES } from './pageFns.generated';

/** Error code for a page function that is not in the build-time table. */
export const PAGE_FN_UNREGISTERED = 'PAGE_FN_UNREGISTERED';

export class PageFnUnregisteredError extends Error {
  public readonly code = PAGE_FN_UNREGISTERED;

  constructor(fnName: string) {
    super(
      `${PAGE_FN_UNREGISTERED}: page function "${fnName || 'anonymous'}" is not in the build-time ` +
        'table. Add it to scraper-core src/page-fns/registry.ts and run the page-fns generator.'
    );
    this.name = 'PageFnUnregisteredError';
  }
}

let idsByFn: Map<unknown, string> | null = null;

/**
 * Look up the build-time source of a page function by identity. Never calls
 * Function.prototype.toString, so it works on Hermes bytecode builds.
 */
export function resolvePageFn(fn: unknown): { readonly id: string; readonly source: string } {
  if (idsByFn === null) {
    idsByFn = new Map(Object.entries(PAGE_FNS).map(([id, f]) => [f, id] as const));
  }
  const id = idsByFn.get(fn);
  const source = id === undefined ? undefined : PAGE_FN_SOURCES[id];
  if (id === undefined || source === undefined) {
    const name = typeof fn === 'function' ? ((fn as { name?: string }).name ?? '') : '';
    throw new PageFnUnregisteredError(name);
  }
  return { id, source };
}
