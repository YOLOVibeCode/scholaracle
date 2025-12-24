import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ISlcLocalSourceConfig {
  readonly sourceId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
}

export interface ISlcLocalConfig {
  readonly apiBaseUrl: string; // e.g. http://localhost:2801
  readonly connectorToken?: string;
  readonly sources: readonly ISlcLocalSourceConfig[];
}

export function getDefaultConfigPath(): string {
  return join(homedir(), '.scholaracle', 'slc.json');
}

export function loadConfig(path = getDefaultConfigPath()): ISlcLocalConfig {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ISlcLocalConfig;
    return {
      apiBaseUrl: parsed.apiBaseUrl ?? 'http://localhost:2801',
      connectorToken: parsed.connectorToken,
      sources: parsed.sources ?? [],
    };
  } catch {
    return { apiBaseUrl: 'http://localhost:2801', sources: [] };
  }
}

export function saveConfig(config: ISlcLocalConfig, path = getDefaultConfigPath()): void {
  const dir = join(homedir(), '.scholaracle');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf8');
}


