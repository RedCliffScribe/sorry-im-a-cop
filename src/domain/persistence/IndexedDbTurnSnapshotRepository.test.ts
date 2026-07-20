import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createTurnRollbackSnapshot } from '../turn/TurnRollback';
import { IndexedDbTurnSnapshotRepository } from './IndexedDbTurnSnapshotRepository';

function createSnapshot(actionText: string, turnCounter: number) {
  const state = createInitialRuntimeState();
  state.turnCounter = turnCounter;
  return createTurnRollbackSnapshot({
    beforeState: state,
    actionText,
    createdAt: `2026-07-07T00:0${turnCounter}:00.000Z`
  });
}

function openDatabase(name: string, version: number, onUpgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => onUpgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await deleteDatabase('cop-v2-test-turn-snapshots');
});

describe('IndexedDbTurnSnapshotRepository', () => {
  it('saves, lists, and loads turn snapshots for one rollback chain', async () => {
    const repository = new IndexedDbTurnSnapshotRepository('cop-v2-test-turn-snapshots');

    await repository.saveTurnSnapshot({
      chainId: 'chain_a',
      turnNumber: 1,
      snapshot: createSnapshot('第一步', 0),
      maxDepth: 20
    });
    await repository.saveTurnSnapshot({
      chainId: 'chain_b',
      turnNumber: 1,
      snapshot: createSnapshot('另一条链', 0),
      maxDepth: 20
    });

    const summaries = await repository.listTurnSnapshots('chain_a');
    const loaded = await repository.loadTurnSnapshot('chain_a', 1);

    expect(summaries).toEqual([
      {
        chainId: 'chain_a',
        turnNumber: 1,
        createdAt: '2026-07-07T00:00:00.000Z',
        actionText: '第一步'
      }
    ]);
    expect(loaded?.actionText).toBe('第一步');
    expect(await repository.loadTurnSnapshot('chain_a', 2)).toBeNull();
  });

  it('prunes old snapshots by max depth and deletes future snapshots after rollback', async () => {
    const repository = new IndexedDbTurnSnapshotRepository('cop-v2-test-turn-snapshots');

    for (const turnNumber of [1, 2, 3, 4]) {
      await repository.saveTurnSnapshot({
        chainId: 'chain_a',
        turnNumber,
        snapshot: createSnapshot(`第${turnNumber}步`, turnNumber - 1),
        maxDepth: 3
      });
    }

    expect((await repository.listTurnSnapshots('chain_a')).map((snapshot) => snapshot.turnNumber)).toEqual([2, 3, 4]);

    await repository.deleteTurnSnapshotsAfter('chain_a', 2);

    expect((await repository.listTurnSnapshots('chain_a')).map((snapshot) => snapshot.turnNumber)).toEqual([2]);
  });

  it('clears snapshots when max depth is disabled', async () => {
    const repository = new IndexedDbTurnSnapshotRepository('cop-v2-test-turn-snapshots');
    await repository.saveTurnSnapshot({
      chainId: 'chain_a',
      turnNumber: 1,
      snapshot: createSnapshot('第一步', 0),
      maxDepth: 20
    });

    await repository.saveTurnSnapshot({
      chainId: 'chain_a',
      turnNumber: 2,
      snapshot: createSnapshot('第二步', 1),
      maxDepth: 0
    });

    expect(await repository.listTurnSnapshots('chain_a')).toEqual([]);
  });

  it('upgrades a version 1 snapshot store with a chainId index and preserves records', async () => {
    const snapshot = createSnapshot('旧链行动', 0);
    const legacyDb = await openDatabase('cop-v2-test-turn-snapshots', 1, (db) => {
      db.createObjectStore('turn-snapshots', { keyPath: 'snapshotId' });
    });
    const legacyTransaction = legacyDb.transaction('turn-snapshots', 'readwrite');
    legacyTransaction.objectStore('turn-snapshots').put({
      snapshotId: 'chain_legacy:1',
      chainId: 'chain_legacy',
      turnNumber: 1,
      createdAt: snapshot.createdAt,
      actionText: snapshot.actionText,
      snapshot
    });
    await transactionDone(legacyTransaction);
    legacyDb.close();

    const repository = new IndexedDbTurnSnapshotRepository('cop-v2-test-turn-snapshots');
    expect((await repository.listTurnSnapshots('chain_legacy')).map((item) => item.turnNumber)).toEqual([1]);
    expect(await repository.listTurnSnapshots('other_chain')).toEqual([]);

    const upgradedDb = await openDatabase('cop-v2-test-turn-snapshots', 2);
    const transaction = upgradedDb.transaction('turn-snapshots', 'readonly');
    expect(Array.from(transaction.objectStore('turn-snapshots').indexNames)).toContain('by-chain-id');
    upgradedDb.close();
  });
});
