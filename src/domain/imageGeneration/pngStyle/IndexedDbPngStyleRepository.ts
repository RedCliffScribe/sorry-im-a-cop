import { pngStyleLibrarySettingsSchema } from './schemas';
import type { PngStyleLibrarySettings, PngStyleRepository } from './types';

export function createDefaultPngStyleLibrarySettings(now = new Date().toISOString()): PngStyleLibrarySettings {
  return {
    settingsId: 'global-png-style-library',
    revision: 1,
    presets: [],
    selection: {},
    updatedAt: now
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbPngStyleRepository implements PngStyleRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-png-style-library') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('settings')) {
          request.result.createObjectStore('settings', { keyPath: 'settingsId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开 PNG 画风数据库。'));
    });
  }

  async load(): Promise<PngStyleLibrarySettings> {
    const db = await this.open();
    try {
      const transaction = db.transaction('settings', 'readonly');
      const value = await requestToPromise<unknown>(
        transaction.objectStore('settings').get('global-png-style-library')
      );
      return value === undefined
        ? createDefaultPngStyleLibrarySettings()
        : pngStyleLibrarySettingsSchema.parse(value);
    } finally {
      db.close();
    }
  }

  save(settings: PngStyleLibrarySettings): Promise<void> {
    const parsed = pngStyleLibrarySettingsSchema.parse(settings);
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('settings', 'readwrite');
        transaction.objectStore('settings').put(parsed);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
