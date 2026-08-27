import type { IAssetCacheFs } from '@scholaracle/studio-core';

/** Subset of expo-file-system/legacy used by the mobile cache adapter. */
export interface IExpoLegacyFs {
  readonly documentDirectory: string | null;
  makeDirectoryAsync(fileUri: string, options?: { intermediates?: boolean }): Promise<void>;
  readAsStringAsync(fileUri: string, options: { encoding: 'base64' }): Promise<string>;
  writeAsStringAsync(
    fileUri: string,
    contents: string,
    options: { encoding: 'base64' }
  ): Promise<void>;
  deleteAsync(fileUri: string, options?: { idempotent?: boolean }): Promise<void>;
  readDirectoryAsync(fileUri: string): Promise<string[]>;
}

const DIR_NAME = 'scholaracle-asset-cache';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return globalThis.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** App-file-dir IAssetCacheFs. Bytes live under documentDirectory, never keyed by signed URL. */
export function createExpoAssetCacheFs(fs: IExpoLegacyFs): IAssetCacheFs {
  const root = `${(fs.documentDirectory ?? 'file:///').replace(/\/$/, '')}/${DIR_NAME}`;
  let ready: Promise<void> | undefined;
  const ensure = (): Promise<void> => {
    ready ??= fs.makeDirectoryAsync(root, { intermediates: true });
    return ready;
  };

  return {
    async read(fileName: string): Promise<Uint8Array | undefined> {
      await ensure();
      try {
        const b64 = await fs.readAsStringAsync(`${root}/${fileName}`, { encoding: 'base64' });
        return base64ToBytes(b64);
      } catch {
        return undefined;
      }
    },
    async write(fileName: string, bytes: Uint8Array): Promise<void> {
      await ensure();
      await fs.writeAsStringAsync(`${root}/${fileName}`, bytesToBase64(bytes), {
        encoding: 'base64',
      });
    },
    async remove(fileName: string): Promise<void> {
      await ensure();
      await fs.deleteAsync(`${root}/${fileName}`, { idempotent: true });
    },
    async list(): Promise<readonly string[]> {
      await ensure();
      try {
        return await fs.readDirectoryAsync(root);
      } catch {
        return [];
      }
    },
  };
}
