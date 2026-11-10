import type { Express } from 'express';

interface IExpressLayer {
  readonly route?: {
    readonly path: string;
    readonly methods: Record<string, boolean>;
  };
  readonly name?: string;
  readonly path?: string;
  readonly handle?: { readonly stack?: IExpressLayer[] };
  readonly regexp?: RegExp & { fast_slash?: boolean };
}

export interface IDiscoveredRoute {
  readonly method: string;
  readonly path: string;
}

const PARENT_PREFIXES = [
  '/api/alerts-api',
  '/api/email-history',
  '/api/sessions',
  '/api/assets',
  '/api/integrations',
  '/api/sharing',
  '/api/portal-accounts',
  '/api/students',
] as const;

/** Self-scoped routes (no cross-household id); omitted from IDOR sweep drift checks. */
export const IDOR_SWEEP_CLASSIFIED_SKIP = new Set<string>(['DELETE /api/settings/oauth/:provider']);

function joinMountPaths(base: string, segment: string): string {
  if (segment === '' || segment === '/') {
    return base || '/';
  }
  const left = base.endsWith('/') ? base.slice(0, -1) : base;
  const right = segment.startsWith('/') ? segment : `/${segment}`;
  return `${left}${right}`;
}

/** Express mount path from layer.path or layer.regexp (pattern from express-list-endpoints). */
function mountPathFromLayer(layer: IExpressLayer): string {
  if (typeof layer.path === 'string' && layer.path.length > 0) {
    return layer.path;
  }
  const regexp = layer.regexp;
  if (regexp === undefined) {
    return '';
  }
  if ('fast_slash' in regexp && regexp.fast_slash) {
    return '';
  }
  return regexp
    .toString()
    .replace('\\/?', '')
    .replace('(?=\\/|$)', '')
    .replace(/^\^\\\//, '')
    .replace(/\\\//g, '/')
    .replace(/\\\./g, '.')
    .replace(/\$.*/, '');
}

function walkLayers(layers: IExpressLayer[], prefix: string, out: IDiscoveredRoute[]): void {
  for (const layer of layers) {
    if (layer.route !== undefined) {
      const fullPath = joinMountPaths(prefix, layer.route.path);
      if (!fullPath.includes(':')) {
        continue;
      }
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (!enabled || method === '_all') {
          continue;
        }
        out.push({ method: method.toUpperCase(), path: fullPath });
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle?.stack !== undefined) {
      const mount = mountPathFromLayer(layer);
      walkLayers(layer.handle.stack, joinMountPaths(prefix, mount), out);
    }
  }
}

/** Best-effort list of mounted Express routes under parent JWT prefixes that contain `:params`. */
export function listParentParamRoutes(app: Express): IDiscoveredRoute[] {
  const stack = (app as unknown as { _router?: { stack?: IExpressLayer[] } })._router?.stack;
  if (stack === undefined) {
    return [];
  }
  const raw: IDiscoveredRoute[] = [];
  walkLayers(stack, '', raw);
  const byKey = new Map<string, IDiscoveredRoute>();
  for (const row of raw) {
    const isParentMount = PARENT_PREFIXES.some(
      (p) => row.path === p || row.path.startsWith(`${p}/`)
    );
    if (!isParentMount) {
      continue;
    }
    const key = `${row.method} ${row.path}`;
    if (!IDOR_SWEEP_CLASSIFIED_SKIP.has(key)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
  );
}
