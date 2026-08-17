import type {
  AvgResourcePackSelection,
  InstalledAvgResourcePackRecord
} from '../types';
import type {
  AvgResourceBinaryStore,
  AvgResourcePackMetadataRepository
} from './types';
import { isSafePackRelativePath } from '../schemas';

export const AVG_RESOURCE_DB_NAME = 'sorry-im-a-cop-v2-avg-resources';
export const AVG_RESOURCE_DB_VERSION = 1;

const PACK_STORE = 'installed-packs';
const SELECTION_STORE = 'selections';
const BLOB_STORE = 'resource-files';
const NAMESPACE_INDEX = 'by-namespace';

interface StoredPack {
  packId: string;
  worldpackId: string;
  record: InstalledAvgResourcePackRecord;
}
interface StoredResourceBlob {
  key: string;
  namespace: string;
  path: string;
  blob: Blob;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败。'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB 事务失败。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB 事务已中止。'));
  });
}

export function openAvgResourceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AVG_RESOURCE_DB_NAME, AVG_RESOURCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const packs = db.objectStoreNames.contains(PACK_STORE)
        ? request.transaction!.objectStore(PACK_STORE)
        : db.createObjectStore(PACK_STORE, { keyPath: 'packId' });
      if (!packs.indexNames.contains('by-worldpack')) {
        packs.createIndex('by-worldpack', 'worldpackId');
      }
      if (!db.objectStoreNames.contains(SELECTION_STORE)) {
        db.createObjectStore(SELECTION_STORE, { keyPath: 'worldpackId' });
      }
      const blobs = db.objectStoreNames.contains(BLOB_STORE)
        ? request.transaction!.objectStore(BLOB_STORE)
        : db.createObjectStore(BLOB_STORE, { keyPath: 'key' });
      if (!blobs.indexNames.contains(NAMESPACE_INDEX)) {
        blobs.createIndex(NAMESPACE_INDEX, 'namespace');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开 AVG 资源数据库。'));
  });
}

function storedPack(value: InstalledAvgResourcePackRecord): StoredPack {
  return {
    packId: value.manifest.packId,
    worldpackId: value.manifest.worldpackId,
    record: value
  };
}

function assertNamespace(namespace: string): void {
  if (!/^[a-zA-Z0-9._-]{1,180}$/u.test(namespace)) {
    throw new Error('AVG 资源存储命名空间不安全。');
  }
}

function blobKey(namespace: string, path: string): string {
  assertNamespace(namespace);
  if (!isSafePackRelativePath(path)) throw new Error(`不安全的资源路径：${path}`);
  return `${namespace}:${path}`;
}

export class IndexedDbAvgResourcePackMetadataRepository
  implements AvgResourcePackMetadataRepository
{
  async getInstalledPack(packId: string): Promise<InstalledAvgResourcePackRecord | undefined> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(PACK_STORE, 'readonly');
      const value = await requestToPromise<StoredPack | undefined>(
        transaction.objectStore(PACK_STORE).get(packId)
      );
      await transactionDone(transaction);
      return value?.record;
    } finally {
      db.close();
    }
  }

  async listInstalledPacks(worldpackId?: string): Promise<InstalledAvgResourcePackRecord[]> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(PACK_STORE, 'readonly');
      const store = transaction.objectStore(PACK_STORE);
      const rows = worldpackId
        ? await requestToPromise<StoredPack[]>(store.index('by-worldpack').getAll(worldpackId))
        : await requestToPromise<StoredPack[]>(store.getAll());
      await transactionDone(transaction);
      return rows.map((row) => row.record);
    } finally {
      db.close();
    }
  }

  async putInstalledPack(record: InstalledAvgResourcePackRecord): Promise<void> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(PACK_STORE, 'readwrite');
      transaction.objectStore(PACK_STORE).put(storedPack(record));
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async removeInstalledPack(packId: string): Promise<void> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(PACK_STORE, 'readwrite');
      transaction.objectStore(PACK_STORE).delete(packId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async getSelection(worldpackId: string): Promise<AvgResourcePackSelection | undefined> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(SELECTION_STORE, 'readonly');
      const value = await requestToPromise<AvgResourcePackSelection | undefined>(
        transaction.objectStore(SELECTION_STORE).get(worldpackId)
      );
      await transactionDone(transaction);
      return value;
    } finally {
      db.close();
    }
  }

  async putSelection(selection: AvgResourcePackSelection): Promise<void> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(SELECTION_STORE, 'readwrite');
      transaction.objectStore(SELECTION_STORE).put(selection);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}
export class IndexedDbAvgResourceBinaryStore implements AvgResourceBinaryStore {
  readonly backend = 'indexeddb' as const;

  async write(namespace: string, path: string, blob: Blob): Promise<void> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(BLOB_STORE, 'readwrite');
      transaction.objectStore(BLOB_STORE).put({
        key: blobKey(namespace, path),
        namespace,
        path,
        blob
      } satisfies StoredResourceBlob);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async read(namespace: string, path: string): Promise<Blob | undefined> {
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(BLOB_STORE, 'readonly');
      const value = await requestToPromise<StoredResourceBlob | undefined>(
        transaction.objectStore(BLOB_STORE).get(blobKey(namespace, path))
      );
      await transactionDone(transaction);
      return value?.blob;
    } finally {
      db.close();
    }
  }

  async removeNamespace(namespace: string): Promise<void> {
    assertNamespace(namespace);
    const db = await openAvgResourceDatabase();
    try {
      const transaction = db.transaction(BLOB_STORE, 'readwrite');
      const index = transaction.objectStore(BLOB_STORE).index(NAMESPACE_INDEX);
      await new Promise<void>((resolve, reject) => {
        const request = index.openKeyCursor(IDBKeyRange.only(namespace));
        request.onerror = () => reject(request.error ?? new Error('AVG 资源清理失败。'));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) {
            resolve();
            return;
          }
          transaction.objectStore(BLOB_STORE).delete(cursor.primaryKey);
          cursor.continue();
        };
      });
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}
