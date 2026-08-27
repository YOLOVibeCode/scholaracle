/**
 * IndexedDB-backed IPackStore for the web studio.
 *
 * Stores class pack JSON keyed by courseExternalId.
 * Does NOT store signed downloadUrls — those are stripped before persist.
 */

import type { IPackStore, ISavedCoursePack } from '@scholaracle/studio-core';

const DB_NAME = 'scholarmancy-offline-packs';
const STORE_NAME = 'packs';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txGet(db: IDBDatabase, key: string): Promise<ISavedCoursePack | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as ISavedCoursePack | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function txSet(db: IDBDatabase, key: string, value: ISavedCoursePack): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function txKeys(db: IDBDatabase): Promise<readonly string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbPackStore implements IPackStore {
  async get(courseExternalId: string): Promise<ISavedCoursePack | null> {
    const db = await openDb();
    try {
      return await txGet(db, courseExternalId);
    } finally {
      db.close();
    }
  }

  async set(courseExternalId: string, pack: ISavedCoursePack): Promise<void> {
    const db = await openDb();
    try {
      await txSet(db, courseExternalId, pack);
    } finally {
      db.close();
    }
  }

  async delete(courseExternalId: string): Promise<void> {
    const db = await openDb();
    try {
      await txDelete(db, courseExternalId);
    } finally {
      db.close();
    }
  }

  async keys(): Promise<readonly string[]> {
    const db = await openDb();
    try {
      return await txKeys(db);
    } finally {
      db.close();
    }
  }
}
