import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { IndexedDbSaveRepository } from './IndexedDbSaveRepository';
import type { RuntimeSaveRecord } from './SaveRepository';

function createRecord(saveId: string, saveName: string, updatedAt: string): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  return {
    saveId,
    saveName,
    createdAt: '2026-06-23T00:00:00.000Z',
    updatedAt,
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-06-01 08:30',
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
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
  await deleteDatabase('cop-v2-test-saves');
});

describe('IndexedDbSaveRepository', () => {
  it('creates, lists, and loads runtime saves', async () => {
    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    await repository.save(createRecord('save_a', 'A', '2026-06-23T00:00:00.000Z'));
    await repository.save(createRecord('save_b', 'B', '2026-06-23T00:01:00.000Z'));

    const saves = await repository.list();
    const loaded = await repository.load('save_a');

    expect(saves.map((save) => save.saveName)).toEqual(['B', 'A']);
    expect(saves[0]).not.toHaveProperty('runtimeState');
    expect(loaded?.runtimeState.world.worldpackId).toBe('hk_1988');
  });

  it('deletes a save', async () => {
    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    await repository.save(createRecord('save_a', 'A', '2026-06-23T00:00:00.000Z'));

    await repository.delete('save_a');

    expect(await repository.load('save_a')).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  it('saves multiple records in one batch', async () => {
    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');

    await repository.saveMany([
      createRecord('save_a', 'A', '2026-06-23T00:00:00.000Z'),
      createRecord('save_b', 'B', '2026-06-23T00:01:00.000Z')
    ]);

    expect((await repository.list()).map((save) => save.saveId)).toEqual(['save_b', 'save_a']);
  });

  it('rolls back the whole batch when a later record cannot be stored', async () => {
    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    const invalidRecord = createRecord('save_invalid', 'Invalid', '2026-06-23T00:01:00.000Z');
    (invalidRecord.runtimeState as RuntimeSaveRecord['runtimeState'] & { invalidValue: unknown }).invalidValue = () =>
      'not cloneable';

    await expect(
      repository.saveMany([
        createRecord('save_valid', 'Valid', '2026-06-23T00:00:00.000Z'),
        invalidRecord
      ])
    ).rejects.toBeDefined();

    expect(await repository.list()).toEqual([]);
  });

  it('lists summaries without reading the runtime payload store', async () => {
    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    await repository.save(createRecord('save_a', 'A', '2026-06-23T00:00:00.000Z'));
    const db = await openDatabase('cop-v2-test-saves', 3);
    const transaction = db.transaction('runtime-save-payloads', 'readwrite');
    transaction.objectStore('runtime-save-payloads').delete('save_a');
    await transactionDone(transaction);
    db.close();

    expect((await repository.list()).map((save) => save.saveId)).toEqual(['save_a']);
    expect(await repository.load('save_a')).toBeNull();
  });

  it('migrates version 1 save records into separate summary and payload stores', async () => {
    const legacyRecord = createRecord('legacy_save', 'Legacy', '2026-06-23T00:00:00.000Z');
    const legacyDb = await openDatabase('cop-v2-test-saves', 1, (db) => {
      db.createObjectStore('runtime-saves', { keyPath: 'saveId' });
    });
    const legacyTransaction = legacyDb.transaction('runtime-saves', 'readwrite');
    legacyTransaction.objectStore('runtime-saves').put(legacyRecord);
    await transactionDone(legacyTransaction);
    legacyDb.close();

    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    expect((await repository.list()).map((save) => save.saveId)).toEqual(['legacy_save']);
    expect((await repository.load('legacy_save'))?.runtimeState.player.name).toBe(legacyRecord.runtimeState.player.name);

    const migratedDb = await openDatabase('cop-v2-test-saves', 3);
    expect(Array.from(migratedDb.objectStoreNames)).toEqual(
      expect.arrayContaining(['runtime-save-summaries', 'runtime-save-payloads'])
    );
    expect(Array.from(migratedDb.objectStoreNames)).not.toContain('runtime-saves');
    migratedDb.close();
  });

  it('removes the legacy payload store when upgrading an existing version 2 database', async () => {
    const legacyRecord = createRecord('legacy_copy', 'Legacy copy', '2026-06-23T00:00:00.000Z');
    const db = await openDatabase('cop-v2-test-saves', 2, (upgradeDb) => {
      upgradeDb.createObjectStore('runtime-saves', { keyPath: 'saveId' });
      upgradeDb.createObjectStore('runtime-save-summaries', { keyPath: 'saveId' });
      upgradeDb.createObjectStore('runtime-save-payloads', { keyPath: 'saveId' });
    });
    const transaction = db.transaction(
      ['runtime-saves', 'runtime-save-summaries', 'runtime-save-payloads'],
      'readwrite'
    );
    transaction.objectStore('runtime-saves').put(legacyRecord);
    transaction.objectStore('runtime-save-summaries').put({
      ...legacyRecord,
      runtimeState: undefined
    });
    transaction.objectStore('runtime-save-payloads').put({
      saveId: legacyRecord.saveId,
      runtimeState: legacyRecord.runtimeState
    });
    await transactionDone(transaction);
    db.close();

    const repository = new IndexedDbSaveRepository('cop-v2-test-saves');
    expect((await repository.load('legacy_copy'))?.saveName).toBe('Legacy copy');

    const upgradedDb = await openDatabase('cop-v2-test-saves', 3);
    expect(Array.from(upgradedDb.objectStoreNames)).not.toContain('runtime-saves');
    upgradedDb.close();
  });
});
