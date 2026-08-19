/**
 * ConnectedSourceStore — persists connected portal sources (no passwords).
 * Credentials stay in SecureStore under credentialKey.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORE_KEY = 'slc_connected_sources';

export interface IConnectedSource {
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly adapterId: string;
  readonly baseUrl: string;
  readonly sourceId: string;
  readonly credentialKey: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly studentId?: string;
  readonly adapterVersion: string;
}

export interface IConnectedSourceStore {
  list(): Promise<readonly IConnectedSource[]>;
  getForStudent(studentExternalId: string): Promise<IConnectedSource | null>;
  getForStudentRecord(student: {
    readonly id: string;
    readonly studentId?: string;
  }): Promise<IConnectedSource | null>;
  upsert(source: IConnectedSource): Promise<void>;
  remove(sourceId: string): Promise<void>;
}

export class ConnectedSourceStore implements IConnectedSourceStore {
  async list(): Promise<readonly IConnectedSource[]> {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as IConnectedSource[];
    } catch {
      return [];
    }
  }

  async getForStudent(studentExternalId: string): Promise<IConnectedSource | null> {
    const all = await this.list();
    // No fallback to another student's source: syncing the wrong portal is
    // worse than prompting the user to connect one.
    return all.find((s) => s.studentExternalId === studentExternalId) ?? null;
  }

  async getForStudentRecord(student: {
    readonly id: string;
    readonly studentId?: string;
  }): Promise<IConnectedSource | null> {
    const all = await this.list();
    return (
      all.find((s) => s.studentId === student.id) ??
      (student.studentId
        ? (all.find((s) => s.studentExternalId === student.studentId) ?? null)
        : null)
    );
  }

  async upsert(source: IConnectedSource): Promise<void> {
    const all = [...(await this.list())];
    const idx = all.findIndex((s) => s.sourceId === source.sourceId);
    const next =
      idx >= 0 ? [...all.slice(0, idx), source, ...all.slice(idx + 1)] : [...all, source];
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  async remove(sourceId: string): Promise<void> {
    const next = (await this.list()).filter((s) => s.sourceId !== sourceId);
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
  }
}

export const connectedSourceStore = new ConnectedSourceStore();

export const ADAPTER_IDS: Record<string, string> = {
  canvas: 'com.instructure.canvas',
  skyward: 'com.skyward.iscorp',
  aeries: 'com.aeries.portal',
};

export function sourceIdForStudent(
  provider: string,
  institutionExternalId: string,
  studentMongoId: string
): string {
  return `local-${provider}-${institutionExternalId}-${studentMongoId}`;
}

export function buildCredentialKey(provider: string, baseUrl: string): string {
  const domain = baseUrl.replace(/https?:\/\//, '').replace(/\/$/, '');
  return `slc_creds_${provider}_${domain}`;
}
