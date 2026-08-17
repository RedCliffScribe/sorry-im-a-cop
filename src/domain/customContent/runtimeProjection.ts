import type { RuntimeState } from '../runtime/types';
import { deriveDramaArcKeyFromWritebackRef } from '../drama/coherence';
import { isCustomAssetEligibleForNewGame } from './assetFoundation';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomImportedFact,
  CustomEventStage,
  CustomEventGroupRevision
} from './assetTypes';
import type {
  BoundCustomRevisionSnapshot,
  CustomCharacterEntryIntent,
  CustomCharacterSaveAdaptation,
  CustomContentPriorityItem,
  CustomEventEntryIntent,
  CustomEventGroupInstance,
  CustomEventGroupSaveAdaptation,
  CustomProjectSaveAdaptation,
  RuntimeCustomContentState
} from './saveTypes';
import {
  collectCustomEventStageCharacterAssetIds,
  resolveCustomEventCurrentStage
} from './lazyCharacterAdaptation';

export interface CustomCharacterProjectionSource {
  kind: 'character';
  bindingId: string;
  characterAssetId: string;
  revision: number;
  checksum: string;
  displayName: string;
  profileSummary: string;
  adaptationId: string;
  runtimeActorId: string;
  adaptedPublicIdentity: string;
  adaptedOccupation: string;
  adaptedSocialPosition: string;
  adaptedBackgroundSummary: string;
  adaptedContactRoutes: string[];
  entryMode: CustomCharacterEntryIntent['mode'];
  entryStatus: CustomCharacterEntryIntent['status'];
  targetOutcome: CustomCharacterEntryIntent['targetOutcome'];
  priorityOrder?: number;
}

export interface CustomEventGroupProjectionSource {
  kind: 'event_group';
  bindingId: string;
  instanceId: string;
  eventGroupId: string;
  revision: number;
  checksum: string;
  projectId: string;
  projectRevision: number;
  reusePolicy: CustomEventGroupRevision['reusePolicy'];
  title: string;
  summary: string;
  adaptedSummary: string;
  adaptationId: string;
  instanceStatus: CustomEventGroupInstance['status'];
  currentStageId?: string;
  entryMode: CustomEventEntryIntent['mode'];
  entryStatus: CustomEventEntryIntent['status'];
  priorityOrder?: number;
  arcKey: string;
  relatedActorIds: string[];
}

export interface CustomCharacterExecutionMaterial {
  backgroundSummary: string;
  sourceProfile?: CustomCharacterRevision['sourceProfile'];
  corePersonality: string[];
  values: string[];
  coreMotivations: string[];
  relationshipSummaries: string[];
  lockedFields: string[];
  adaptableFields: string[];
  identityAnchors: string[];
  permittedTransformations: string[];
  forbiddenTransformations: string[];
  conflictNotes: string[];
}

export interface CustomEventExecutionMaterial {
  invariantCore: string[];
  mutableSlots: string[];
  forbiddenAdaptations: string[];
  adaptedInvariantCore: string[];
  adaptedMutableElements: string[];
  adaptedRoleBindings: string[];
  adaptedEntryRoutes: string[];
  unresolvedConflicts: string[];
  currentStage?: CustomEventStage;
  roleBindings: Record<string, string>;
  requiredCharacters: Array<{
    characterAssetId: string;
    runtimeActorId: string;
    displayName: string;
    profileSummary: string;
    adaptedPublicIdentity: string;
    adaptedOccupation: string;
    adaptedBackgroundSummary: string;
  }>;
  usedStageIds: string[];
  usedNodeIds: string[];
  resultingWritebackRefs: Array<{
    kind: string;
    id: string;
  }>;
}

export interface CustomContentProjection {
  userPrioritySources: Array<
    CustomCharacterProjectionSource | CustomEventGroupProjectionSource
  >;
  naturalCharacterSources: CustomCharacterProjectionSource[];
  naturalEventSources: CustomEventGroupProjectionSource[];
  executionMaterials: {
    characters: Record<string, CustomCharacterExecutionMaterial>;
    eventGroups: Record<string, CustomEventExecutionMaterial>;
  };
  diagnostics: {
    selectedBindingIds: string[];
    selectedInstanceIds: string[];
    omittedCount: number;
  };
}

const eligibleCharacterIntentStatuses = new Set<
  CustomCharacterEntryIntent['status']
>(['queued', 'seeking_anchor', 'known_of', 'contactable']);

