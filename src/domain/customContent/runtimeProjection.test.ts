import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import {
  createCustomContentRevisionRef
} from './assetFoundation';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomEventGroupRevision
} from './assetTypes';
import {
  bindCustomCharacterRevisionToState,
  bindCustomEventProjectRevisionToState,
  setCustomContentBindingPausedInState,
  setCustomContentPriorityInState
} from './saveBinding';
import { createNativeCustomSaveAdaptationBundle } from './saveAdaptation';
import { projectCustomContentContext } from './runtimeProjection';
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
  characterAssetId = 'character-forensic'
): CustomCharacterRevision {
  return {
    characterAssetId,
    revision: 1,
    checksum: `checksum-${characterAssetId}`,
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
    deployments: [deployment],
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function makeProject(
  character: CustomCharacterRevision
): CustomContentProjectRevision {
  return {
    projectId: 'project-seal',
    revision: 1,
    checksum: 'checksum-project-seal',
    title: '夜班证物疑云',
    summary: '一批证物的封条编号出现异常。',
    conversionMode: 'structural_adaptation',
    characterAssetIds: [character.characterAssetId],
    eventGroupIds: ['event-seal'],
    deployments: [deployment],
    sourceDocumentIds: [],
    lifecycle: approvedLifecycle
  };
}

function makeEvent(
  character: CustomCharacterRevision
): CustomEventGroupRevision {
  return {
    eventGroupId: 'event-seal',
    projectId: 'project-seal',
    revision: 1,
    checksum: 'checksum-event-seal',
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
    stages: [],
    entryMode: 'asap',
    reusePolicy: 'save_single_use',
    inheritProjectDeployments: true,
    sourceSpans: [],
    lifecycle: approvedLifecycle
  };
}

function bindCharacter({
  state = createInitialRuntimeState(),
  adaptationStatus = 'ready'
}: {
  state?: RuntimeState;
  adaptationStatus?: 'ready' | 'needs_review';
} = {}): RuntimeState {
  const character = makeCharacter();
  const bundle = createNativeCustomSaveAdaptationBundle({
    state,
    descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
    source: { characters: [character] }
  });
  bundle.characters[0].status = adaptationStatus;
  return bindCustomCharacterRevisionToState({
    state,
    character,
    adaptationBundle: bundle,
    now: '2026-07-26T12:00:00.000Z'
  });
}

function bindEventProject(
  state = createInitialRuntimeState()
): RuntimeState {
  const character = makeCharacter();
  const project = makeProject(character);
  const eventGroup = makeEvent(character);
  const bundle = createNativeCustomSaveAdaptationBundle({
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
    adaptationBundle: bundle,
    now: '2026-07-26T12:00:00.000Z'
  });
}

describe('custom-content Runtime projection', () => {
  it('returns an empty projection for old saves without custom content', () => {
    expect(projectCustomContentContext(createInitialRuntimeState())).toEqual({
      userPrioritySources: [],
      naturalCharacterSources: [],
      naturalEventSources: [],
      executionMaterials: {
        characters: {},
        eventGroups: {}
      },
      diagnostics: {
        selectedBindingIds: [],
        selectedInstanceIds: [],
        omittedCount: 0
      }
    });
  });

  it('projects only the bound ready snapshot and exposes it through PromptContext', () => {
    const state = bindCharacter();
    const projection = projectCustomContentContext(state);

    expect(projection.userPrioritySources).toHaveLength(1);
    expect(projection.userPrioritySources[0]).toMatchObject({
      kind: 'character',
      characterAssetId: 'character-forensic',
      displayName: '林静仪',
      entryMode: 'asap_contact',
      entryStatus: 'queued',
      priorityOrder: 1
    });
    expect(projection.naturalCharacterSources).toEqual([]);
    expect(Object.values(state.actors)).toHaveLength(
      Object.values(createInitialRuntimeState().actors).length
    );
    expect(selectContext(state, '继续值班').customContentProjection).toEqual(
      projection
    );
  });

  it('moves a non-priority ready character to the natural projection', () => {
    const bound = bindCharacter();
    const state = setCustomContentPriorityInState({
      state: bound,
      kind: 'character',
      assetId: 'character-forensic',
      prioritized: false,
      now: '2026-07-26T12:05:00.000Z'
    });

    const projection = projectCustomContentContext(state);
    expect(projection.userPrioritySources).toEqual([]);
    expect(projection.naturalCharacterSources).toHaveLength(1);
    expect(projection.naturalCharacterSources[0]).toMatchObject({
      entryMode: 'natural',
      entryStatus: 'queued'
    });
  });

  it('stops projecting a character after its configured contact target is achieved', () => {
    const bound = bindCharacter();
    const state: RuntimeState = {
      ...bound,
      customContent: {
        ...bound.customContent!,
        characterEntryIntents: bound.customContent!.characterEntryIntents.map(
          (intent) => ({
            ...intent,
            targetOutcome: 'contactable',
            status: 'contactable',
            priorityOrder: undefined
          })
        ),
        priorityItems: bound.customContent!.priorityItems.map((item) => ({
          ...item,
          status: 'completed'
        }))
      }
    };

    const projection = projectCustomContentContext(state);
    expect(projection.userPrioritySources).toEqual([]);
    expect(projection.naturalCharacterSources).toEqual([]);
  });

  it('keeps an explicitly active priority visible even when an older save labels its mode manual', () => {
    const bound = bindCharacter();
    const state: RuntimeState = {
      ...bound,
      customContent: {
        ...bound.customContent!,
        characterEntryIntents: bound.customContent!.characterEntryIntents.map(
          (intent) => ({ ...intent, mode: 'manual' })
        )
      }
    };

    expect(projectCustomContentContext(state).userPrioritySources).toEqual([
      expect.objectContaining({
        kind: 'character',
        entryMode: 'manual',
        entryStatus: 'queued'
      })
    ]);
  });

  it('omits unreviewed, paused, mismatched, or wrong-world character snapshots', () => {
    const unreviewed = bindCharacter({ adaptationStatus: 'needs_review' });
    expect(projectCustomContentContext(unreviewed).diagnostics.omittedCount).toBe(
      1
    );

    const ready = bindCharacter();
    const paused = setCustomContentBindingPausedInState({
      state: ready,
      kind: 'character',
      assetId: 'character-forensic',
      paused: true,
      now: '2026-07-26T12:05:00.000Z'
    });
    expect(projectCustomContentContext(paused).diagnostics.omittedCount).toBe(1);

    const bindingId = ready.customContent!.characterBindings[0].bindingId;
    const mismatched: RuntimeState = {
      ...ready,
      customContent: {
        ...ready.customContent!,
        characterBindings: ready.customContent!.characterBindings.map(
          (binding) =>
            binding.bindingId === bindingId
              ? { ...binding, checksum: 'tampered-checksum' }
              : binding
        )
      }
    };
    expect(projectCustomContentContext(mismatched).diagnostics.omittedCount).toBe(
      1
    );

    const adaptationId = Object.keys(ready.customContent!.characterAdaptations)[0];
    const wrongWorld: RuntimeState = {
      ...ready,
      customContent: {
        ...ready.customContent!,
        characterAdaptations: {
          ...ready.customContent!.characterAdaptations,
          [adaptationId]: {
            ...ready.customContent!.characterAdaptations[adaptationId],
            worldpackId: 'future_world'
          }
        }
      }
    };
    expect(projectCustomContentContext(wrongWorld).diagnostics.omittedCount).toBe(
      1
    );
  });

  it('projects an adapted event instance without leaking execution detail', () => {
    const state = bindEventProject();
    const projection = projectCustomContentContext(state);
    const source = projection.userPrioritySources.find(
      (candidate) => candidate.kind === 'event_group'
    );

    expect(source).toMatchObject({
      kind: 'event_group',
      eventGroupId: 'event-seal',
      projectId: 'project-seal',
      title: '封条异常',
      instanceStatus: 'latent',
      entryMode: 'asap',
      entryStatus: 'queued',
      priorityOrder: 1
    });
    expect(source).not.toHaveProperty('invariantCore');
    expect(source).not.toHaveProperty('mutableSlots');
    expect(source).not.toHaveProperty('forbiddenAdaptations');
    expect(projection.diagnostics.selectedInstanceIds).toHaveLength(1);
  });

  it('uses an existing Runtime fact as the stable event arc and omits invalid dependencies', () => {
    const state = bindEventProject();
    const instanceId = state.customContent!.eventInstances[0].instanceId;
    const active: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        eventInstances: state.customContent!.eventInstances.map((instance) =>
          instance.instanceId === instanceId
            ? {
                ...instance,
                status: 'active',
                primaryRuntimeArcRef: {
                  kind: 'current_matter',
                  id: 'matter-seal'
                }
              }
            : instance
        )
      }
    };
    const source = projectCustomContentContext(active).userPrioritySources.find(
      (candidate) => candidate.kind === 'event_group'
    );
    expect(source).toMatchObject({
      arcKey: 'matter:matter-seal'
    });

    const characterAdaptationId = Object.keys(
      state.customContent!.characterAdaptations
    )[0];
    const invalid: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        characterAdaptations: {
          ...state.customContent!.characterAdaptations,
          [characterAdaptationId]: {
            ...state.customContent!.characterAdaptations[characterAdaptationId],
            status: 'needs_review'
          }
        }
      }
    };
    expect(projectCustomContentContext(invalid).naturalEventSources).toEqual([]);
    expect(
      projectCustomContentContext(invalid).userPrioritySources.filter(
        (candidate) => candidate.kind === 'event_group'
      )
    ).toEqual([]);
  });

  it('omits completed events and event snapshots that are disabled or awaiting review', () => {
    const state = bindEventProject();
    const instance = state.customContent!.eventInstances[0];
    const completed: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        eventInstances: state.customContent!.eventInstances.map((candidate) =>
          candidate.instanceId === instance.instanceId
            ? { ...candidate, status: 'completed' }
            : candidate
        )
      }
    };
    expect(
      projectCustomContentContext(completed).userPrioritySources.filter(
        (candidate) => candidate.kind === 'event_group'
      )
    ).toEqual([]);

    const eventAdaptation = state.customContent!.eventGroupAdaptations[
      instance.adaptationId
    ];
    const projectAdaptationId = eventAdaptation.projectAdaptationId;
    const awaitingReview: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        projectAdaptations: {
          ...state.customContent!.projectAdaptations,
          [projectAdaptationId]: {
            ...state.customContent!.projectAdaptations[projectAdaptationId],
            status: 'needs_review'
          }
        }
      }
    };
    expect(
      projectCustomContentContext(awaitingReview).userPrioritySources.filter(
        (candidate) => candidate.kind === 'event_group'
      )
    ).toEqual([]);

    const disabled: RuntimeState = {
      ...state,
      customContent: {
        ...state.customContent!,
        eventGroupBindings: state.customContent!.eventGroupBindings.map(
          (binding) =>
            binding.assetId === instance.eventGroupId
              ? {
                  ...binding,
                  payload: {
                    ...binding.payload,
                    lifecycle: {
                      ...binding.payload.lifecycle,
                      availabilityStatus: 'disabled'
                    }
                  }
                }
              : binding
        )
      }
    };
    expect(
      projectCustomContentContext(disabled).userPrioritySources.filter(
        (candidate) => candidate.kind === 'event_group'
      )
    ).toEqual([]);
  });
});
