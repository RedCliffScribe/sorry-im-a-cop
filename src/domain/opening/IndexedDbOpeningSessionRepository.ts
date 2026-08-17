import {
  openingSessionDraftSchema,
  type OpeningSessionDraft
} from './openingSessionDraft';
import type {
  OpeningSessionRepository,
  OpeningSessionSummary
} from './openingSessionRepository';

const DB_VERSION = 1;
const STORE_NAME = 'opening-session-drafts';
const SETUP_HASH_INDEX = 'by-setup-hash';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function toSummary(draft: OpeningSessionDraft): OpeningSessionSummary {
  return {
    openingSessionId: draft.openingSessionId,
    setupHash: draft.setupHash,
    worldpackId: draft.worldpackId,
    stage: draft.stage,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  };
}

export class IndexedDbOpeningSessionRepository
  implements OpeningSessionRepository
{
  constructor(
    private readonly dbName = 'sorry-im-a-cop-v2-opening-sessions'
  ) {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) return;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, {
              keyPath: 'openingSessionId'
            });
        if (!store.indexNames.contains(SETUP_HASH_INDEX)) {
          store.createIndex(SETUP_HASH_INDEX, 'setupHash', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ?? new Error('Failed to open opening session database')
        );
    });
  }

  async list(): Promise<OpeningSessionSummary[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const raw = await requestToPromise<unknown[]>(
        transaction.objectStore(STORE_NAME).getAll()
      );
      return raw
        .map((value) => openingSessionDraftSchema.parse(value))
        .map(toSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } finally {
      db.close();
    }
  }

  async load(openingSessionId: string): Promise<OpeningSessionDraft | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const value = await requestToPromise<unknown>(
        transaction.objectStore(STORE_NAME).get(openingSessionId)
      );
      return value === undefined
        ? null
        : openingSessionDraftSchema.parse(value);
    } finally {
      db.close();
    }
  }

  async findLatestResumable(
    setupHash: string
  ): Promise<OpeningSessionDraft | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const raw = await requestToPromise<unknown[]>(
        transaction
          .objectStore(STORE_NAME)
          .index(SETUP_HASH_INDEX)
          .getAll(setupHash)
      );
      return (
        raw
          .map((value) => openingSessionDraftSchema.parse(value))
          .filter((draft) => draft.stage !== 'committed')
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
        null
      );
    } finally {
      db.close();
    }
  }

  async save(draft: OpeningSessionDraft): Promise<void> {
    const validated = openingSessionDraftSchema.parse(draft);
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(validated);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async delete(openingSessionId: string): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(openingSessionId);
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }
}
