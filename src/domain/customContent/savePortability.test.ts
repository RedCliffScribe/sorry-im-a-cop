import { describe, expect, it } from 'vitest';
import type { RuntimeSaveRecord } from '../persistence/SaveRepository';
import {
  createPortableSaveZip,
  parsePortableSaveZip
} from '../persistence/portableSaveZipArchive';
import { parseRuntimeSaveRecord } from '../persistence/saveArchiveSchema';
import { createInitialRuntimeState } from '../runtime/initialState';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import type { CustomCharacterRevision } from './assetTypes';
import {
  bindCustomCharacterRevisionToState,
  createEmptyRuntimeCustomContentState
} from './saveBinding';
import { createNativeCustomSaveAdaptationBundle } from './saveAdaptation';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

function portableCharacter(): CustomCharacterRevision {
  return {
    characterAssetId: 'character-portable',
    revision: 3,
    checksum: 'checksum-portable-character-revision-3',
    displayName: '可携人物',
    aliases: [],
    gender: 'female',
    profileSummary: '随存档携带的人物 revision。',
    backgroundSummary: '目标设备不需要读取全局内容库。',
    corePersonality: ['谨慎'],
    values: ['承诺'],
    coreMotivations: ['完成任务'],
    majorRelationships: [],
    entryMode: 'natural',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: true
      }
    ],
    sourceSpans: [],
    lifecycle: {
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    }
  };
}

describe('custom content save portability', () => {
  it('loads legacy custom-content saves without adaptation intents', () => {
    const state = createInitialRuntimeState();
    const {
      characterAdaptationIntents: _legacyMissingField,
      ...legacyCustomContent
    } = createEmptyRuntimeCustomContentState();
    const parsed = parseRuntimeSaveRecord({
      saveId: 'legacy-custom-content-save',
      saveName: '旧版自定义内容存档',
      createdAt: '2026-07-26T03:20:00.000Z',
      updatedAt: '2026-07-26T03:20:00.000Z',
      playerName: state.player.name,
      worldpackId: state.world.worldpackId,
      gameDateLabel: '1988年9月12日',
      turnCounter: 0,
      runtimeState: {
        ...state,
        customContent: legacyCustomContent
      }
    });

    expect(
      parsed.runtimeState.customContent?.characterAdaptationIntents
    ).toEqual([]);
  });

  it('round-trips bound revisions and adaptations without a global asset database', async () => {
    const state = createInitialRuntimeState();
    const character = portableCharacter();
    const runtimeState = bindCustomCharacterRevisionToState({
      state,
      character,
      adaptationBundle: createNativeCustomSaveAdaptationBundle({
        state,
        descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
        source: { characters: [character] }
      }),
      now: '2026-07-26T03:20:00.000Z'
    });
    const record: RuntimeSaveRecord = {
      saveId: 'portable-custom-save',
      saveName: '自定义内容便携存档',
      saveKind: 'manual',
      createdAt: '2026-07-26T03:20:00.000Z',
      updatedAt: '2026-07-26T03:20:00.000Z',
      playerName: runtimeState.player.name,
      worldpackId: runtimeState.world.worldpackId,
      gameDateLabel: '1988年9月12日',
      turnCounter: runtimeState.turnCounter,
      runtimeState
    };

    const [restored] = await parsePortableSaveZip(
      await createPortableSaveZip(
        [record],
        '2026-07-26T03:21:00.000Z'
      )
    );

    expect(restored.runtimeState.customContent).toEqual(
      runtimeState.customContent
    );
    expect(
      restored.runtimeState.customContent?.characterBindings[0].payload
    ).toEqual(character);
    expect(
      Object.values(
        restored.runtimeState.customContent?.characterAdaptations ?? {}
      )[0]
    ).toMatchObject({
      characterAssetId: 'character-portable',
      runtimeActorId: 'custom-actor:character-portable',
      status: 'ready'
    });
  });

  it('validates the custom-content state during save import', () => {
    const state = createInitialRuntimeState();
    const record = {
      saveId: 'invalid-priority-save',
      saveName: '非法重点数量',
      createdAt: '2026-07-26T03:20:00.000Z',
      updatedAt: '2026-07-26T03:20:00.000Z',
      playerName: state.player.name,
      worldpackId: state.world.worldpackId,
      gameDateLabel: '1988年9月12日',
      turnCounter: 0,
      runtimeState: {
        ...state,
        customContent: {
          schemaVersion: 1,
          projectBindings: [],
          characterBindings: [],
          eventGroupBindings: [],
          projectAdaptations: {},
          characterAdaptations: {},
          eventGroupAdaptations: {},
          characterEntryIntents: [],
          eventEntryIntents: [],
          characterRuntimeBindings: [],
          eventInstances: [],
          priorityItems: Array.from({ length: 4 }, (_, index) => ({
            priorityItemId: `priority-${index}`,
            targetKind: 'character',
            targetId: `binding-${index}`,
            status: 'active',
            createdAt: '2026-07-26T03:20:00.000Z',
            updatedAt: '2026-07-26T03:20:00.000Z'
          })),
          recentDiagnostics: []
        }
      }
    };

    expect(() => parseRuntimeSaveRecord(record)).toThrow();
  });

  it('round-trips durable event progress, fact states and paused status', async () => {
    const runtimeState = createInitialRuntimeState();
    runtimeState.customContent = {
      ...createEmptyRuntimeCustomContentState(),
      eventInstances: [
        {
          instanceId: 'event-instance:portable',
          eventGroupId: 'event-portable',
          eventGroupRevision: 2,
          projectId: 'project-portable',
          projectRevision: 2,
          adaptationId: 'adaptation:event-portable',
          status: 'paused',
          statusBeforePause: 'active',
          currentStageId: 'stage-follow-up',
          projectCharacterBindings: {},
          roleBindings: {},
          usedStageIds: ['stage-discovery'],
          usedNodeIds: ['node-find-ledger'],
          factStateOverrides: {
            'fact-ledger-tampered': 'established_in_save',
            'fact-first-suspect': 'invalidated_in_save'
          },
          progressHistory: [
            {
              turnCounter: 4,
              stageId: 'stage-discovery',
              usedNodeIds: ['node-find-ledger'],
              decision: 'advance',
              nextStageId: 'stage-follow-up',
              supportingWritebackRefs: [
                { kind: 'current_matter', id: 'matter-ledger' }
              ],
              factStateChanges: [
                {
                  factId: 'fact-ledger-tampered',
                  state: 'established_in_save',
                  supportingWritebackRefs: [
                    { kind: 'current_matter', id: 'matter-ledger' }
                  ]
                }
              ]
            }
          ],
          resultingWritebackRefs: [
            { kind: 'current_matter', id: 'matter-ledger' }
          ]
        }
      ]
    };
    const record: RuntimeSaveRecord = {
      saveId: 'portable-event-progress-save',
      saveName: '事件进度便携存档',
      saveKind: 'manual',
      createdAt: '2026-07-28T01:00:00.000Z',
      updatedAt: '2026-07-28T01:00:00.000Z',
      playerName: runtimeState.player.name,
      worldpackId: runtimeState.world.worldpackId,
      gameDateLabel: '1988年9月12日',
      turnCounter: runtimeState.turnCounter,
      runtimeState
    };

    const [restored] = await parsePortableSaveZip(
      await createPortableSaveZip([record], '2026-07-28T01:01:00.000Z')
    );

    expect(restored.runtimeState.customContent?.eventInstances[0]).toEqual(
      runtimeState.customContent.eventInstances[0]
    );
  });
});
