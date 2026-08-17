import type { RuntimeState } from '../runtime/types';
import type { RuntimeSaveRecord, RuntimeSaveSummary, SaveRepository } from './SaveRepository';

const DB_VERSION = 3;
const LEGACY_STORE_NAME = 'runtime-saves';
const SUMMARY_STORE_NAME = 'runtime-save-summaries';
const PAYLOAD_STORE_NAME = 'runtime-save-payloads';

interface RuntimeSavePayload {
  saveId: string;
  runtimeState: RuntimeState;
}

function splitSaveRecord(record: RuntimeSaveRecord): {
  summary: RuntimeSaveSummary;
  payload: RuntimeSavePayload;
} {
  const { runtimeState, ...summary } = record;
  return {
    summary,
    payload: { saveId: record.saveId, runtimeState }
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

export class IndexedDbSaveRepository implements SaveRepository {
  constructor(private readonly dbName = 'sorry-im-a-cop-v2-saves') {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) return;
        const summaryStore = db.objectStoreNames.contains(SUMMARY_STORE_NAME)
          ? transaction.objectStore(SUMMARY_STORE_NAME)
          : db.createObjectStore(SUMMARY_STORE_NAME, { keyPath: 'saveId' });
        const payloadStore = db.objectStoreNames.contains(PAYLOAD_STORE_NAME)
          ? transaction.objectStore(PAYLOAD_STORE_NAME)
          : db.createObjectStore(PAYLOAD_STORE_NAME, { keyPath: 'saveId' });

        const oldVersion = event.oldVersion ?? 0;
        if (oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          const legacyRequest = transaction.objectStore(LEGACY_STORE_NAME).getAll();
          legacyRequest.onsuccess = () => {
            for (const record of legacyRequest.result as RuntimeSaveRecord[]) {
              const { summary, payload } = splitSaveRecord(record);
              summaryStore.put(summary);
              payloadStore.put(payload);
            }
            db.deleteObjectStore(LEGACY_STORE_NAME);
          };
        } else if (db.objectStoreNames.contains(LEGACY_STORE_NAME)) {
          db.deleteObjectStore(LEGACY_STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open save database'));
    });
  }

  async list(): Promise<RuntimeSaveSummary[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(SUMMARY_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SUMMARY_STORE_NAME);
      const records = await requestToPromise<RuntimeSaveSummary[]>(store.getAll());
      return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } finally {
      db.close();
    }
  }

  async load(saveId: string): Promise<RuntimeSaveRecord | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction([SUMMARY_STORE_NAME, PAYLOAD_STORE_NAME], 'readonly');
      const [summary, payload] = await Promise.all([
        requestToPromise<RuntimeSaveSummary | undefined>(transaction.objectStore(SUMMARY_STORE_NAME).get(saveId)),
        requestToPromise<RuntimeSavePayload | undefined>(transaction.objectStore(PAYLOAD_STORE_NAME).get(saveId))
      ]);
      if (!summary || !payload) return null;
      return { ...summary, runtimeState: payload.runtimeState };
    } finally {
      db.close();
    }
  }

  async save(record: RuntimeSaveRecord): Promise<void> {
    await this.saveMany([record]);
  }

  async saveMany(records: RuntimeSaveRecord[]): Promise<void> {
    if (records.length === 0) return;

    const db = await this.open();
    try {
      const transaction = db.transaction([SUMMARY_STORE_NAME, PAYLOAD_STORE_NAME], 'readwrite');
      const done = transactionDone(transaction);
      const summaryStore = transaction.objectStore(SUMMARY_STORE_NAME);
      const payloadStore = transaction.objectStore(PAYLOAD_STORE_NAME);
      try {
        for (const record of records) {
          const { summary, payload } = splitSaveRecord(record);
          summaryStore.put(summary);
          payloadStore.put(payload);
        }
      } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
      }
      await done;
    } finally {
      db.close();
    }
  }

  async delete(saveId: string): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction([SUMMARY_STORE_NAME, PAYLOAD_STORE_NAME], 'readwrite');
      transaction.objectStore(SUMMARY_STORE_NAME).delete(saveId);
      transaction.objectStore(PAYLOAD_STORE_NAME).delete(saveId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction([SUMMARY_STORE_NAME, PAYLOAD_STORE_NAME], 'readwrite');
      transaction.objectStore(SUMMARY_STORE_NAME).clear();
      transaction.objectStore(PAYLOAD_STORE_NAME).clear();
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}
