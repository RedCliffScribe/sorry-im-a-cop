import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeSaveRecord } from './SaveRepository';
import { parseSaveArchive } from './saveArchiveSchema';

function createRecord(): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  return {
    saveId: 'external_save',
    rollbackChainId: 'external_chain',
    saveName: '测试存档',
    saveKind: 'manual',
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-09-12 星期一 21:15',
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
}

describe('parseSaveArchive', () => {
  it('accepts the current versioned save archive', () => {
    const record = createRecord();

    expect(
      parseSaveArchive({
        version: 1,
        exportedAt: '2026-07-12T01:00:00.000Z',
        saves: [record]
      }).saves
    ).toEqual([record]);
  });

  it('rejects the whole archive when a record is missing runtimeState.player', () => {
    const validRecord = createRecord();
    const invalidRecord = structuredClone(validRecord) as unknown as Record<string, unknown>;
    delete (invalidRecord.runtimeState as Record<string, unknown>).player;

    expect(() =>
      parseSaveArchive({
        version: 1,
        saves: [validRecord, invalidRecord]
      })
    ).toThrow();
  });

  it('rejects legacy naked save arrays', () => {
    expect(() => parseSaveArchive([createRecord()])).toThrow();
  });
});
