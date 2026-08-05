/**
 * Scraper resolvers: builtin, sideload, and composite.
 */

import { BUILTIN_ALIAS_TO_ADAPTER, BUILTIN_MODULES_BY_ADAPTER } from './builtin-modules';
import { checkScraperModule } from './check-module';
import type { IScraperModule, IScraperResolveResult, IScraperResolver } from './module';

function assertVersionMatch(module: IScraperModule, version?: string): void {
  if (version !== undefined && module.metadata.version !== version) {
    throw new Error(
      `Scraper version mismatch for "${module.metadata.adapterId}": requested "${version}", found "${module.metadata.version}"`
    );
  }
}

/** Official Canvas / Skyward / Aeries modules shipped in scraper-core. */
export class BuiltinScraperResolver implements IScraperResolver {
  async resolve(adapterId: string, version?: string): Promise<IScraperResolveResult> {
    const canonical = BUILTIN_ALIAS_TO_ADAPTER[adapterId];
    if (!canonical) {
      throw new Error(`Unknown builtin scraper adapter: "${adapterId}"`);
    }
    const module = BUILTIN_MODULES_BY_ADAPTER[canonical];
    if (!module) {
      throw new Error(`Builtin scraper not found for adapter: "${adapterId}"`);
    }
    assertVersionMatch(module, version);
    return { module, canRun: true, checkErrors: [] };
  }
}

/** Locally registered (sideloaded) scraper modules. */
export class SideloadScraperResolver implements IScraperResolver {
  private readonly modules = new Map<string, IScraperModule[]>();

  register(module: IScraperModule): void {
    const key = module.metadata.adapterId;
    const existing = this.modules.get(key) ?? [];
    const filtered = existing.filter((m) => m.metadata.version !== module.metadata.version);
    filtered.push(module);
    this.modules.set(key, filtered);
  }

  list(): readonly IScraperModule[] {
    const all: IScraperModule[] = [];
    for (const versions of this.modules.values()) {
      all.push(...versions);
    }
    return all;
  }

  async resolve(adapterId: string, version?: string): Promise<IScraperResolveResult> {
    const versions = this.modules.get(adapterId);
    if (!versions || versions.length === 0) {
      throw new Error(`Sideload scraper not found: "${adapterId}"`);
    }

    let module: IScraperModule | undefined;
    if (version !== undefined) {
      module = versions.find((m) => m.metadata.version === version);
      if (!module) {
        throw new Error(`Sideload scraper version not found for "${adapterId}": "${version}"`);
      }
    } else {
      module = versions[versions.length - 1];
    }

    const checkErrors = await checkScraperModule(module!);
    return {
      module: module!,
      canRun: checkErrors.length === 0,
      checkErrors,
    };
  }
}

/** Tries sideload first, then builtin. */
export class CompositeScraperResolver implements IScraperResolver {
  constructor(
    private readonly sideload: SideloadScraperResolver,
    private readonly builtin: BuiltinScraperResolver = new BuiltinScraperResolver()
  ) {}

  async resolve(adapterId: string, version?: string): Promise<IScraperResolveResult> {
    try {
      return await this.sideload.resolve(adapterId, version);
    } catch {
      // fall through to builtin
    }
    try {
      return await this.builtin.resolve(adapterId, version);
    } catch {
      throw new Error(`Scraper not found: "${adapterId}"`);
    }
  }
}
