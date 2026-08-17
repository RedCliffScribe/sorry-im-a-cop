import { z } from 'zod';

export const imageAutomationTriggerKinds = ['character-created', 'story-turn-completed'] as const;
export type ImageAutomationTriggerKind = (typeof imageAutomationTriggerKinds)[number];

export const imageAutomationTriggerStatuses = [
  'detected',
  'planning',
  'blocked',
  'skipped',
  'queued',
  'running',
  'partially-succeeded',
  'succeeded',
  'failed',
  'cancelled'
] as const;
export type ImageAutomationTriggerStatus = (typeof imageAutomationTriggerStatuses)[number];

export const imageAutomationTriggerRecordSchema = z.object({
  triggerId: z.string().trim().min(1).max(2000),
  saveId: z.string().trim().min(1).max(1000),
  kind: z.enum(imageAutomationTriggerKinds),
  subjectId: z.string().trim().min(1).max(1000),
  sourceStoryTextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(imageAutomationTriggerStatuses),
  profileId: z.string().trim().min(1).max(1000).optional(),
  executionFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(8),
  taskIds: z.array(z.string().trim().min(1).max(1000)).max(32),
  retryCount: z.number().int().nonnegative().max(10),
  maxRetries: z.number().int().nonnegative().max(10),
  blockerCode: z.string().trim().min(1).max(200).optional(),
  safeMessage: z.string().max(2000),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).strict();

export type ImageAutomationTriggerRecord = z.infer<typeof imageAutomationTriggerRecordSchema>;

export interface ImageAutomationRuntimeRepository {
  claim(record: ImageAutomationTriggerRecord): Promise<{ created: boolean; record: ImageAutomationTriggerRecord }>;
  get(triggerId: string): Promise<ImageAutomationTriggerRecord | null>;
  listForSave(saveId: string): Promise<ImageAutomationTriggerRecord[]>;
  put(record: ImageAutomationTriggerRecord): Promise<void>;
  remove(triggerId: string): Promise<void>;
  clearSave(saveId: string): Promise<void>;
}

export function createImageAutomationTriggerId(
  saveId: string,
  kind: ImageAutomationTriggerKind,
  subjectId: string,
  sourceStoryTextHash?: string
): string {
  const parts = ['image-automation', saveId, kind, subjectId];
  if (kind === 'story-turn-completed' && sourceStoryTextHash) parts.push(sourceStoryTextHash);
  return parts.map(encodeURIComponent).join(':');
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

export class IndexedDbImageAutomationRuntimeRepository implements ImageAutomationRuntimeRepository {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dbName = 'sorry-im-a-cop-v2-image-automation-runtime') {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains('triggers')) {
          const store = database.createObjectStore('triggers', { keyPath: 'triggerId' });
          store.createIndex('by-save-id', 'saveId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('无法打开文生图自动触发记录。'));
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  claim(record: ImageAutomationTriggerRecord): Promise<{ created: boolean; record: ImageAutomationTriggerRecord }> {
    const parsed = imageAutomationTriggerRecordSchema.parse(record);
    return this.enqueue(async () => {
      const database = await this.open();
      try {
        const transaction = database.transaction('triggers', 'readwrite');
        const done = transactionDone(transaction);
        const store = transaction.objectStore('triggers');
        const existing = await requestToPromise<unknown>(store.get(parsed.triggerId));
        if (existing !== undefined) {
          await done;
          return { created: false, record: imageAutomationTriggerRecordSchema.parse(existing) };
        }
        store.add(parsed);
        await done;
        return { created: true, record: parsed };
      } finally {
        database.close();
      }
    });
  }

  async get(triggerId: string): Promise<ImageAutomationTriggerRecord | null> {
    const database = await this.open();
    try {
      const value = await requestToPromise<unknown>(
        database.transaction('triggers', 'readonly').objectStore('triggers').get(triggerId)
      );
      return value === undefined ? null : imageAutomationTriggerRecordSchema.parse(value);
    } finally {
      database.close();
    }
  }

  async listForSave(saveId: string): Promise<ImageAutomationTriggerRecord[]> {
    const database = await this.open();
    try {
      const store = database.transaction('triggers', 'readonly').objectStore('triggers');
      const records = await requestToPromise<unknown[]>(store.index('by-save-id').getAll(IDBKeyRange.only(saveId)));
      return records
        .map((record) => imageAutomationTriggerRecordSchema.parse(record))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } finally {
      database.close();
    }
  }

  put(record: ImageAutomationTriggerRecord): Promise<void> {
    const parsed = imageAutomationTriggerRecordSchema.parse(record);
    return this.enqueue(async () => {
      const database = await this.open();
      try {
        const transaction = database.transaction('triggers', 'readwrite');
        transaction.objectStore('triggers').put(parsed);
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    });
  }

  remove(triggerId: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.open();
      try {
        const transaction = database.transaction('triggers', 'readwrite');
        transaction.objectStore('triggers').delete(triggerId);
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    });
  }

  clearSave(saveId: string): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.open();
      try {
        const transaction = database.transaction('triggers', 'readwrite');
        const store = transaction.objectStore('triggers');
        const request = store.index('by-save-id').openKeyCursor(IDBKeyRange.only(saveId));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    });
  }

  clearAll(): Promise<void> {
    return this.enqueue(async () => {
      const database = await this.open();
      try {
        const transaction = database.transaction('triggers', 'readwrite');
        transaction.objectStore('triggers').clear();
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    });
  }
}