const eligibleEventIntentStatuses = new Set<CustomEventEntryIntent['status']>([
  'queued',
  'seeking_anchor',
  'anchored',
  'engaged'
]);

const eligibleEventInstanceStatuses = new Set<
  CustomEventGroupInstance['status']
>(['latent', 'seeking_anchor', 'anchored', 'active', 'diverged']);

function characterEntryTargetAchieved(
  intent: CustomCharacterEntryIntent
): boolean {
  if (intent.targetOutcome === 'contactable') {
    return (
      intent.status === 'contactable' ||
      intent.status === 'met' ||
      intent.status === 'established'
    );
  }
  return intent.status === 'met' || intent.status === 'established';
}

function isMatchingCharacterBinding(
  binding: BoundCustomRevisionSnapshot<CustomCharacterRevision>
): boolean {
  const payload = binding.payload;
  return (
    binding.assetKind === 'character' &&
    binding.assetId === payload.characterAssetId &&
    binding.revision === payload.revision &&
    binding.checksum === payload.checksum &&
    isCustomAssetEligibleForNewGame(payload.lifecycle)
  );
}

function isMatchingProjectBinding(
  binding: BoundCustomRevisionSnapshot<CustomContentProjectRevision>
): boolean {
  const payload = binding.payload;
  return (
    binding.assetKind === 'content_project' &&
    binding.assetId === payload.projectId &&
    binding.revision === payload.revision &&
    binding.checksum === payload.checksum &&
    isCustomAssetEligibleForNewGame(payload.lifecycle)
  );
}

function isMatchingEventBinding(
  binding: BoundCustomRevisionSnapshot<CustomEventGroupRevision>
): boolean {
  const payload = binding.payload;
  return (
    binding.assetKind === 'event_group' &&
    binding.assetId === payload.eventGroupId &&
    binding.revision === payload.revision &&
    binding.checksum === payload.checksum &&
    isCustomAssetEligibleForNewGame(payload.lifecycle)
  );
}

type CustomSaveAdaptation =
  | CustomCharacterSaveAdaptation
  | CustomEventGroupSaveAdaptation
  | CustomProjectSaveAdaptation;

function isReadyForWorld<T extends CustomSaveAdaptation>(
  adaptation: T | undefined,
  worldpackId: string
): adaptation is T {
  return adaptation?.status === 'ready' && adaptation.worldpackId === worldpackId;
}

function findCharacterAdaptation(
  customContent: RuntimeCustomContentState,
  binding: BoundCustomRevisionSnapshot<CustomCharacterRevision>
): CustomCharacterSaveAdaptation | undefined {
  return Object.values(customContent.characterAdaptations).find(
    (adaptation) =>
      adaptation.characterAssetId === binding.assetId &&
      adaptation.sourceRevision === binding.revision
  );
}

function findPriorityItem(
  customContent: RuntimeCustomContentState,
  targetKind: CustomContentPriorityItem['targetKind'],
  targetId: string
): CustomContentPriorityItem | undefined {
  return customContent.priorityItems.find(
    (item) =>
      item.targetKind === targetKind &&
      item.targetId === targetId &&
      item.status === 'active'
  );
}

