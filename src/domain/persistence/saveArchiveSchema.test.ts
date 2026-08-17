import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
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

  it('accepts DLC activation metadata while keeping the binding optional for old saves', () => {
    const record = createRecord();
    delete (record.runtimeState.world as Partial<typeof record.runtimeState.world>).officialDlcBindings;

    const parsedLegacy = parseSaveArchive({ version: 1, saves: [record] });
    expect(parsedLegacy.saves[0]?.runtimeState.world.officialDlcBindings).toBeUndefined();
    const migrated = withRuntimeDefaults(parsedLegacy.saves[0]!.runtimeState);
    expect(migrated.world.officialDlcBindings).toEqual([]);

    record.runtimeState.world.officialDlcBindings = [{
      dlcId: 'official_dlc_test',
      version: '0.0.1-test',
      status: 'active',
      activatedAt: '2026-08-04T00:00:00.000Z'
    }];
    expect(parseSaveArchive({ version: 1, saves: [record] }).saves[0]
      ?.runtimeState.world.officialDlcBindings).toEqual(record.runtimeState.world.officialDlcBindings);
  });

  it('migrates a legacy save without narrative arc state and preserves a valid arc', () => {
    const record = createRecord();
    delete (record.runtimeState as Partial<typeof record.runtimeState>).narrativeArcs;

    const parsedLegacy = parseSaveArchive({ version: 1, saves: [record] });
    expect(withRuntimeDefaults(parsedLegacy.saves[0]!.runtimeState).narrativeArcs).toEqual([]);

    record.runtimeState.narrativeArcs = [{
      arcInstanceId: 'arc_midnight_bus',
      sourceRef: {
        providerId: 'official-dlc',
        sourceType: 'official_dlc_event',
        sourceId: 'urban_legends_alpha:midnight_bus',
        dlcId: 'urban_legends_alpha'
      },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: ['rumor_node'],
      createdTurn: 0,
      lastProgressTurn: 2,
      writebackRefs: [{ kind: 'matter', id: 'matter_midnight_bus' }],
      lastSummary: '街坊开始谈论夜间巴士。'
    }];
    const parsed = parseSaveArchive({ version: 1, saves: [record] });
    expect(parsed.saves[0]?.runtimeState.narrativeArcs).toEqual(record.runtimeState.narrativeArcs);
  });

  it('preserves optional per-turn experience awards while old entries remain valid', () => {
    const record = createRecord();
    record.runtimeState.storyLog.push({
      turnId: 'turn_1',
      speaker: 'narrator',
      text: '玩家完成了一次困难观察。',
      gameTime: record.runtimeState.time,
      experienceAward: {
        awardId: 'xp:turn_1',
        turnId: 'turn_1',
        total: 10,
        sources: [
          {
            kind: 'judgement',
            sourceId: 'judgement:check_1',
            amount: 10,
            reason: '困难观察判定成功'
          }
        ],
        capped: false,
        levelsGained: 0,
        attributePointsGained: 0,
        levelAfter: 1
      }
    });

    const parsed = parseSaveArchive({
      version: 1,
      saves: [record]
    });

    expect(parsed.saves[0]?.runtimeState.storyLog.at(-1)?.experienceAward).toEqual(
      record.runtimeState.storyLog.at(-1)?.experienceAward
    );
    expect(parsed.saves[0]?.runtimeState.storyLog[0]?.experienceAward).toBeUndefined();
  });

  it('round-trips persisted story blocks while legacy entries remain block-free', () => {
    const record = createRecord();
    expect(record.runtimeState.storyLog[0]?.blocks).toBeUndefined();
    record.runtimeState.storyLog.push({
      turnId: 'turn_story_blocks',
      speaker: 'narrator',
      text: '【阿May】等等。',
      gameTime: record.runtimeState.time,
      blocks: [
        {
          type: 'dialogue',
          text: '等等。',
          speakerLabel: '阿May',
          speakerActorId: 'npc_may',
          emotion: 'worried'
        }
      ]
    });

    const serialized = JSON.parse(JSON.stringify({ version: 1, saves: [record] }));
    const parsed = parseSaveArchive(serialized);
    expect(parsed.saves[0]?.runtimeState.storyLog.at(-1)?.blocks).toEqual(
      record.runtimeState.storyLog.at(-1)?.blocks
    );
    expect(parsed.saves[0]?.runtimeState.storyLog[0]?.blocks).toBeUndefined();
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
