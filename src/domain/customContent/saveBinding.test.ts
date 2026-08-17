import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbSaveRepository } from '../persistence/IndexedDbSaveRepository';
import type { RuntimeSaveRecord } from '../persistence/SaveRepository';
import { createInitialRuntimeState } from '../runtime/initialState';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomEventGroupAsset,
  CustomEventGroupRevision
} from './assetTypes';
import {
  adaptCustomEventCharactersInState,
  approveCustomContentAdaptationInState,
  bindCustomCharacterRevisionToState,
  bindCustomEventProjectRevisionToState,
  bindCustomEventGroupToSave,
  createEmptyRuntimeCustomContentState,
  setCustomContentBindingPausedInState,
  setCustomContentPriorityInState
} from './saveBinding';
import {
  createNativeCustomSaveAdaptationBundle
} from './saveAdaptation';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

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

function makeCharacter(
  id = 'character-lin',
  revision = 1
): CustomCharacterRevision {
  return {
    characterAssetId: id,
    revision,
    checksum: `checksum-${id}-${revision}`,
    displayName: id,
    aliases: [],
    gender: 'female',
    profileSummary: '法证人员。',
    backgroundSummary: '熟悉证物流程。',
    corePersonality: ['冷静'],
    values: ['真相'],
    coreMotivations: ['保护证据'],
    majorRelationships: [],
    entryMode: 'follow_project',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [deployment],
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function makeProject(): CustomContentProjectRevision {
  return {
    projectId: 'project-evidence',
    revision: 1,
    checksum: 'checksum-project',
    title: '夜班证物疑云',
    summary: '封条异常。',
    conversionMode: 'structural_adaptation',
    characterAssetIds: ['character-lin'],
    eventGroupIds: ['event-seal'],
    deployments: [deployment],
    sourceDocumentIds: [],
    lifecycle: approvedLifecycle
  };
}

function makeEvent(
  characterRevision: CustomCharacterRevision
): CustomEventGroupRevision {
  return {
    eventGroupId: 'event-seal',
    projectId: 'project-evidence',
    revision: 1,
    checksum: 'checksum-event',
    title: '封条异常',
    summary: '证物编号异常。',
    invariantCore: ['编号不一致'],
    mutableSlots: [],
    forbiddenAdaptations: [],
    characterRefs: [createCustomContentRevisionRef(characterRevision)],
    roleSlots: [
      {
        roleSlotId: 'witness',
        title: '证物见证人',
        summary: '说明流程。',
        bindingMode: 'fixed_character',
        fixedCharacterRef: createCustomContentRevisionRef(characterRevision),
        requirements: []
      }
    ],
    stages: [],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function saveRecord(saveId: string): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  return {
    saveId,
    saveName: '测试存档',
    saveKind: 'manual',
    createdAt: '2026-07-26T03:00:00.000Z',
    updatedAt: '2026-07-26T03:00:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988年',
    turnCounter: 0,
    runtimeState
  };
}

function dependency(
  owner: ReturnType<typeof createCustomContentRevisionRef>,
  target: ReturnType<typeof createCustomContentRevisionRef>
): CustomContentDependency {
  return {
    dependencyId: `dependency:${customContentRevisionRefKey(owner)}:${customContentRevisionRefKey(target)}`,
    owner,
    target,
    kind: 'required'
  };
}

const dbNames: string[] = [];

afterEach(async () => {
  await Promise.all(
    dbNames.splice(0).map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        })
    )
  );
});

