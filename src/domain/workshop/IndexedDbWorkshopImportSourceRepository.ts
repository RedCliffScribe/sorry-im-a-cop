import { z } from 'zod';
import type {
  WorkshopImportSourceRecord,
  WorkshopImportSourceRepository
} from './types';

const sourceRecordSchema: z.ZodType<WorkshopImportSourceRecord> = z.object({
  sourceRecordId: z.string().trim().min(1).max(1000),
  originKey: z.string().trim().min(1).max(1000),
  localPresetId: z.string().trim().min(1).max(1000),
  localProfileId: z.string().trim().min(1).max(1000),
  variantKey: z.enum([
    'avatar-close-up',
    'half-body-medium',
    'knee-up-medium-full',
    'full-body',
    'narrative-scene'
  ]),
  variantRef: z.string().trim().min(1).max(1000),
  packageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  itemId: z.string().trim().min(1).max(1000).optional(),
  revisionId: z.string().trim().min(1).max(1000).optional(),
  authorDisplayName: z.string().trim().min(1).max(200).optional(),
  importedStylePresetIds: z.array(z.string().trim().min(1).max(1000)).max(32),
  importedDialectPresetIds: z.array(z.string().trim().min(1).max(1000)).max(16),
  importedComfyRecipeIds: z.array(z.string().trim().min(1).max(1000)).max(16),
  importedAt: z.string().datetime({ offset: true })
}).strict();

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

export class IndexedDbWorkshopImportSourceRepository implements WorkshopImportSourceRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-workshop-import-sources') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('sources')) {
          const store = request.result.createObjectStore('sources', { keyPath: 'localPresetId' });
          store.createIndex('originKey', 'originKey', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开创意工坊导入来源数据库。'));
    });
  }

  async get(localPresetId: string): Promise<WorkshopImportSourceRecord | undefined> {
    const db = await this.open();
    try {
      const transaction = db.transaction('sources', 'readonly');
      const value = await requestToPromise<unknown>(transaction.objectStore('sources').get(localPresetId));
      return value === undefined ? undefined : sourceRecordSchema.parse(value);
    } finally {
      db.close();
    }
  }

  async listByOriginKey(originKey: string): Promise<WorkshopImportSourceRecord[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction('sources', 'readonly');
      const values = await requestToPromise<unknown[]>(
        transaction.objectStore('sources').index('originKey').getAll(originKey)
      );
      return values.map((value) => sourceRecordSchema.parse(value))
        .sort((left, right) => left.variantRef.localeCompare(right.variantRef));
    } finally {
      db.close();
    }
  }

  save(record: WorkshopImportSourceRecord): Promise<void> {
    const parsed = sourceRecordSchema.parse(record);
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('sources', 'readwrite');
        transaction.objectStore('sources').put(parsed);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  delete(localPresetId: string): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('sources', 'readwrite');
        transaction.objectStore('sources').delete(localPresetId);
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  clearAll(): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const db = await this.open();
      try {
        const transaction = db.transaction('sources', 'readwrite');
        transaction.objectStore('sources').clear();
        await transactionDone(transaction);
      } finally {
        db.close();
      }
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }
}
