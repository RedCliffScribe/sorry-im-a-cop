import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import {
  createCustomContentRevisionRef
} from '../customContent/assetFoundation';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomEventGroupRevision
} from '../customContent/assetTypes';
import {
  bindCustomCharacterRevisionToState,
  bindCustomEventProjectRevisionToState,
  setCustomContentPriorityInState
} from '../customContent/saveBinding';
import { createNativeCustomSaveAdaptationBundle } from '../customContent/saveAdaptation';
import { createDefaultCustomCharacterAdaptationPolicy } from '../customContent/worldAdaptation';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import {
  allDramaPlanningSources,
  assembleDramaPlanningContext
} from './assemblePlanningContext';
import { defaultDramaticContentSettings } from './settings';
import {
  getProjectedDramaPayload,
  listProjectedDramaSources,
  projectedDramaSourceProviders
} from './sourceRegistry';

const approvedLifecycle = {
  generationStatus: 'ready' as const,
  reviewStatus: 'approved' as const,
  availabilityStatus: 'enabled' as const
};

const deployment = {
  worldpackId: 'hk_1988',
  mode: 'native' as const,
  defaultEnabledForNewGame: true
};

function makeCharacter(): CustomCharacterRevision {
  return {
    characterAssetId: 'character-forensic-provider',
    revision: 1,
    checksum: 'checksum-character-forensic-provider',
    displayName: '林静仪',
    aliases: ['阿仪'],
    gender: 'female',
    profileSummary: '熟悉证物流程的法证人员。',
    backgroundSummary: '长期处理警署送检证物。',
    corePersonality: ['冷静'],
    values: ['证据'],
    coreMotivations: ['保护证据链'],
    majorRelationships: [],
    entryMode: 'asap_contact',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy({
      lockedFields: ['displayName', 'corePersonality'],
      adaptableFields: ['occupation', 'playerContactRoutes']
    }),
    deployments: [deployment],
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function makeProject(
  character: CustomCharacterRevision
): CustomContentProjectRevision {
  return {
    projectId: 'project-seal-provider',
    revision: 1,
    checksum: 'checksum-project-seal-provider',
    title: '夜班证物疑云',
    summary: '一批证物的封条编号出现异常。',
    conversionMode: 'structural_adaptation',
    characterAssetIds: [character.characterAssetId],
    eventGroupIds: ['event-seal-provider'],
    deployments: [deployment],
    sourceDocumentIds: [],
    lifecycle: approvedLifecycle
  };
}

function makeEvent(
  character: CustomCharacterRevision
): CustomEventGroupRevision {
  return {
    eventGroupId: 'event-seal-provider',
    projectId: 'project-seal-provider',
    revision: 1,
    checksum: 'checksum-event-seal-provider',
    title: '封条异常',
    summary: '证物编号与登记簿不一致。',
    invariantCore: ['封条编号不一致'],
    mutableSlots: ['发现地点'],
    forbiddenAdaptations: ['不得直接宣布幕后人物'],
    characterRefs: [createCustomContentRevisionRef(character)],
    roleSlots: [
      {
        roleSlotId: 'forensic-contact',
        title: '法证联系人',
        summary: '协助核对封条。',
        bindingMode: 'fixed_character',
        fixedCharacterRef: createCustomContentRevisionRef(character),
        requirements: []
      }
    ],
    stages: [
      {
        stageId: 'stage-discovery',
        title: '发现异常',
        summary: '核对封条与登记簿。',
        establishedSourceFacts: [
          {
            factId: 'fact-established',
            summary: '玩家已经取得异常封条。',
            state: 'established_in_save',
            sourceSpans: []
          }
        ],
        continuationSourceFacts: [
          {
            factId: 'fact-source-only',
            summary: '原作中幕后人物随后主动现身。',
            state: 'source_only',
            sourceSpans: []
          }
        ],
        hardSourceConstraints: [
          {
            factId: 'fact-invalidated',
            summary: '原作中的旧地点已经被本局事实否定。',
            state: 'invalidated_in_save',
            sourceSpans: []
          },
          {
            factId: 'fact-source-only-hard',
            summary: '原作要求必须在码头完成交易。',
            state: 'source_only',
            sourceSpans: []
          }
        ],
        foreshadowingOptions: ['可通过编号差异留下伏笔'],
        eventNodes: [],
        completionHints: ['核对完成'],
        nextStageHints: []
      }
    ],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function bindCharacter(): RuntimeState {
  const state = createInitialRuntimeState();
  const character = makeCharacter();
  const adaptationBundle = createNativeCustomSaveAdaptationBundle({
    state,
    descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
    source: { characters: [character] }
  });
  return bindCustomCharacterRevisionToState({
    state,
    character,
    adaptationBundle,
    now: '2026-07-26T13:00:00.000Z'
  });
}

function bindEvent(): RuntimeState {
  const state = createInitialRuntimeState();
  const character = makeCharacter();
  const project = makeProject(character);
  const eventGroup = makeEvent(character);
  const adaptationBundle = createNativeCustomSaveAdaptationBundle({
    state,
    descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
    source: {
      project,
      characters: [character],
      eventGroup
    }
  });
  return bindCustomEventProjectRevisionToState({
    state,
    project,
    characters: [character],
    eventGroup,
    adaptationBundle,
    now: '2026-07-26T13:00:00.000Z'
  });
}

describe('custom-content dramatic providers', () => {
  it('routes explicit user priority separately and lets it bypass a disabled natural channel', () => {
    expect(
      projectedDramaSourceProviders.map((provider) => provider.providerId)
    ).toEqual(
      expect.arrayContaining(['custom-character', 'custom-event-group'])
    );

    const state = bindCharacter();
    const context = selectContext(state, '继续值班');
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.providerId === 'custom-character'
    );
    expect(source).toMatchObject({
      ref: {
        providerId: 'custom-character',
        sourceType: 'custom_character_binding'
      },
      sourceStatus: 'undecided_suggestion',
      priorityClass: 'user_requested',
      channelIds: ['custom_characters'],
      mandatory: false,
      relatedActorIds: [expect.stringContaining('custom-actor:')]
    });

    const planning = assembleDramaPlanningContext(
      state,
      context,
      {
        ...defaultDramaticContentSettings,
        pacing: 'balanced',
        channels: {
          ...defaultDramaticContentSettings.channels,
          custom_characters: 'off'
        }
      }
    );
    expect(planning.userPrioritySources).toHaveLength(1);
    expect(planning.userPrioritySources[0]).toMatchObject({
      priorityClass: 'user_requested',
      mandatory: false
    });
    expect(allDramaPlanningSources(planning)[0]).toEqual(
      planning.userPrioritySources[0]
    );
    expect(planning.filterRuleIds).not.toContain(
      'channel.custom_characters.off'
    );
  });

  it('treats ordinary custom content as a static-budget candidate that obeys its channel', () => {
    const prioritizedState = bindCharacter();
    const state = setCustomContentPriorityInState({
      state: prioritizedState,
      kind: 'character',
      assetId: 'character-forensic-provider',
      prioritized: false,
      now: '2026-07-26T13:05:00.000Z'
    });
    const context = selectContext(state, '继续值班');
    const settings = {
      ...defaultDramaticContentSettings,
      pacing: 'balanced' as const,
      channels: {
        ...defaultDramaticContentSettings.channels,
        era_storypack: 'off' as const,
        screen_characters: 'off' as const,
        custom_characters: 'medium' as const
      }
    };

    const planning = assembleDramaPlanningContext(
      state,
      context,
      settings
    );
    expect(planning.userPrioritySources).toEqual([]);
    expect(planning.staticSeedSources).toEqual([
      expect.objectContaining({
        priorityClass: 'normal',
        mandatory: false,
        ref: expect.objectContaining({ providerId: 'custom-character' })
      })
    ]);

    const blocked = assembleDramaPlanningContext(
      state,
      context,
      {
        ...settings,
        channels: {
          ...settings.channels,
          custom_characters: 'off'
        }
      }
    );
    expect(
      allDramaPlanningSources(blocked).some(
        (candidate) => candidate.ref.providerId === 'custom-character'
      )
    ).toBe(false);
    expect(blocked.filterRuleIds).toContain(
      'channel.custom_characters.off'
    );
  });

  it('returns a bounded character payload only for the exact registered ref', () => {
    const context = selectContext(bindCharacter(), '继续值班');
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.providerId === 'custom-character'
    );
    expect(source).toBeDefined();

    const payload = getProjectedDramaPayload(context, source!.ref);
    expect(payload?.confirmedFacts).toEqual([]);
    expect(payload?.detailedContext).toContain('稳定 Runtime Actor ID');
    expect(payload?.forbiddenAdaptations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('不是“已经登场'),
        '锁定字段不得改写：displayName',
        '锁定字段不得改写：corePersonality'
      ])
    );
    expect(
      getProjectedDramaPayload(context, {
        ...source!.ref,
        sourceType: 'custom_event_group_instance'
      })
    ).toBeUndefined();
    expect(
      getProjectedDramaPayload(context, {
        ...source!.ref,
        sourceId: 'missing-binding'
      })
    ).toBeUndefined();
  });

  it('keeps source-only event facts out of confirmed facts and preserves the arc', () => {
    const state = bindEvent();
    const context = selectContext(state, '继续值班');
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.providerId === 'custom-event-group'
    );

    expect(source).toMatchObject({
      ref: {
        providerId: 'custom-event-group',
        sourceType: 'custom_event_group_instance'
      },
      sourceStatus: 'undecided_suggestion',
      priorityClass: 'user_requested',
      channelIds: ['custom_events'],
      mandatory: false
    });
    expect(source?.arcKey).toBe(
      `custom-event:${state.customContent!.eventInstances[0].instanceId}`
    );

    const payload = getProjectedDramaPayload(context, source!.ref);
    expect(payload?.confirmedFacts).toEqual(['玩家已经取得异常封条。']);
    expect(payload?.confirmedFacts).not.toContain(
      '原作中幕后人物随后主动现身。'
    );
    expect(payload?.detailedContext).toContain(
      'source_only：原作中幕后人物随后主动现身。'
    );
    expect(payload?.forbiddenAdaptations).toEqual(
      expect.arrayContaining([
        '不得直接宣布幕后人物',
        expect.stringContaining('本局已经否定该来源约束')
      ])
    );
    expect(
      payload?.forbiddenAdaptations.some((item) =>
        item.includes('原作要求必须在码头完成交易')
      )
    ).toBe(false);
  });

  it('projects an active save-single-use event as reusable dynamic context', () => {
    const prioritized = bindEvent();
    const eventGroupId =
      prioritized.customContent!.eventInstances[0].eventGroupId;
    const natural = setCustomContentPriorityInState({
      state: prioritized,
      kind: 'event_group',
      assetId: eventGroupId,
      prioritized: false,
      now: '2026-07-26T13:06:00.000Z'
    });
    const instanceId = natural.customContent!.eventInstances[0].instanceId;
    const active: RuntimeState = {
      ...natural,
      customContent: {
        ...natural.customContent!,
        eventInstances: natural.customContent!.eventInstances.map((instance) => ({
          ...instance,
          status: 'active',
          resultingWritebackRefs: [
            { kind: 'current_matter', id: 'matter-seal' }
          ]
        }))
      },
      dramaticContent: {
        instances: [
          {
            instanceId: 'drama-instance-seal',
            sourceRefs: [
              {
                providerId: 'custom-event-group',
                sourceType: 'custom_event_group_instance',
                sourceId: instanceId
              }
            ],
            resultingWritebackRefs: [
              { kind: 'current_matter', id: 'matter-seal' }
            ],
            createdTurnId: 'turn_1',
            status: 'active'
          }
        ],
        recentDiagnostics: []
      }
    };
    const context = selectContext(active, '继续查封条');
    const source = listProjectedDramaSources(context).find(
      (candidate) =>
        candidate.ref.providerId === 'custom-event-group' &&
        candidate.ref.sourceId === instanceId
    );

    expect(source).toMatchObject({
      sourceStatus: 'active_process',
      reusePolicy: 'context_reusable',
      priorityClass: 'normal'
    });

    const planning = assembleDramaPlanningContext(
      active,
      context,
      defaultDramaticContentSettings
    );
    expect(
      planning.optionalDynamicSources.some(
        (candidate) => candidate.ref.sourceId === instanceId
      )
    ).toBe(true);
    expect(
      planning.staticSeedSources.some(
        (candidate) => candidate.ref.sourceId === instanceId
      )
    ).toBe(false);
    expect(planning.filterRuleIds).not.toContain('reuse.save_single_used');
  });

  it('applies per-save fact states without turning source-only constraints into truth', () => {
    const state = bindEvent();
    const projectedState: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        eventInstances: state.customContent!.eventInstances.map((instance) => ({
          ...instance,
          factStateOverrides: {
            'fact-established': 'invalidated_in_save',
            'fact-source-only': 'established_in_save'
          }
        }))
      }
    };
    const context = selectContext(projectedState, '继续值班');
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.providerId === 'custom-event-group'
    );
    const payload = source
      ? getProjectedDramaPayload(context, source.ref)
      : undefined;

    expect(payload?.confirmedFacts).toContain(
      '原作中幕后人物随后主动现身。'
    );
    expect(payload?.confirmedFacts).not.toContain(
      '玩家已经取得异常封条。'
    );
    expect(payload?.forbiddenAdaptations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('原作中的旧地点已经被本局事实否定')
      ])
    );
    expect(
      payload?.forbiddenAdaptations.some((item) =>
        item.includes('原作要求必须在码头完成交易')
      )
    ).toBe(false);
  });

  it('does not list a candidate whose provider-only material is missing', () => {
    const context = selectContext(bindCharacter(), '继续值班');
    context.customContentProjection.executionMaterials.characters = {};

    expect(
      listProjectedDramaSources(context).some(
        (candidate) => candidate.ref.providerId === 'custom-character'
      )
    ).toBe(false);
  });
});