describe('custom content save binding', () => {
  it('resolves a current-player role slot to the stable player actor id', () => {
    const state = createInitialRuntimeState();
    const character = makeCharacter();
    const project = makeProject();
    const eventGroup: CustomEventGroupRevision = {
      ...makeEvent(character),
      roleSlots: [
        ...makeEvent(character).roleSlots,
        {
          roleSlotId: 'protagonist',
          title: '本局主角',
          summary: '始终指向当前存档玩家。',
          bindingMode: 'current_player',
          requirements: []
        }
      ]
    };
    const bound = bindCustomEventProjectRevisionToState({
      state,
      project,
      characters: [character],
      eventGroup,
      adaptationBundle: createNativeCustomSaveAdaptationBundle({
        state,
        descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
        source: { project, characters: [character], eventGroup }
      }),
      now: '2026-08-01T00:00:00.000Z'
    });

    expect(bound.customContent?.eventInstances[0].roleBindings).toMatchObject({
      witness: 'custom-actor:character-lin',
      protagonist: state.player.actorId
    });
  });

  it('freezes all event character revisions but adapts only the current stage and lazily reuses stable actor ids', async () => {
    const state = createInitialRuntimeState();
    const first = makeCharacter('character-first');
    const later = makeCharacter('character-later');
    const project = {
      ...makeProject(),
      characterAssetIds: [
        first.characterAssetId,
        later.characterAssetId
      ]
    };
    const firstRef = createCustomContentRevisionRef(first);
    const laterRef = createCustomContentRevisionRef(later);
    const eventGroup: CustomEventGroupRevision = {
      ...makeEvent(first),
      characterRefs: [firstRef, laterRef],
      roleSlots: [],
      stages: [
        {
          stageId: 'stage-first',
          title: '第一阶段',
          summary: '先由第一名人物出现。',
          establishedSourceFacts: [],
          continuationSourceFacts: [],
          hardSourceConstraints: [],
          foreshadowingOptions: [],
          eventNodes: [
            {
              nodeId: 'node-first',
              title: '第一人物',
              summary: '引用第一名人物。',
              prerequisites: [],
              entryConditions: [],
              blockers: [],
              characterUsages: [
                {
                  usageId: 'usage-first',
                  characterRef: firstRef,
                  usageSummary: '当前阶段人物',
                  required: true
                }
              ],
              knowledgeBoundary: {
                knownBy: [],
                hiddenFrom: [],
                readerOnly: false
              },
              possibleOutcomes: ['继续'],
              downstreamEffects: []
            }
          ],
          completionHints: [],
          nextStageHints: []
        },
        {
          stageId: 'stage-later',
          title: '后续阶段',
          summary: '后续才引用第二名人物。',
          establishedSourceFacts: [],
          continuationSourceFacts: [],
          hardSourceConstraints: [],
          foreshadowingOptions: [],
          eventNodes: [
            {
              nodeId: 'node-later',
              title: '第二人物',
              summary: '引用后续人物。',
              prerequisites: [],
              entryConditions: [],
              blockers: [],
              characterUsages: [
                {
                  usageId: 'usage-later',
                  characterRef: laterRef,
                  usageSummary: '后续阶段人物',
                  required: true
                }
              ],
              knowledgeBoundary: {
                knownBy: [],
                hiddenFrom: [],
                readerOnly: false
              },
              possibleOutcomes: ['继续'],
              downstreamEffects: []
            }
          ],
          completionHints: [],
          nextStageHints: []
        }
      ]
    };
    const initialBundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: {
        project,
        characters: [first],
        eventGroup
      }
    });
    const bound = bindCustomEventProjectRevisionToState({
      state,
      project,
      characters: [first, later],
      eventGroup,
      adaptationBundle: initialBundle,
      now: '2026-07-28T00:00:00.000Z'
    });

    expect(bound.customContent?.characterBindings).toHaveLength(2);
    expect(
      Object.values(bound.customContent!.characterAdaptations)
    ).toHaveLength(1);
    expect(bound.customContent?.eventInstances[0]).toMatchObject({
      currentStageId: 'stage-first',
      projectCharacterBindings: {
        'character-first': 'custom-actor:character-first'
      }
    });
    expect(bound.customContent?.characterAdaptationIntents).toEqual([
      expect.objectContaining({
        bindingId: expect.stringContaining('character-first'),
        reason: 'current_stage',
        status: 'ready',
        requestedStageId: 'stage-first'
      })
    ]);

    const adapted = await adaptCustomEventCharactersInState({
      state: bound,
      eventGroupId: eventGroup.eventGroupId,
      characterAssetIds: [later.characterAssetId],
      now: '2026-07-28T00:01:00.000Z'
    });
    expect(
      Object.values(adapted.customContent!.characterAdaptations)
    ).toHaveLength(2);
    expect(
      adapted.customContent?.eventInstances[0].projectCharacterBindings
    ).toMatchObject({
      'character-first': 'custom-actor:character-first',
      'character-later': 'custom-actor:character-later'
    });
    expect(
      adapted.customContent?.characterAdaptationIntents.find((intent) =>
        intent.bindingId.includes('character-later')
      )
    ).toMatchObject({
      reason: 'manual',
      status: 'ready',
      adaptationId: expect.stringContaining('character-later')
    });
    expect(adapted.actors).toBe(state.actors);

    await expect(
      adaptCustomEventCharactersInState({
        state: {
          ...bound,
          world: {
            ...bound.world,
            worldpackId: 'another_worldpack'
          }
        },
        eventGroupId: eventGroup.eventGroupId,
        characterAssetIds: [later.characterAssetId]
      })
    ).rejects.toThrow('显式项目迁移');
  });

  it('copies an immutable character snapshot and creates an ASAP priority intent', () => {
    const state = createInitialRuntimeState();
    const source = makeCharacter();
    const bundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: { characters: [source] }
    });

    const next = bindCustomCharacterRevisionToState({
      state,
      character: source,
      adaptationBundle: bundle,
      now: '2026-07-26T03:00:00.000Z'
    });

    expect(next.customContent?.characterBindings).toHaveLength(1);
    expect(next.customContent?.characterBindings[0].payload).not.toBe(source);
    expect(next.customContent?.characterEntryIntents[0]).toMatchObject({
      mode: 'asap_contact',
      status: 'queued',
      priorityOrder: 1
    });
    expect(next.customContent?.priorityItems).toHaveLength(1);
    expect(next.actors).toBe(state.actors);
    expect(next.dynamicEvents).toBe(state.dynamicEvents);
  });

  it('keeps ordinary save binding strict when the same character is bound twice', () => {
    const state = createInitialRuntimeState();
    const source = makeCharacter();
    const bundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: { characters: [source] }
    });
    const bound = bindCustomCharacterRevisionToState({
      state,
      character: source,
      adaptationBundle: bundle,
      now: '2026-07-30T03:00:00.000Z'
    });

    expect(() =>
      bindCustomCharacterRevisionToState({
        state: bound,
        character: source,
        adaptationBundle: bundle,
        now: '2026-07-30T03:01:00.000Z'
      })
    ).toThrow('该人物已经绑定到当前存档');
  });

  it('requires review before activating AI-adapted bindings', () => {
    const state = createInitialRuntimeState();
    const source = makeCharacter();
    const bundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: { characters: [source] }
    });
    bundle.characters[0].status = 'needs_review';

    const bound = bindCustomCharacterRevisionToState({
      state,
      character: source,
      adaptationBundle: bundle,
      now: '2026-07-26T03:00:00.000Z'
    });
    expect(bound.customContent?.priorityItems).toHaveLength(0);
    expect(bound.customContent?.characterEntryIntents[0].status).toBe('paused');

    const approved = approveCustomContentAdaptationInState({
      state: bound,
      kind: 'character',
      assetId: source.characterAssetId,
      now: '2026-07-26T03:05:00.000Z'
    });
    expect(
      Object.values(approved.customContent!.characterAdaptations)[0].status
    ).toBe('ready');
    expect(approved.customContent?.priorityItems).toHaveLength(0);
    expect(approved.customContent?.characterEntryIntents[0].status).toBe(
      'queued'
    );
  });

  it('allows adaptation approval when all three priority slots are occupied', () => {
    const state = createInitialRuntimeState();
    const source = makeCharacter('character-review-no-priority');
    const bundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: { characters: [source] }
    });
    bundle.characters[0].status = 'needs_review';
    const bound = bindCustomCharacterRevisionToState({
      state,
      character: source,
      adaptationBundle: bundle,
      now: '2026-07-26T03:00:00.000Z'
    });
    const fullPriorityState = {
      ...bound,
      customContent: {
        ...bound.customContent!,
        priorityItems: ['one', 'two', 'three'].map((id) => ({
          priorityItemId: `priority:${id}`,
          targetKind: 'character' as const,
          targetId: `binding:${id}`,
          status: 'active' as const,
          createdAt: '2026-07-26T03:00:00.000Z',
          updatedAt: '2026-07-26T03:00:00.000Z'
        }))
      }
    };

    const approved = approveCustomContentAdaptationInState({
      state: fullPriorityState,
      kind: 'character',
      assetId: source.characterAssetId,
      now: '2026-07-26T03:05:00.000Z'
    });

    expect(
      Object.values(approved.customContent!.characterAdaptations)[0].status
    ).toBe('ready');
    expect(approved.customContent?.priorityItems).toHaveLength(3);
    expect(
      approved.customContent?.priorityItems.some(
        (item) =>
          item.targetId ===
          approved.customContent?.characterBindings[0].bindingId
      )
    ).toBe(false);
  });

  it('enforces the three-item save priority limit', () => {
    let state = createInitialRuntimeState();
    for (const id of ['one', 'two', 'three']) {
      const source = makeCharacter(`character-${id}`);
      state = bindCustomCharacterRevisionToState({
        state,
        character: source,
        adaptationBundle: createNativeCustomSaveAdaptationBundle({
          state,
          descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
          source: { characters: [source] }
        }),
        now: '2026-07-26T03:00:00.000Z'
      });
    }
    const fourth = makeCharacter('character-four');
    expect(() =>
      bindCustomCharacterRevisionToState({
        state,
        character: fourth,
        adaptationBundle: createNativeCustomSaveAdaptationBundle({
          state,
          descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
          source: { characters: [fourth] }
        }),
        now: '2026-07-26T03:00:00.000Z'
      })
    ).toThrow('最多只能有 3 项');
  });

  it('atomically binds the exact project dependency closure to a real save', async () => {
    const contentDb = `content-${crypto.randomUUID()}`;
    const saveDb = `saves-${crypto.randomUUID()}`;
    dbNames.push(contentDb, saveDb);
    const contentRepository = new IndexedDbCustomContentRepository(contentDb);
    const saveRepository = new IndexedDbSaveRepository(saveDb);
    const character = makeCharacter();
    const unrelatedCharacter = makeCharacter('character-unrelated');
    const project = {
      ...makeProject(),
      characterAssetIds: [
        character.characterAssetId,
        unrelatedCharacter.characterAssetId
      ]
    };
    const event = makeEvent(character);
    const characterAsset: CustomCharacterAsset = {
      characterAssetId: character.characterAssetId,
      latestRevision: 1,
      revisionCount: 1,
      global: false,
      projectIds: [project.projectId],
      createdAt: '2026-07-26T03:00:00.000Z',
      updatedAt: '2026-07-26T03:00:00.000Z'
    };
    const unrelatedCharacterAsset: CustomCharacterAsset = {
      ...characterAsset,
      characterAssetId: unrelatedCharacter.characterAssetId
    };
    const projectAsset: CustomContentProjectAsset = {
      projectId: project.projectId,
      latestRevision: 1,
      revisionCount: 1,
      createdAt: '2026-07-26T03:00:00.000Z',
      updatedAt: '2026-07-26T03:00:00.000Z'
    };
    const eventAsset: CustomEventGroupAsset = {
      eventGroupId: event.eventGroupId,
      projectId: project.projectId,
      latestRevision: 1,
      revisionCount: 1,
      createdAt: '2026-07-26T03:00:00.000Z',
      updatedAt: '2026-07-26T03:00:00.000Z'
    };
    const projectRef = createCustomContentRevisionRef(project);
    await contentRepository.saveRevisionBundles([
      {
        assetKind: 'content_project',
        asset: projectAsset,
        revision: project,
          dependencies: [
            dependency(projectRef, createCustomContentRevisionRef(character)),
            dependency(
              projectRef,
              createCustomContentRevisionRef(unrelatedCharacter)
            ),
            dependency(projectRef, createCustomContentRevisionRef(event))
        ]
      },
      {
        assetKind: 'character',
        asset: characterAsset,
        revision: character
      },
      {
        assetKind: 'character',
        asset: unrelatedCharacterAsset,
        revision: unrelatedCharacter
      },
      {
        assetKind: 'event_group',
        asset: eventAsset,
        revision: event,
        dependencies: [
          dependency(
            createCustomContentRevisionRef(event),
            createCustomContentRevisionRef(character)
          )
        ]
      }
    ]);
    await saveRepository.save(saveRecord('save-phase6'));

    const updated = await bindCustomEventGroupToSave({
      contentRepository,
      saveRepository,
      saveId: 'save-phase6',
      eventGroupId: event.eventGroupId,
      now: '2026-07-26T03:10:00.000Z'
    });

    expect(updated.runtimeState.customContent).toMatchObject({
      schemaVersion: 1
    });
    expect(updated.runtimeState.customContent?.projectBindings).toHaveLength(1);
    expect(updated.runtimeState.customContent?.characterBindings).toHaveLength(
      1
    );
    expect(
      updated.runtimeState.customContent?.characterBindings[0].assetId
    ).toBe(character.characterAssetId);
    expect(updated.runtimeState.customContent?.eventGroupBindings).toHaveLength(
      1
    );
    expect(updated.runtimeState.customContent?.eventInstances[0]).toMatchObject({
      status: 'latent',
      roleBindings: {
        witness: 'custom-actor:character-lin'
      }
    });
    expect(updated.runtimeState.customContent?.priorityItems).toHaveLength(1);
    expect(updated.runtimeState.actors).toEqual(
      saveRecord('unused').runtimeState.actors
    );
    expect(
      (await saveRepository.load('save-phase6'))?.runtimeState.customContent
        ?.eventGroupBindings
    ).toHaveLength(1);
  });

  it('pauses, resumes and removes priority without deleting the binding', () => {
    const state = createInitialRuntimeState();
    const source = makeCharacter();
    const bound = bindCustomCharacterRevisionToState({
      state,
      character: source,
      adaptationBundle: createNativeCustomSaveAdaptationBundle({
        state,
        descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
        source: { characters: [source] }
      }),
      now: '2026-07-26T03:00:00.000Z'
    });
    const paused = setCustomContentBindingPausedInState({
      state: {
        ...bound,
        customContent: {
          ...bound.customContent!,
          characterEntryIntents:
            bound.customContent!.characterEntryIntents.map((intent) => ({
              ...intent,
              status: 'known_of'
            }))
        }
      },
      kind: 'character',
      assetId: source.characterAssetId,
      paused: true,
      now: '2026-07-26T03:01:00.000Z'
    });
    expect(paused.customContent?.characterEntryIntents[0].status).toBe(
      'paused'
    );
    expect(
      paused.customContent?.characterEntryIntents[0].statusBeforePause
    ).toBe('known_of');
    expect(paused.customContent?.priorityItems[0].status).toBe('paused');

    const resumed = setCustomContentBindingPausedInState({
      state: paused,
      kind: 'character',
      assetId: source.characterAssetId,
      paused: false,
      now: '2026-07-26T03:02:00.000Z'
    });
    const natural = setCustomContentPriorityInState({
      state: resumed,
      kind: 'character',
      assetId: source.characterAssetId,
      prioritized: false,
      now: '2026-07-26T03:03:00.000Z'
    });
    expect(natural.customContent?.characterBindings).toHaveLength(1);
    expect(resumed.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'known_of',
      statusBeforePause: undefined
    });
    expect(natural.customContent?.characterEntryIntents[0].mode).toBe(
      'natural'
    );
    expect(natural.customContent?.priorityItems).toHaveLength(0);
  });

  it('restores an active event to its pre-pause stage and activity state', () => {
    const state = createInitialRuntimeState();
    const character = makeCharacter();
    const project = makeProject();
    const eventGroup = makeEvent(character);
    const bound = bindCustomEventProjectRevisionToState({
      state,
      project,
      characters: [character],
      eventGroup,
      adaptationBundle: createNativeCustomSaveAdaptationBundle({
        state,
        descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
        source: { project, characters: [character], eventGroup }
      }),
      now: '2026-07-26T03:00:00.000Z'
    });
    const active = {
      ...bound,
      customContent: {
        ...bound.customContent!,
        eventEntryIntents: bound.customContent!.eventEntryIntents.map(
          (intent) => ({ ...intent, status: 'engaged' as const })
        ),
        eventInstances: bound.customContent!.eventInstances.map((instance) => ({
          ...instance,
          status: 'active' as const,
          currentStageId: 'stage-active',
          usedNodeIds: ['node-ledger']
        }))
      }
    };
    const paused = setCustomContentBindingPausedInState({
      state: active,
      kind: 'event_group',
      assetId: eventGroup.eventGroupId,
      paused: true,
      now: '2026-07-26T03:01:00.000Z'
    });
    const resumed = setCustomContentBindingPausedInState({
      state: paused,
      kind: 'event_group',
      assetId: eventGroup.eventGroupId,
      paused: false,
      now: '2026-07-26T03:02:00.000Z'
    });

    expect(resumed.customContent?.eventEntryIntents[0]).toMatchObject({
      status: 'engaged',
      statusBeforePause: undefined
    });
    expect(resumed.customContent?.eventInstances[0]).toMatchObject({
      status: 'active',
      currentStageId: 'stage-active',
      usedNodeIds: ['node-ledger'],
      statusBeforePause: undefined
    });
  });

  it('creates an empty optional state without affecting old saves', () => {
    expect(createEmptyRuntimeCustomContentState()).toEqual({
      schemaVersion: 1,
      projectBindings: [],
      characterBindings: [],
      eventGroupBindings: [],
      projectAdaptations: {},
      characterAdaptations: {},
      characterAdaptationIntents: [],
      eventGroupAdaptations: {},
      characterEntryIntents: [],
      eventEntryIntents: [],
      characterRuntimeBindings: [],
      eventInstances: [],
      priorityItems: [],
      recentDiagnostics: []
    });
    expect(createInitialRuntimeState().customContent).toBeUndefined();
  });
});