function projectCharacter({
  customContent,
  binding,
  worldpackId
}: {
  customContent: RuntimeCustomContentState;
  binding: BoundCustomRevisionSnapshot<CustomCharacterRevision>;
  worldpackId: string;
}): {
  source: CustomCharacterProjectionSource;
  executionMaterial: CustomCharacterExecutionMaterial;
  userPriority: boolean;
} | null {
  if (!isMatchingCharacterBinding(binding)) return null;
  const intent = customContent.characterEntryIntents.find(
    (candidate) => candidate.bindingId === binding.bindingId
  );
  const userPriority =
    findPriorityItem(customContent, 'character', binding.bindingId) !==
    undefined;
  if (
    !intent ||
    (intent.mode === 'manual' && !userPriority) ||
    !eligibleCharacterIntentStatuses.has(intent.status) ||
    characterEntryTargetAchieved(intent)
  ) {
    return null;
  }
  const adaptation = findCharacterAdaptation(customContent, binding);
  if (!isReadyForWorld(adaptation, worldpackId)) return null;
  if (adaptation.projectAdaptationId) {
    const projectAdaptation =
      customContent.projectAdaptations[adaptation.projectAdaptationId];
    if (!isReadyForWorld(projectAdaptation, worldpackId)) return null;
  }
  const payload = binding.payload;
  return {
    source: {
      kind: 'character',
      bindingId: binding.bindingId,
      characterAssetId: binding.assetId,
      revision: binding.revision,
      checksum: binding.checksum,
      displayName: payload.displayName,
      profileSummary: payload.profileSummary,
      adaptationId: adaptation.adaptationId,
      runtimeActorId: adaptation.runtimeActorId,
      adaptedPublicIdentity: adaptation.adaptedPublicIdentity,
      adaptedOccupation: adaptation.adaptedOccupation,
      adaptedSocialPosition: adaptation.adaptedSocialPosition,
      adaptedBackgroundSummary: adaptation.adaptedBackgroundSummary,
      adaptedContactRoutes: [...adaptation.adaptedContactRoutes],
      entryMode: intent.mode,
      entryStatus: intent.status,
      targetOutcome: intent.targetOutcome,
      priorityOrder: intent.priorityOrder
    },
    executionMaterial: {
      backgroundSummary: payload.backgroundSummary,
      sourceProfile: payload.sourceProfile
        ? {
            ...payload.sourceProfile,
            temporalAnchor: payload.sourceProfile.temporalAnchor
              ? { ...payload.sourceProfile.temporalAnchor }
              : undefined,
            usualPlaceHints: [...payload.sourceProfile.usualPlaceHints],
            contactRoutes: [...payload.sourceProfile.contactRoutes]
          }
        : undefined,
      corePersonality: [...payload.corePersonality],
      values: [...payload.values],
      coreMotivations: [...payload.coreMotivations],
      relationshipSummaries: payload.majorRelationships.map(
        (relationship) => `${relationship.label}：${relationship.summary}`
      ),
      lockedFields: [...payload.adaptationPolicy.lockedFields],
      adaptableFields: [...payload.adaptationPolicy.adaptableFields],
      identityAnchors: [
        ...(payload.adaptationPolicy.identityAnchors ?? [])
      ],
      permittedTransformations: [
        ...(payload.adaptationPolicy.permittedTransformations ?? [])
      ],
      forbiddenTransformations: [
        ...(payload.adaptationPolicy.forbiddenTransformations ?? [])
      ],
      conflictNotes: [...(payload.adaptationPolicy.conflictNotes ?? [])]
    },
    userPriority
  };
}

function eventArcKey(instance: CustomEventGroupInstance): string {
  return instance.primaryRuntimeArcRef
    ? deriveDramaArcKeyFromWritebackRef(instance.primaryRuntimeArcRef)
    : `custom-event:${instance.instanceId}`;
}

function projectFactState(
  instance: CustomEventGroupInstance,
  fact: CustomImportedFact
): CustomImportedFact {
  return {
    ...fact,
    state: instance.factStateOverrides?.[fact.factId] ?? fact.state,
    sourceSpans: fact.sourceSpans.map((span) => ({ ...span }))
  };
}

function projectEventStage(
  instance: CustomEventGroupInstance,
  stage: CustomEventStage
): CustomEventStage {
  return {
    ...stage,
    establishedSourceFacts: stage.establishedSourceFacts.map((fact) =>
      projectFactState(instance, fact)
    ),
    continuationSourceFacts: stage.continuationSourceFacts.map((fact) =>
      projectFactState(instance, fact)
    ),
    hardSourceConstraints: stage.hardSourceConstraints.map((fact) =>
      projectFactState(instance, fact)
    ),
    foreshadowingOptions: [...stage.foreshadowingOptions],
    eventNodes: stage.eventNodes
      .filter((node) => !instance.usedNodeIds.includes(node.nodeId))
      .map((node) => ({
        ...node,
        prerequisites: [...node.prerequisites],
        entryConditions: [...node.entryConditions],
        blockers: [...node.blockers],
        characterUsages: node.characterUsages.map((usage) => ({ ...usage })),
        knowledgeBoundary: {
          knownBy: [...node.knowledgeBoundary.knownBy],
          hiddenFrom: [...node.knowledgeBoundary.hiddenFrom],
          readerOnly: node.knowledgeBoundary.readerOnly
        },
        possibleOutcomes: [...node.possibleOutcomes],
        downstreamEffects: [...node.downstreamEffects]
      })),
    completionHints: [...stage.completionHints],
    nextStageHints: [...stage.nextStageHints]
  };
}

