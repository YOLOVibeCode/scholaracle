/**
 * Minimal chrome.* mock for Manifest V3 extension unit tests.
 */

type StorageArea = Record<string, unknown>;

const localStore: StorageArea = {};

const chromeMock = {
  storage: {
    local: {
      get: jest.fn(async (keys?: string | string[] | null) => {
        if (keys == null) return { ...localStore };
        const keyList = typeof keys === 'string' ? [keys] : keys;
        const out: StorageArea = {};
        for (const k of keyList) {
          if (k in localStore) out[k] = localStore[k];
        }
        return out;
      }),
      set: jest.fn(async (items: StorageArea) => {
        Object.assign(localStore, items);
      }),
      clear: jest.fn(async () => {
        for (const k of Object.keys(localStore)) delete localStore[k];
      }),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(true),
    getAll: jest.fn().mockResolvedValue([]),
    onAlarm: { addListener: jest.fn() },
  },
  tabs: {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  notifications: {
    create: jest.fn().mockResolvedValue('notif-1'),
  },
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    sendMessage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

export function resetChromeMock(): void {
  for (const k of Object.keys(localStore)) delete localStore[k];
  jest.clearAllMocks();
}

export { chromeMock };
