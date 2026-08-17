import { describe, expect, it } from 'vitest';
import type { DramaExecutionTrace, DramaPlan, DramaSourceRef } from '../drama/types';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CurrentMatter, RuntimeState, Signal } from '../runtime/types';
import type {
  CustomCharacterRevision,
  CustomEventGroupRevision
} from './assetTypes';
import {
  createEmptyRuntimeCustomContentState
} from './saveBinding';
import type {
  CustomEventGroupInstance,
  RuntimeCustomContentState
} from './saveTypes';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';
import { applyCustomContentDramaExecution } from './dramaExecution';

const characterBindingId = 'binding:character:forensic:1';
const characterAssetId = 'character-forensic';
const runtimeActorId = 'custom_actor_character-forensic';
const eventInstanceId = 'event-instance:seal';

const characterRef: DramaSourceRef = {
  providerId: 'custom-character',
  sourceType: 'custom_character_binding',
  sourceId: characterBindingId
};

const eventRef: DramaSourceRef = {
  providerId: 'custom-event-group',
  sourceType: 'custom_event_group_instance',
  sourceId: eventInstanceId
};

const characterRevision: CustomCharacterRevision = {
  characterAssetId,
  revision: 1,
  checksum: 'checksum-character-forensic',
  displayName: '林静仪',
  aliases: [],
  gender: 'female',
  profileSummary: '熟悉证物流程的法证人员。',
  backgroundSummary: '长期处理警署送检证物。',
  corePersonality: ['冷静'],
  values: ['证据'],
  coreMotivations: ['保护证据链'],
  majorRelationships: [],
  entryMode: 'asap_contact',
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

const eventRevision: CustomEventGroupRevision = {
  eventGroupId: 'event-seal',
  projectId: 'project-seal',
  revision: 1,
  checksum: 'checksum-event-seal',
  title: '封条异常',
  summary: '证物编号与登记簿不一致。',
  invariantCore: ['封条编号不一致'],
  mutableSlots: ['发现地点'],
  forbiddenAdaptations: [],
  characterRefs: [],
  roleSlots: [],
  stages: [
    {
      stageId: 'stage-discovery',
      title: '发现异常',
      summary: '核对封条与登记簿。',
      establishedSourceFacts: [],
      continuationSourceFacts: [
        {
          factId: 'fact-ledger-tampered',
          summary: '登记簿可能被改动。',
          state: 'source_only',
          sourceSpans: []
        }
      ],
      hardSourceConstraints: [],
      foreshadowingOptions: [],
      eventNodes: [
        {
          nodeId: 'node-check-ledger',
          title: '复核登记簿',
          summary: '逐项核对登记记录。',
          prerequisites: [],
          entryConditions: [],
          blockers: [],
          characterUsages: [],
          knowledgeBoundary: {
            knownBy: [],
            hiddenFrom: [],
            readerOnly: false
          },
          possibleOutcomes: [],
          downstreamEffects: []
        }
      ],
      completionHints: ['完成初步核对'],
      nextStageHints: ['追查登记人']
    },
    {
      stageId: 'stage-investigation',
      title: '追查来源',
      summary: '寻找登记簿被改动的原因。',
      establishedSourceFacts: [],
      continuationSourceFacts: [],
      hardSourceConstraints: [],
      foreshadowingOptions: [],
      eventNodes: [],
      completionHints: ['查清来源'],
      nextStageHints: []
    }
  ],
  entryMode: 'asap',
  reusePolicy: 'save_single_use',
  inheritProjectDeployments: true,
  sourceSpans: [],
  lifecycle: {
    generationStatus: 'ready',
    reviewStatus: 'approved',
    availabilityStatus: 'enabled'
  }
};

function planFor(ref: DramaSourceRef): DramaPlan {
  return {
    planId: 'drama_plan_turn_3',
    planningScope: 'turn',
    mode: 'surface',
    primarySource: ref,
    supportSources: [],
    sceneFunction: 'information',
    intensity: 'low',
    playerMayIgnore: true,
    maxNewActors: 1,
    reasonSummary: '测试自定义内容执行确认'
  };
}

function traceFor(
  ref: DramaSourceRef,
  status: DramaExecutionTrace['status'],
  resultingWritebackRefs: DramaExecutionTrace['resultingWritebackRefs'] = []
): DramaExecutionTrace {
  return {
    planId: 'drama_plan_turn_3',
    status,
    usedSourceRefs: status === 'not_used' ? [] : [ref],
    resultingWritebackRefs
  };
}

function characterCustomContent(): RuntimeCustomContentState {
  const customContent = createEmptyRuntimeCustomContentState();
  return {
    ...customContent,
    characterBindings: [
      {
        bindingId: characterBindingId,
        assetKind: 'character',
        assetId: characterAssetId,
        revision: 1,
        checksum: characterRevision.checksum,
        payload: characterRevision
      }
    ],
    characterAdaptations: {
      'adaptation:character-forensic': {
        adaptationId: 'adaptation:character-forensic',
        characterAssetId,
        sourceRevision: 1,
        worldpackId: 'hk_1988',
        anchorTime: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        runtimeActorId,
        adaptedPublicIdentity: '法证科职员',
        adaptedOccupation: '法证人员',
        adaptedSocialPosition: '警务协作人员',
        adaptedOrganizationRefs: [],
        adaptedPlaceRefs: [],
        adaptedBackgroundSummary: '负责警署证物检验。',
        adaptedContactRoutes: ['通过证物复核工作联系'],
        status: 'ready'
      }
    },
    characterEntryIntents: [
      {
        intentId: 'intent:character:forensic',
        bindingId: characterBindingId,
        mode: 'asap_contact',
        status: 'queued',
        targetOutcome: 'met',
        priorityOrder: 1
      }
    ],
    priorityItems: [
      {
        priorityItemId: 'priority:character:forensic',
        targetKind: 'character',
        targetId: characterBindingId,
        status: 'active',
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z'
      }
    ]
  };
}

function eventInstance(
  status: CustomEventGroupInstance['status'] = 'latent'
): CustomEventGroupInstance {
  return {
    instanceId: eventInstanceId,
    eventGroupId: 'event-seal',
    eventGroupRevision: 1,
    projectId: 'project-seal',
    projectRevision: 1,
    adaptationId: 'adaptation:event-seal',
    status,
    projectCharacterBindings: {},
    roleBindings: {},
    usedStageIds: [],
    usedNodeIds: [],
    resultingWritebackRefs: []
  };
}

function eventCustomContent({
  intentStatus = 'queued',
  instanceStatus = 'latent'
}: {
  intentStatus?: 'queued' | 'seeking_anchor' | 'anchored' | 'engaged';
  instanceStatus?: CustomEventGroupInstance['status'];
} = {}): RuntimeCustomContentState {
  const customContent = createEmptyRuntimeCustomContentState();
  return {
    ...customContent,
    eventEntryIntents: [
      {
        intentId: 'intent:event:seal',
        instanceId: eventInstanceId,
        mode: 'asap',
        status: intentStatus,
        priorityOrder: 1
      }
    ],
    eventGroupBindings: [
      {
        bindingId: 'binding:event:seal:1',
        assetKind: 'event_group',
        assetId: eventRevision.eventGroupId,
        revision: eventRevision.revision,
        checksum: eventRevision.checksum,
        payload: eventRevision
      }
    ],
    eventInstances: [eventInstance(instanceStatus)],
    priorityItems: [
      {
        priorityItemId: 'priority:event:seal',
        targetKind: 'event_group',
        targetId: eventInstanceId,
        projectId: 'project-seal',
        status: 'active',
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: '2026-07-26T12:00:00.000Z'
      }
    ]
  };
}

function stateWithCustomContent(
  customContent: RuntimeCustomContentState
): RuntimeState {
  return {
    ...createInitialRuntimeState(),
    turnCounter: 3,
    customContent
  };
}

function afterTurn(before: RuntimeState): RuntimeState {
  return {
    ...before,
    turnCounter: 4
  };
}

function customActor(state: RuntimeState, presence: Actor['presence']): Actor {
  const playerActor = state.actors[state.player.actorId];
  return {
    ...playerActor,
    actorId: runtimeActorId,
    name: '林静仪',
    aliases: [],
    currentIdentity: 'civilian',
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
    presence,
    visibility: 'player_known',
    keyMemories: []
  };
}

function currentMatter(
  state: RuntimeState,
  id = 'matter_custom_seal'
): CurrentMatter {
  return {
    id,
    title: '证物封条复核',
    summary: '需要与法证人员核对封条。',
    status: 'active',
    priority: 70,
    visibility: 'known',
    source: 'custom-event',
    relatedActorIds: [runtimeActorId],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: { ...state.time },
    updatedAt: { ...state.time }
  };
}

function signal(state: RuntimeState): Signal {
  return {
    id: 'signal_custom_seal',
    title: '封条编号异常',
    summary: '登记簿上的编号与实物不符。',
    signalType: 'police',
    reliability: 'high',
    status: 'active',
    visibility: 'known',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: { ...state.time },
    updatedAt: { ...state.time }
  };
}

describe('custom-content drama execution confirmation', () => {
  it('records only lastPlannedTurn when the execution trace is missing', () => {
    const before = stateWithCustomContent(characterCustomContent());
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: afterTurn(before),
      plan: planFor(characterRef)
    });

    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'queued',
      lastPlannedTurn: 4,
      priorityOrder: 1
    });
    expect(
      next.customContent?.characterEntryIntents[0].lastConfirmedExposureTurn
    ).toBeUndefined();
    expect(next.customContent?.priorityItems[0].status).toBe('active');
  });

  it('treats validated texture use as known_of without inventing an Actor binding', () => {
    const before = stateWithCustomContent(characterCustomContent());
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: afterTurn(before),
      plan: planFor(characterRef),
      trace: traceFor(characterRef, 'used_as_texture')
    });

    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'known_of',
      lastPlannedTurn: 4,
      lastConfirmedExposureTurn: 4
    });
    expect(next.customContent?.characterRuntimeBindings).toEqual([]);
    expect(next.customContent?.priorityItems[0].status).toBe('active');
  });

  it('marks a structurally confirmed same-place Actor encounter as met and completes the priority', () => {
    const before = stateWithCustomContent(characterCustomContent());
    const after: RuntimeState = {
      ...afterTurn(before),
      actors: {
        ...before.actors,
        [runtimeActorId]: customActor(before, 'present')
      }
    };
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(characterRef),
      trace: traceFor(characterRef, 'used_persistently', [
        { kind: 'actor', id: runtimeActorId }
      ])
    });

    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'met',
      lastConfirmedExposureTurn: 4
    });
    expect(next.customContent?.characterRuntimeBindings).toEqual([
      {
        characterAssetId,
        sourceRevision: 1,
        adaptationId: 'adaptation:character-forensic',
        actorId: runtimeActorId
      }
    ]);
    expect(next.customContent?.priorityItems[0].status).toBe('completed');
    expect(
      next.customContent?.characterEntryIntents[0].priorityOrder
    ).toBeUndefined();
  });

  it('uses a durable actor-linked matter as a contact path without claiming a meeting', () => {
    const seeded = stateWithCustomContent(characterCustomContent());
    const before: RuntimeState = {
      ...seeded,
      actors: {
        ...seeded.actors,
        [runtimeActorId]: customActor(seeded, 'mentioned')
      },
      customContent: {
        ...seeded.customContent!,
        characterEntryIntents: seeded.customContent!.characterEntryIntents.map(
          (intent) => ({ ...intent, targetOutcome: 'contactable' })
        )
      }
    };
    const matter = currentMatter(before);
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(characterRef),
      trace: traceFor(characterRef, 'used_persistently', [
        { kind: 'current_matter', id: matter.id }
      ])
    });

    expect(next.customContent?.characterEntryIntents[0].status).toBe(
      'contactable'
    );
    expect(next.customContent?.priorityItems[0].status).toBe('completed');
  });

  it('anchors an event only from a validated writeback that exists after application', () => {
    const before = stateWithCustomContent(eventCustomContent());
    const writtenSignal = signal(before);
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        signals: {
          ...before.dynamicEvents.signals,
          [writtenSignal.id]: writtenSignal
        }
      }
    };
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(eventRef),
      trace: traceFor(eventRef, 'used_persistently', [
        { kind: 'signal', id: writtenSignal.id }
      ])
    });

    expect(next.customContent?.eventEntryIntents[0]).toMatchObject({
      status: 'anchored',
      lastPlannedTurn: 4,
      lastConfirmedExposureTurn: 4
    });
    expect(next.customContent?.eventInstances[0]).toMatchObject({
      status: 'anchored',
      resultingWritebackRefs: [{ kind: 'signal', id: writtenSignal.id }],
      primaryRuntimeArcRef: { kind: 'signal', id: writtenSignal.id }
    });
    expect(next.customContent?.priorityItems[0].status).toBe('completed');
  });

  it('does not anchor an event when the claimed persistent writeback was not applied', () => {
    const before = stateWithCustomContent(eventCustomContent());
    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: afterTurn(before),
      plan: planFor(eventRef),
      trace: traceFor(eventRef, 'used_persistently', [
        { kind: 'signal', id: 'signal_missing_after_writeback' }
      ])
    });

    expect(next.customContent?.eventEntryIntents[0]).toMatchObject({
      status: 'seeking_anchor',
      lastConfirmedExposureTurn: 4
    });
    expect(next.customContent?.eventInstances[0]).toMatchObject({
      status: 'seeking_anchor',
      resultingWritebackRefs: []
    });
    expect(next.customContent?.priorityItems[0].status).toBe('active');
  });

  it('promotes a persistent CurrentMatter to engaged/active and never regresses existing runtime truth', () => {
    const before = stateWithCustomContent(eventCustomContent());
    const matter = currentMatter(before, 'matter_event_active');
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };
    const engaged = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(eventRef),
      trace: traceFor(eventRef, 'used_persistently', [
        { kind: 'current_matter', id: matter.id }
      ])
    });

    expect(engaged.customContent?.eventEntryIntents[0].status).toBe('engaged');
    expect(engaged.customContent?.eventInstances[0]).toMatchObject({
      status: 'active',
      primaryRuntimeArcRef: { kind: 'current_matter', id: matter.id }
    });

    const continued = applyCustomContentDramaExecution({
      stateBeforeWriteback: engaged,
      stateAfterWriteback: {
        ...engaged,
        turnCounter: 5
      },
      plan: {
        ...planFor(eventRef),
        planId: 'drama_plan_turn_4'
      },
      trace: {
        ...traceFor(eventRef, 'used_as_texture'),
        planId: 'drama_plan_turn_4'
      }
    });
    expect(continued.customContent?.eventEntryIntents[0].status).toBe('engaged');
    expect(continued.customContent?.eventInstances[0].status).toBe('active');
  });

  it('advances only the current stage from an attributed persistent writeback', () => {
    const before = stateWithCustomContent(eventCustomContent());
    const matter = currentMatter(before, 'matter_event_progress');
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };
    const trace = {
      ...traceFor(eventRef, 'used_persistently', [
        { kind: 'current_matter', id: matter.id }
      ]),
      customEventProgress: [
        {
          instanceId: eventInstanceId,
          stageId: 'stage-discovery',
          usedNodeIds: ['node-check-ledger'],
          decision: 'advance' as const,
          nextStageId: 'stage-investigation',
          supportingWritebackRefs: [
            { kind: 'current_matter', id: matter.id }
          ],
          factStateChanges: [
            {
              factId: 'fact-ledger-tampered',
              state: 'established_in_save' as const,
              supportingWritebackRefs: [
                { kind: 'current_matter', id: matter.id }
              ]
            }
          ]
        }
      ]
    };

    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(eventRef),
      trace
    });

    expect(next.customContent?.eventInstances[0]).toMatchObject({
      status: 'active',
      currentStageId: 'stage-investigation',
      usedStageIds: ['stage-discovery'],
      usedNodeIds: ['node-check-ledger'],
      factStateOverrides: {
        'fact-ledger-tampered': 'established_in_save'
      }
    });
    expect(next.customContent?.eventInstances[0].progressHistory).toEqual([
      expect.objectContaining({
        turnCounter: 4,
        stageId: 'stage-discovery',
        decision: 'advance',
        nextStageId: 'stage-investigation'
      })
    ]);
  });

  it('queues only a newly referenced stage character and reuses an existing stable adaptation', () => {
    const laterCharacter: CustomCharacterRevision = {
      ...characterRevision,
      characterAssetId: 'character-later',
      checksum: 'checksum-character-later',
      displayName: '后续证人'
    };
    const laterRef = {
      assetKind: 'character' as const,
      assetId: laterCharacter.characterAssetId,
      revision: laterCharacter.revision,
      checksum: laterCharacter.checksum
    };
    const eventWithLater: CustomEventGroupRevision = {
      ...eventRevision,
      characterRefs: [laterRef],
      stages: eventRevision.stages.map((stage) =>
        stage.stageId === 'stage-investigation'
          ? {
              ...stage,
              eventNodes: [
                {
                  nodeId: 'node-later-witness',
                  title: '询问后续证人',
                  summary: '后续阶段才引用此人物。',
                  prerequisites: [],
                  entryConditions: [],
                  blockers: [],
                  characterUsages: [
                    {
                      usageId: 'usage-later-witness',
                      characterRef: laterRef,
                      usageSummary: '后续证人',
                      required: true
                    }
                  ],
                  knowledgeBoundary: {
                    knownBy: [],
                    hiddenFrom: [],
                    readerOnly: false
                  },
                  possibleOutcomes: ['取得口供'],
                  downstreamEffects: []
                }
              ]
            }
          : stage
      )
    };
    const base = eventCustomContent();
    const customContent: RuntimeCustomContentState = {
      ...base,
      characterBindings: [
        {
          bindingId: 'binding:character:later:1',
          assetKind: 'character',
          assetId: laterCharacter.characterAssetId,
          revision: laterCharacter.revision,
          checksum: laterCharacter.checksum,
          payload: laterCharacter
        }
      ],
      eventGroupBindings: base.eventGroupBindings.map((binding) => ({
        ...binding,
        payload: eventWithLater
      })),
      eventInstances: base.eventInstances.map((instance) => ({
        ...instance,
        currentStageId: 'stage-investigation',
        usedStageIds: ['stage-discovery']
      }))
    };
    const before = stateWithCustomContent(customContent);
    const pending = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: afterTurn(before)
    });

    expect(pending.customContent?.characterAdaptationIntents).toEqual([
      expect.objectContaining({
        bindingId: 'binding:character:later:1',
        instanceId: eventInstanceId,
        reason: 'current_stage',
        status: 'pending',
        requestedStageId: 'stage-investigation',
        requestedTurn: 4
      })
    ]);
    expect(
      pending.customContent?.eventInstances[0].projectCharacterBindings
    ).toEqual({});

    const withExistingAdaptation: RuntimeState = {
      ...pending,
      customContent: {
        ...pending.customContent!,
        characterAdaptations: {
          ...pending.customContent!.characterAdaptations,
          'adaptation:character-later': {
            adaptationId: 'adaptation:character-later',
            characterAssetId: laterCharacter.characterAssetId,
            sourceRevision: laterCharacter.revision,
            worldpackId: 'hk_1988',
            anchorTime: {
              year: 1988,
              month: 9,
              day: 12,
              hour: 8,
              minute: 0
            },
            runtimeActorId: 'custom-actor:character-later',
            adaptedPublicIdentity: '后续证人',
            adaptedOccupation: '证人',
            adaptedSocialPosition: '市民',
            adaptedOrganizationRefs: [],
            adaptedPlaceRefs: [],
            adaptedBackgroundSummary: '后续阶段人物。',
            adaptedContactRoutes: [],
            status: 'ready'
          }
        }
      }
    };
    const reused = applyCustomContentDramaExecution({
      stateBeforeWriteback: withExistingAdaptation,
      stateAfterWriteback: afterTurn(withExistingAdaptation)
    });
    expect(
      reused.customContent?.eventInstances[0].projectCharacterBindings
    ).toEqual({
      'character-later': 'custom-actor:character-later'
    });
    expect(reused.customContent?.characterAdaptationIntents[0]).toMatchObject({
      status: 'ready',
      adaptationId: 'adaptation:character-later'
    });
  });

  it('keeps valid world writeback but ignores an invalid stage or node transition', () => {
    const before = stateWithCustomContent(eventCustomContent());
    const matter = currentMatter(before, 'matter_event_invalid_progress');
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };

    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: planFor(eventRef),
      trace: {
        ...traceFor(eventRef, 'used_persistently', [
          { kind: 'current_matter', id: matter.id }
        ]),
        customEventProgress: [
          {
            instanceId: eventInstanceId,
            stageId: 'stage-discovery',
            usedNodeIds: ['node-invented'],
            decision: 'complete',
            supportingWritebackRefs: [
              { kind: 'current_matter', id: matter.id }
            ],
            factStateChanges: []
          }
        ]
      }
    });

    expect(next.customContent?.eventInstances[0]).toMatchObject({
      status: 'active',
      usedStageIds: [],
      usedNodeIds: [],
      resultingWritebackRefs: [{ kind: 'current_matter', id: matter.id }]
    });
    expect(
      next.customContent?.eventInstances[0].progressHistory
    ).toBeUndefined();
  });

  it('does not attribute shared turn writeback to an event without a source mapping', () => {
    const eventContent = eventCustomContent();
    const characterContent = characterCustomContent();
    const combined: RuntimeCustomContentState = {
      ...eventContent,
      characterBindings: characterContent.characterBindings,
      characterAdaptations: characterContent.characterAdaptations,
      characterEntryIntents: characterContent.characterEntryIntents,
      priorityItems: [
        ...eventContent.priorityItems,
        ...characterContent.priorityItems
      ]
    };
    const before = stateWithCustomContent(combined);
    const matter = currentMatter(before, 'matter_shared_sources');
    const after: RuntimeState = {
      ...afterTurn(before),
      dynamicEvents: {
        ...before.dynamicEvents,
        currentMatters: {
          ...before.dynamicEvents.currentMatters,
          [matter.id]: matter
        }
      }
    };

    const next = applyCustomContentDramaExecution({
      stateBeforeWriteback: before,
      stateAfterWriteback: after,
      plan: {
        ...planFor(eventRef),
        supportSources: [characterRef]
      },
      trace: {
        planId: 'drama_plan_turn_3',
        status: 'used_persistently',
        usedSourceRefs: [eventRef, characterRef],
        resultingWritebackRefs: [
          { kind: 'current_matter', id: matter.id }
        ]
      }
    });

    expect(next.customContent?.eventInstances[0]).toMatchObject({
      status: 'seeking_anchor',
      resultingWritebackRefs: []
    });
  });
});