function projectEvent({
  customContent,
  instance,
  worldpackId
}: {
  customContent: RuntimeCustomContentState;
  instance: CustomEventGroupInstance;
  worldpackId: string;
}): {
  source: CustomEventGroupProjectionSource;
  executionMaterial: CustomEventExecutionMaterial;
  userPriority: boolean;
} | null {
  if (!eligibleEventInstanceStatuses.has(instance.status)) return null;
  const binding = customContent.eventGroupBindings.find(
    (candidate) =>
      candidate.assetId === instance.eventGroupId &&
      candidate.revision === instance.eventGroupRevision
  );
  if (!binding || !isMatchingEventBinding(binding)) return null;
  const projectBinding = customContent.projectBindings.find(
    (candidate) =>
      candidate.assetId === instance.projectId &&
      candidate.revision === instance.projectRevision
  );
  if (!projectBinding || !isMatchingProjectBinding(projectBinding)) return null;
  const intent = customContent.eventEntryIntents.find(
    (candidate) => candidate.instanceId === instance.instanceId
  );
  const userPriority =
    findPriorityItem(customContent, 'event_group', instance.instanceId) !==
    undefined;
  if (
    !intent ||
    (intent.mode === 'manual' && !userPriority) ||
    !eligibleEventIntentStatuses.has(intent.status)
  ) {
    return null;
  }
  const adaptation = customContent.eventGroupAdaptations[instance.adaptationId];
  if (
    !adaptation ||
    adaptation.eventGroupId !== binding.assetId ||
    adaptation.sourceRevision !== binding.revision ||
    !isReadyForWorld(adaptation, worldpackId)
  ) {
    return null;
  }
  const projectAdaptation =
    customContent.projectAdaptations[adaptation.projectAdaptationId];
  if (
    !projectAdaptation ||
    projectAdaptation.projectId !== projectBinding.assetId ||
    projectAdaptation.projectRevision !== projectBinding.revision ||
    !isReadyForWorld(projectAdaptation, worldpackId)
  ) {
    return null;
  }
  for (const [characterAssetId, runtimeActorId] of Object.entries(
    instance.projectCharacterBindings
  )) {
    const characterBinding = customContent.characterBindings.find(
      (candidate) => candidate.assetId === characterAssetId
    );
    if (!characterBinding || !isMatchingCharacterBinding(characterBinding)) {
      return null;
    }
    const characterAdaptation = findCharacterAdaptation(
      customContent,
      characterBinding
    );
    if (
      !isReadyForWorld(characterAdaptation, worldpackId) ||
      characterAdaptation.runtimeActorId !== runtimeActorId
    ) {
      return null;
    }
  }
  const payload = binding.payload;
  const sourceStage = resolveCustomEventCurrentStage(payload, {
    currentStageId: instance.currentStageId,
    usedStageIds: instance.usedStageIds
  });
  const currentStage = sourceStage
    ? projectEventStage(instance, sourceStage)
    : undefined;
  const requiredCharacterAssetIds = new Set(
    collectCustomEventStageCharacterAssetIds(payload, sourceStage)
  );
  const requiredCharacters = [...requiredCharacterAssetIds].flatMap(
    (characterAssetId) => {
      const characterBinding = customContent.characterBindings.find(
        (candidate) => candidate.assetId === characterAssetId
      );
      const characterAdaptation = characterBinding
        ? findCharacterAdaptation(customContent, characterBinding)
        : undefined;
      if (!characterBinding || !characterAdaptation) return [];
      return [
        {
          characterAssetId,
          runtimeActorId: characterAdaptation.runtimeActorId,
          displayName: characterBinding.payload.displayName,
          profileSummary: characterBinding.payload.profileSummary,
          adaptedPublicIdentity: characterAdaptation.adaptedPublicIdentity,
          adaptedOccupation: characterAdaptation.adaptedOccupation,
          adaptedBackgroundSummary:
            characterAdaptation.adaptedBackgroundSummary
        }
      ];
    }
  );
  if (requiredCharacters.length !== requiredCharacterAssetIds.size) {
    return null;
  }
  return {
    source: {
      kind: 'event_group',
      bindingId: binding.bindingId,
      instanceId: instance.instanceId,
      eventGroupId: binding.assetId,
      revision: binding.revision,
      checksum: binding.checksum,
      projectId: instance.projectId,
      projectRevision: instance.projectRevision,
      reusePolicy: payload.reusePolicy,
      title: payload.title,
      summary: payload.summary,
      adaptedSummary: adaptation.adaptedSummary,
      adaptationId: adaptation.adaptationId,
      instanceStatus: instance.status,
      currentStageId: currentStage?.stageId,
      entryMode: intent.mode,
      entryStatus: intent.status,
      priorityOrder: intent.priorityOrder,
      arcKey: eventArcKey(instance),
      relatedActorIds: Array.from(
        new Set([
          ...Object.values(instance.projectCharacterBindings),
          ...Object.values(instance.roleBindings)
        ])
      )
    },
    executionMaterial: {
      invariantCore: [...payload.invariantCore],
      mutableSlots: [...payload.mutableSlots],
      forbiddenAdaptations: [...payload.forbiddenAdaptations],
      adaptedInvariantCore: [...adaptation.adaptedInvariantCore],
      adaptedMutableElements: [...adaptation.adaptedMutableElements],
      adaptedRoleBindings: [...adaptation.adaptedRoleBindings],
      adaptedEntryRoutes: [...adaptation.adaptedEntryRoutes],
      unresolvedConflicts: [...adaptation.unresolvedConflicts],
      currentStage,
      roleBindings: { ...instance.roleBindings },
      requiredCharacters,
      usedStageIds: [...instance.usedStageIds],
      usedNodeIds: [...instance.usedNodeIds],
      resultingWritebackRefs: instance.resultingWritebackRefs.map((ref) => ({
        ...ref
      }))
    },
    userPriority
  };
}

