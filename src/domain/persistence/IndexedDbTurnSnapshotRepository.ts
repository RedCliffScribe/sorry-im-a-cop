import type {
  SaveTurnSnapshotInput,
  TurnSnapshotRepository,
  TurnSnapshotSummary
} from './TurnSnapshotRepository';
import type { TurnRollbackSnapshot } from '../turn/TurnRollback';

const STORE_NAME = 'turn-snapshots';
const DB_VERSION = 2;
const CHAIN_ID_INDEX_NAME = 'by-chain-id';

interface StoredTurnSnapshot extends TurnSnapshotSummary {
  snapshotId: string;
  snapshot: TurnRollbackSnapshot;
}

function createSnapshotId(chainId: string, turnNumber: number): string {
  return `${chainId}:${turnNumber}`;
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

export class IndexedDbTurnSnapshotRepository implements TurnSnapshotRepository {
  constructor(private readonly dbName = 'sorry-im-a-cop-v2-turn-snapshots') {}

  private async open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const transaction = request.transaction;
        if (!transaction) return;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'snapshotId' });
        if (!store.indexNames.contains(CHAIN_ID_INDEX_NAME)) {
          store.createIndex(CHAIN_ID_INDEX_NAME, 'chainId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open turn snapshot database'));
    });
  }

  async saveTurnSnapshot({ chainId, turnNumber, snapshot, maxDepth }: SaveTurnSnapshotInput): Promise<void> {
    if (maxDepth <= 0) {
      await this.clearTurnSnapshotsForChain(chainId);
      return;
    }

    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record: StoredTurnSnapshot = {
        snapshotId: createSnapshotId(chainId, turnNumber),
        chainId,
        turnNumber,
        createdAt: snapshot.createdAt,
        actionText: snapshot.actionText,
        snapshot
      };

      store.put(record);
      await transactionDone(transaction);
    } finally {
      db.close();
    }

    await this.pruneSnapshots(chainId, maxDepth);
  }

  async loadTurnSnapshot(chainId: string, turnNumber: number): Promise<TurnRollbackSnapshot | null> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const record = await requestToPromise<StoredTurnSnapshot | undefined>(
        store.get(createSnapshotId(chainId, turnNumber))
      );
      return record?.snapshot ?? null;
    } finally {
      db.close();
    }
  }

  async listTurnSnapshots(chainId: string): Promise<TurnSnapshotSummary[]> {
    const records = await this.getAllForChain(chainId);
    return records
      .map(({ chainId: recordChainId, turnNumber, createdAt, actionText }) => ({
        chainId: recordChainId,
        turnNumber,
        createdAt,
        actionText
      }))
      .sort((left, right) => left.turnNumber - right.turnNumber);
  }

  async deleteTurnSnapshotsAfter(chainId: string, turnNumber: number): Promise<void> {
    const records = await this.getAllForChain(chainId);
    const expired = records.filter((record) => record.turnNumber > turnNumber);
    if (!expired.length) return;

    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const record of expired) {
        store.delete(record.snapshotId);
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  async clearTurnSnapshotsForChain(chainId: string): Promise<void> {
    const records = await this.getAllForChain(chainId);
    if (!records.length) return;

    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const record of records) {
        store.delete(record.snapshotId);
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  private async pruneSnapshots(chainId: string, maxDepth: number): Promise<void> {
    const records = await this.getAllForChain(chainId);
    const expired = records
      .sort((left, right) => right.turnNumber - left.turnNumber)
      .slice(Math.max(0, maxDepth));
    if (!expired.length) return;

    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const record of expired) {
        store.delete(record.snapshotId);
      }
      await transactionDone(transaction);
    } finally {
      db.close();
    }
  }

  private async getAllForChain(chainId: string): Promise<StoredTurnSnapshot[]> {
    const db = await this.open();
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      return await requestToPromise<StoredTurnSnapshot[]>(
        store.index(CHAIN_ID_INDEX_NAME).getAll(IDBKeyRange.only(chainId))
      );
    } finally {
      db.close();
    }
  }
}
