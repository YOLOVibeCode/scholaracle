/**
 * Builtin IScraperModule wrappers around existing recipes + transformers.
 */

import type { ICanvasBrowserExtract } from '../extractors/canvas/canvas-extractors';
import type { ISkywardFullExtract } from '../extractors/skyward/skyward-extractors';
import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import { runCanvasRecipe } from '../recipes/canvas-recipe';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { transformCanvasExtract } from '../transformers/canvas/canvas-transformer';
import { transformSkywardExtract } from '../transformers/skyward/skyward-transformer';
import { transformAeriesExtract } from '../transformers/aeries/aeries-transformer';
import type { ITransformContext } from '../types';
import { parseScraperManifest, type IScraperManifest } from './manifest';
import { runPortalStep } from '../pipeline/runPortalStep';
import type { IScraperHost, IScraperModule } from './module';

export { BUILTIN_ALIAS_TO_ADAPTER, BUILTIN_ADAPTER_ID_ALIASES } from './adapter-aliases';

const CORE_VERSION = '0.1.0';

function canvasManifest(): IScraperManifest {
  return parseScraperManifest({
    id: 'canvas',
    name: 'Canvas LMS',
    adapterId: 'canvas',
    version: CORE_VERSION,
    hosts: ['*.instructure.com'],
    entities: [
      'course',
      'assignment',
      'gradeSnapshot',
      'teacher',
      'courseMaterial',
      'message',
      'studentProfile',
    ],
    entry: 'builtin:canvas',
    publisher: 'scholaracle',
  });
}

function skywardManifest(): IScraperManifest {
  return parseScraperManifest({
    id: 'skyward',
    name: 'Skyward Qmlativ',
    adapterId: 'skyward',
    version: CORE_VERSION,
    hosts: ['*.skyward.com', '*.iscorp.com'],
    entities: [
      'course',
      'assignment',
      'gradeSnapshot',
      'attendanceEvent',
      'academicTerm',
      'studentProfile',
      'teacher',
    ],
    entry: 'builtin:skyward',
    publisher: 'scholaracle',
  });
}

function aeriesManifest(): IScraperManifest {
  return parseScraperManifest({
    id: 'aeries',
    name: 'Aeries SIS',
    adapterId: 'aeries',
    version: CORE_VERSION,
    hosts: ['*.aeries.net'],
    entities: [
      'course',
      'assignment',
      'gradeSnapshot',
      'attendanceEvent',
      'studentProfile',
      'teacher',
    ],
    entry: 'builtin:aeries',
    publisher: 'scholaracle',
  });
}

export const canvasBuiltinModule: IScraperModule = {
  metadata: canvasManifest(),
  async scrape(host: IScraperHost): Promise<Record<string, unknown>> {
    host.progress({
      phase: 'scraping',
      message: 'Running Canvas recipe',
      timestamp: new Date().toISOString(),
    });
    const extract = await runPortalStep(host, 'canvas.extract', async () =>
      runCanvasRecipe(host.driver, host.config.baseUrl)
    );
    return extract as unknown as Record<string, unknown>;
  },
  transform(raw: Record<string, unknown>, ctx: ITransformContext) {
    return transformCanvasExtract(raw as unknown as ICanvasBrowserExtract, ctx);
  },
};

export const skywardBuiltinModule: IScraperModule = {
  metadata: skywardManifest(),
  async scrape(host: IScraperHost): Promise<Record<string, unknown>> {
    host.progress({
      phase: 'scraping',
      message: 'Running Skyward recipe',
      timestamp: new Date().toISOString(),
    });
    const extract = await runPortalStep(host, 'skyward.extract', async () =>
      runSkywardRecipe(host.driver, host.config.baseUrl)
    );
    return extract as unknown as Record<string, unknown>;
  },
  transform(raw: Record<string, unknown>, ctx: ITransformContext) {
    return transformSkywardExtract(raw as unknown as ISkywardFullExtract, ctx);
  },
};

export const aeriesBuiltinModule: IScraperModule = {
  metadata: aeriesManifest(),
  async scrape(host: IScraperHost): Promise<Record<string, unknown>> {
    host.progress({
      phase: 'scraping',
      message: 'Running Aeries recipe',
      timestamp: new Date().toISOString(),
    });
    const extract = await runPortalStep(host, 'aeries.extract', async () =>
      runAeriesRecipe(host.driver, host.config.baseUrl, {
        ...(host.selectorPatch ? { selectors: host.selectorPatch } : {}),
      })
    );
    return extract as unknown as Record<string, unknown>;
  },
  transform(raw: Record<string, unknown>, ctx: ITransformContext) {
    return transformAeriesExtract(raw as unknown as IAeriesFullExtract, ctx);
  },
};

export const BUILTIN_MODULES_BY_ADAPTER: Readonly<Record<string, IScraperModule>> = {
  canvas: canvasBuiltinModule,
  skyward: skywardBuiltinModule,
  aeries: aeriesBuiltinModule,
};

/** Returns all builtin scraper modules as an array. */
export function getBuiltinModules(): readonly IScraperModule[] {
  return Object.values(BUILTIN_MODULES_BY_ADAPTER);
}