function prioritySort(
  left: CustomCharacterProjectionSource | CustomEventGroupProjectionSource,
  right: CustomCharacterProjectionSource | CustomEventGroupProjectionSource
): number {
  const leftStableId =
    left.kind === 'character' ? left.bindingId : left.instanceId;
  const rightStableId =
    right.kind === 'character' ? right.bindingId : right.instanceId;
  return (
    (left.priorityOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.priorityOrder ?? Number.MAX_SAFE_INTEGER) ||
    leftStableId.localeCompare(rightStableId)
  );
}

export function projectCustomContentContext(
  state: RuntimeState
): CustomContentProjection {
  const customContent = state.customContent;
  if (!customContent) {
    return {
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
    };
  }

  const projectedCharacters = customContent.characterBindings.map((binding) =>
    projectCharacter({
      customContent,
      binding,
      worldpackId: state.world.worldpackId
    })
  );
  const projectedEvents = customContent.eventInstances.map((instance) =>
    projectEvent({
      customContent,
      instance,
      worldpackId: state.world.worldpackId
    })
  );
  const characterSources = projectedCharacters.filter(
    (
      candidate
    ): candidate is NonNullable<(typeof projectedCharacters)[number]> =>
      candidate !== null
  );
  const eventSources = projectedEvents.filter(
    (
      candidate
    ): candidate is NonNullable<(typeof projectedEvents)[number]> =>
      candidate !== null
  );
  const userPrioritySources = [
    ...characterSources
      .filter((candidate) => candidate.userPriority)
      .map((candidate) => candidate.source),
    ...eventSources
      .filter((candidate) => candidate.userPriority)
      .map((candidate) => candidate.source)
  ].sort(prioritySort);
  const naturalCharacterSources = characterSources
    .filter((candidate) => !candidate.userPriority)
    .map((candidate) => candidate.source)
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId));
  const naturalEventSources = eventSources
    .filter((candidate) => !candidate.userPriority)
    .map((candidate) => candidate.source)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  const selectedCharacterSources = characterSources.map(
    (candidate) => candidate.source
  );
  const selectedEventSources = eventSources.map((candidate) => candidate.source);

  return {
    userPrioritySources,
    naturalCharacterSources,
    naturalEventSources,
    executionMaterials: {
      characters: Object.fromEntries(
        characterSources.map((candidate) => [
          candidate.source.bindingId,
          candidate.executionMaterial
        ])
      ),
      eventGroups: Object.fromEntries(
        eventSources.map((candidate) => [
          candidate.source.instanceId,
          candidate.executionMaterial
        ])
      )
    },
    diagnostics: {
      selectedBindingIds: [
        ...selectedCharacterSources.map((source) => source.bindingId),
        ...selectedEventSources.map((source) => source.bindingId)
      ],
      selectedInstanceIds: selectedEventSources.map(
        (source) => source.instanceId
      ),
      omittedCount:
        customContent.characterBindings.length +
        customContent.eventInstances.length -
        selectedCharacterSources.length -
        selectedEventSources.length
    }
  };
}
