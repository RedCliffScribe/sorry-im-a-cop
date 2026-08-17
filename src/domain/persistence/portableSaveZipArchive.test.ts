import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem } from '../runtime/types';
import type { RuntimeSaveRecord } from './SaveRepository';
import {
  createPortableSaveZip,
  parsePortableSaveBundle,
  parsePortableSaveZip,
  PORTABLE_SAVE_ZIP_FORMAT,
  PORTABLE_SAVE_ZIP_VERSION
} from './portableSaveZipArchive';

function createRecord(saveId: string, saveKind: 'manual' | 'auto'): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  runtimeState.memories.memory_zip_test = {
    memoryId: 'memory_zip_test',
    text: 'The player submitted a manuscript.',
    kind: 'player',
    tier: 'short_term',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    importance: 70,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: 'submitted manuscript',
    embeddingVector: [0.1, 0.2, 0.3],
    embeddingModel: 'test-model',
    embeddingUpdatedAt: '2026-07-16T00:00:00.000Z'
  } as MemoryItem;

  return {
    saveId,
    rollbackChainId: `chain_${saveId}`,
    saveName: `${saveKind} save`,
    saveKind,
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-09-12 21:15',
    turnCounter: saveKind === 'manual' ? 12 : 13,
    runtimeState
  };
}

describe('portable ZIP save archives', () => {
  it('stores every save as an independent JSON file and reserves media folders', async () => {
    const zipBytes = await createPortableSaveZip(
      [createRecord('manual_save', 'manual'), createRecord('auto_save', 'auto')],
      '2026-07-16T01:00:00.000Z'
    );
    const entries = unzipSync(zipBytes);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));

    expect(manifest).toMatchObject({
      format: PORTABLE_SAVE_ZIP_FORMAT,
      version: PORTABLE_SAVE_ZIP_VERSION,
      saveCount: 2
    });
    expect(manifest.saves.map((entry: { path: string }) => entry.path)).toEqual([
      expect.stringMatching(/^saves\/manual\/.*\.json$/),
      expect.stringMatching(/^saves\/auto\/.*\.json$/)
    ]);
    expect(entries).toHaveProperty('assets/images/characters/.keep');
    expect(entries).toHaveProperty('assets/images/locations/.keep');
    expect(entries).toHaveProperty('assets/images/events/.keep');
    expect(entries).toHaveProperty('assets/images/objects/.keep');

    for (const summary of manifest.saves as Array<{ path: string }>) {
      const record = JSON.parse(strFromU8(entries[summary.path]));
      expect(record.runtimeState.memories.memory_zip_test.text).toBe(
        'The player submitted a manuscript.'
      );
      expect(record.runtimeState.memories.memory_zip_test).not.toHaveProperty(
        'embeddingVector'
      );
    }
  });

  it('round-trips validated saves from the ZIP manifest', async () => {
    const sourceRecords = [
      createRecord('manual_save', 'manual'),
      createRecord('auto_save', 'auto')
    ];
    const zipBytes = await createPortableSaveZip(sourceRecords);

    const importedRecords = await parsePortableSaveZip(zipBytes);

    expect(importedRecords.map((record) => record.saveId)).toEqual([
      'manual_save',
      'auto_save'
    ]);
    expect(importedRecords[0].runtimeState.memories.memory_zip_test).not.toHaveProperty(
      'embeddingVector'
    );
  });

  it('optionally embeds one visual archive per shared rollback partition', async () => {
    const manual = createRecord('manual_save', 'manual');
    const auto = createRecord('auto_save', 'auto');
    auto.rollbackChainId = manual.rollbackChainId;
    const visualBytes = zipSync({ 'manifest.json': strToU8('{"fixture":true}') });
    const zipBytes = await createPortableSaveZip([manual, auto], undefined, {
      visualArchives: { [manual.rollbackChainId!]: visualBytes }
    });
    const parsed = await parsePortableSaveBundle(zipBytes);
    const entries = unzipSync(zipBytes);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));

    expect(manifest.visuals).toEqual([
      expect.objectContaining({ partitionId: manual.rollbackChainId, path: expect.stringMatching(/^visuals\/.*\.zip$/) })
    ]);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.visualArchives[manual.rollbackChainId!]).toEqual(visualBytes);
  });

  it('embeds AVG override archives only for known visual partitions', async () => {
    const manual = createRecord('manual_override', 'manual');
    const overrideBytes = zipSync({ 'manifest.json': strToU8('{"override":true}') });
    const zipBytes = await createPortableSaveZip([manual], undefined, {
      avgOverrideArchives: { [manual.rollbackChainId!]: overrideBytes }
    });
    const parsed = await parsePortableSaveBundle(zipBytes);
    const entries = unzipSync(zipBytes);
    const manifest = JSON.parse(strFromU8(entries['manifest.json']));

    expect(manifest.avgOverrides).toEqual([
      expect.objectContaining({
        partitionId: manual.rollbackChainId,
        path: expect.stringMatching(/^avg-overrides\/.*\.zip$/)
      })
    ]);
    expect(parsed.avgOverrideArchives?.[manual.rollbackChainId!]).toEqual(overrideBytes);

    await expect(createPortableSaveZip([manual], undefined, {
      avgOverrideArchives: { unknown_partition: overrideBytes }
    })).rejects.toThrow('不属于导出存档链');
  });

  it('keeps accepting version 2 save-only ZIP archives', async () => {
    const current = unzipSync(await createPortableSaveZip([createRecord('legacy', 'manual')]));
    const manifest = JSON.parse(strFromU8(current['manifest.json']));
    manifest.version = 2;
    delete manifest.visuals;
    current['manifest.json'] = strToU8(JSON.stringify(manifest));

    const parsed = await parsePortableSaveBundle(zipSync(current));
    expect(parsed.records.map((record) => record.saveId)).toEqual(['legacy']);
    expect(parsed.visualArchives).toEqual({});
  });

  it('keeps accepting version 3 visual ZIP archives without AVG overrides', async () => {
    const current = unzipSync(await createPortableSaveZip([createRecord('legacy_v3', 'manual')]));
    const manifest = JSON.parse(strFromU8(current['manifest.json']));
    manifest.version = 3;
    delete manifest.avgOverrides;
    current['manifest.json'] = strToU8(JSON.stringify(manifest));

    const parsed = await parsePortableSaveBundle(zipSync(current));
    expect(parsed.records.map((record) => record.saveId)).toEqual(['legacy_v3']);
    expect(parsed.avgOverrideArchives).toEqual({});
  });

  it('keeps accepting version 4 ZIP archives with AVG overrides', async () => {
    const current = unzipSync(await createPortableSaveZip([createRecord('legacy_v4', 'manual')]));
    const manifest = JSON.parse(strFromU8(current['manifest.json']));
    manifest.version = 4;
    current['manifest.json'] = strToU8(JSON.stringify(manifest));

    const parsed = await parsePortableSaveBundle(zipSync(current));
    expect(parsed.records.map((record) => record.saveId)).toEqual(['legacy_v4']);
    expect(parsed.avgOverrideArchives).toEqual({});
  });
});
