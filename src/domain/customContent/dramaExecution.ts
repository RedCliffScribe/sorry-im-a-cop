import type { RuntimeState } from '../runtime/types';
import type {
  CustomEventProgressTrace,
  DramaExecutionTrace,
  DramaPlan,
  DramaSourceRef,
  DramaWritebackRef
} from '../drama/types';
import { wasDramaWritebackRefApplied } from '../drama/trace';
import type {
  CustomCharacterAdaptationIntent,
  CustomCharacterEntryIntent,
  CustomContentPriorityItem,
  CustomEventEntryIntent,
  CustomEventGroupInstance,
  RuntimeCustomContentState
} from './saveTypes';
import type {
  CustomEventGroupRevision,
  ImportedFactState
} from './assetTypes';
import {
  collectCustomEventStageCharacterAssetIds,
  resolveCustomEventCurrentStage
} from './lazyCharacterAdaptation';

const CHARACTER_PROVIDER_ID = 'custom-character';
const CHARACTER_SOURCE_TYPE = 'custom_character_binding';
const EVENT_PROVIDER_ID = 'custom-event-group';
const EVENT_SOURCE_TYPE = 'custom_event_group_instance';

const characterStatusRank: Record<
  Exclude<CustomCharacterEntryIntent['status'], 'paused' | 'cancelled'>,
  number
> = {
  queued: 0,
  seeking_anchor: 1,
  known_of: 2,
  contactable: 3,
  met: 4,
  established: 5
};

const eventStatusRank: Record<
  Exclude<CustomEventEntryIntent['status'], 'paused' | 'cancelled'>,
  number
> = {
  queued: 0,
  seeking_anchor: 1,
  anchored: 2,
  engaged: 3
};

function sourceRefKey(ref: DramaSourceRef): string {
  return `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`;
}

function writebackRefKey(ref: DramaWritebackRef): string {
  return `${ref.kind}:${ref.id}`;
}

function uniqueWritebackRefs(refs: DramaWritebackRef[]): DramaWritebackRef[] {
  return Array.from(
    new Map(refs.map((ref) => [writebackRefKey(ref), { ...ref }])).values()
  );
}

function refsAreSubset(
  refs: DramaWritebackRef[],
  allowedRefs: DramaWritebackRef[]
): boolean {
  const allowedKeys = new Set(allowedRefs.map(writebackRefKey));
  return refs.every((ref) => allowedKeys.has(writebackRefKey(ref)));
}

function appliedRefsForEvent({
  trace,
  instanceId,
  allAppliedRefs,
  usedSourceCount
}: {
  trace: DramaExecutionTrace | undefined;
  instanceId: string;
  allAppliedRefs: DramaWritebackRef[];
  usedSourceCount: number;
}): DramaWritebackRef[] {
  const progress = trace?.customEventProgress?.find(
    (candidate) => candidate.instanceId === instanceId
  );
  if (progress) {
    return allAppliedRefs.filter((ref) =>
      progress.supportingWritebackRefs.some(
        (candidate) => writebackRefKey(candidate) === writebackRefKey(ref)
      )
    );
  }
  return usedSourceCount === 1 ? allAppliedRefs : [];
}

function factsForStage(stage: CustomEventGroupRevision['stages'][number]) {
  return [
    ...stage.establishedSourceFacts,
    ...stage.continuationSourceFacts,
    ...stage.hardSourceConstraints
  ];
}

function applyEventProgress({
  instance,
  payload,
  progress,
  appliedRefs,
  turnCounter
}: {
  instance: CustomEventGroupInstance;
  payload: CustomEventGroupRevision | undefined;
  progress: CustomEventProgressTrace | undefined;
  appliedRefs: DramaWritebackRef[];
  turnCounter: number;
}): CustomEventGroupInstance {
  if (!payload || !progress || appliedRefs.length === 0) return instance;
  const currentStage =
    payload.stages.find(
      (stage) =>
        stage.stageId === instance.currentStageId &&
        !instance.usedStageIds.includes(stage.stageId)
    ) ??
    payload.stages.find(
      (stage) => !instance.usedStageIds.includes(stage.stageId)
    );
  if (!currentStage || progress.stageId !== currentStage.stageId) return instance;
  const availableNodeIds = new Set(
    currentStage.eventNodes.map((node) => node.nodeId)
  );
  if (
    progress.usedNodeIds.some(
      (nodeId) =>
        !availableNodeIds.has(nodeId) || instance.usedNodeIds.includes(nodeId)
    ) ||
    !refsAreSubset(progress.supportingWritebackRefs, appliedRefs)
  ) {
    return instance;
  }
  const availableFacts = new Map(
    factsForStage(currentStage).map((fact) => [fact.factId, fact])
  );
  if (
    progress.factStateChanges.some(
      (change) =>
        !availableFacts.has(change.factId) ||
        !refsAreSubset(change.supportingWritebackRefs, appliedRefs)
    )
  ) {
    return instance;
  }
  const currentIndex = payload.stages.findIndex(
    (stage) => stage.stageId === currentStage.stageId
  );
  const nextUnusedStage = payload.stages
    .slice(currentIndex + 1)
    .find((stage) => !instance.usedStageIds.includes(stage.stageId));
  if (
    (progress.decision === 'advance' &&
      progress.nextStageId !== nextUnusedStage?.stageId) ||
    (progress.decision !== 'advance' && progress.nextStageId)
  ) {
    return instance;
  }

  const factStateOverrides: Record<string, ImportedFactState> = {
    ...(instance.factStateOverrides ?? {})
  };
  for (const change of progress.factStateChanges) {
    factStateOverrides[change.factId] = change.state;
  }
  const stageIsClosed =
    progress.decision === 'advance' ||
    progress.decision === 'complete' ||
    progress.decision === 'diverge';
  const usedStageIds =
    progress.decision === 'diverge'
      ? payload.stages.map((stage) => stage.stageId)
      : Array.from(
          new Set([
            ...instance.usedStageIds,
            ...(stageIsClosed ? [currentStage.stageId] : [])
          ])
        );
  const status =
    progress.decision === 'complete'
      ? 'completed'
      : progress.decision === 'diverge'
        ? 'diverged'
        : instance.status;
  return {
    ...instance,
    status,
    currentStageId:
      progress.decision === 'advance'
        ? progress.nextStageId
        : progress.decision === 'stay'
          ? currentStage.stageId
          : undefined,
    usedStageIds,
    usedNodeIds: Array.from(
      new Set([...instance.usedNodeIds, ...progress.usedNodeIds])
    ),
    factStateOverrides,
    progressHistory: [
      ...(instance.progressHistory ?? []),
      {
        turnCounter,
        stageId: progress.stageId,
        usedNodeIds: [...progress.usedNodeIds],
        decision: progress.decision,
        ...(progress.nextStageId
          ? { nextStageId: progress.nextStageId }
          : {}),
        supportingWritebackRefs: progress.supportingWritebackRefs.map((ref) => ({
          ...ref
        })),
        factStateChanges: progress.factStateChanges.map((change) => ({
          ...change,
          supportingWritebackRefs: change.supportingWritebackRefs.map((ref) => ({
            ...ref
          }))
        }))
      }
    ].slice(-40)
  };
}

function selectedSourceRefs(plan: DramaPlan | undefined): DramaSourceRef[] {
  if (!plan) return [];
  return [plan.primarySource, ...plan.supportSources].filter(
    (ref): ref is DramaSourceRef => Boolean(ref)
  );
}

function isCharacterSource(ref: DramaSourceRef): boolean {
  return (
    ref.providerId === CHARACTER_PROVIDER_ID &&
    ref.sourceType === CHARACTER_SOURCE_TYPE
  );
}

function isEventSource(ref: DramaSourceRef): boolean {
  return (
    ref.providerId === EVENT_PROVIDER_ID &&
    ref.sourceType === EVENT_SOURCE_TYPE
  );
}

function actorMemoriesFor(
  state: RuntimeState,
  actorId: string
): RuntimeState['memories'][string][] {
  return Object.values(state.memories).filter(
    (memory) =>
      memory.kind === 'actor' && memory.relatedActorIds.includes(actorId)
  );
}

function relatedActorIdsForRef(
  state: RuntimeState,
  ref: DramaWritebackRef
): string[] {
  switch (ref.kind) {
    case 'actor':
    case 'actor_memory':
    case 'pregnancy_risk':
    case 'pregnancy_resolution':
      return [ref.id];
    case 'current_matter':
      return state.dynamicEvents.currentMatters[ref.id]?.relatedActorIds ?? [];
    case 'signal':
      return state.dynamicEvents.signals[ref.id]?.relatedActorIds ?? [];
    case 'news_issue':
      return (
        state.dynamicEvents.newsIssues[ref.id]?.articles.flatMap(
          (article) => article.relatedActorIds
        ) ?? []
      );
    case 'case':
      return state.cases[ref.id]?.relatedActorIds ?? [];
    case 'case_evidence':
      return state.caseEvidence[ref.id]?.relatedActorIds ?? [];
    case 'deferred_event': {
      const actorId = state.deferredEvents[ref.id]?.relatedIds.actorId;
      return actorId ? [actorId] : [];
    }
    case 'relationship_thread':
      return state.relationshipThreads[ref.id]?.relatedActorIds ?? [];
    case 'organization':
      return state.organizations[ref.id]?.relatedActorIds ?? [];
    case 'city_situation_track':
      return state.citySituationTracks[ref.id]?.relatedActorIds ?? [];
    case 'place':
      return state.places[ref.id]?.relatedActorIds ?? [];
    case 'scene':
      return state.scenes[ref.id]?.presentActorIds ?? [];
    default:
      return [];
  }
}

function isPlayerPerceptibleRef(
  state: RuntimeState,
  ref: DramaWritebackRef
): boolean {
  switch (ref.kind) {
    case 'actor': {
      const actor = state.actors[ref.id];
      return Boolean(
        actor &&
          actor.presence !== 'absent' &&
          actor.visibility !== 'hidden' &&
          actor.visibility !== 'private'
      );
    }
    case 'actor_memory':
      return actorMemoriesFor(state, ref.id).some(
        (memory) =>
          memory.visibility === 'public' ||
          memory.visibility === 'player_known'
      );
    case 'current_matter':
      return state.dynamicEvents.currentMatters[ref.id]?.visibility === 'known';
    case 'signal':
      return state.dynamicEvents.signals[ref.id]?.visibility === 'known';
    case 'news_issue':
      return Boolean(state.dynamicEvents.newsIssues[ref.id]);
    case 'deferred_event':
      return state.deferredEvents[ref.id]?.visibility === 'player_visible';
    case 'case': {
      const visibility = state.cases[ref.id]?.visibility;
      return visibility === 'public' || visibility === 'player_known';
    }
    case 'case_evidence': {
      const visibility = state.caseEvidence[ref.id]?.visibility;
      return visibility === 'public' || visibility === 'player_known';
    }
    case 'relationship_thread': {
      const visibility = state.relationshipThreads[ref.id]?.visibility;
      return visibility === 'public' || visibility === 'player_known';
    }
    case 'organization': {
      const visibility = state.organizations[ref.id]?.visibility;
      return visibility === 'public' || visibility === 'player_known';
    }
    case 'city_situation_track': {
      const visibility = state.citySituationTracks[ref.id]?.visibility;
      return Boolean(visibility && visibility !== 'hidden');
    }
    case 'place':
      return Boolean(state.places[ref.id]);
    case 'scene':
      return Boolean(state.scenes[ref.id]);
    case 'judgement_check':
      return Boolean(state.judgementChecks[ref.id]);
    case 'combat_event':
      return Boolean(state.combatEvents[ref.id]);
    case 'asset':
    case 'gray_ledger':
      return ref.id === 'player';
    default:
      return false;
  }
}

function refConcernsActor(
  state: RuntimeState,
  ref: DramaWritebackRef,
  actorId: string
): boolean {
  return relatedActorIdsForRef(state, ref).includes(actorId);
}

function actorIsPresentWithPlayer(
  state: RuntimeState,
  actorId: string
): boolean {
  const actor = state.actors[actorId];
  if (!actor || actor.presence !== 'present') return false;
  if (
    state.location.currentSceneId &&
    actor.currentSceneId === state.location.currentSceneId
  ) {
    return true;
  }
  return actor.currentPlaceId === state.location.currentPlaceId;
}

function advanceCharacterStatus(
  current: CustomCharacterEntryIntent['status'],
  candidate: Exclude<
    CustomCharacterEntryIntent['status'],
    'paused' | 'cancelled'
  >
): CustomCharacterEntryIntent['status'] {
  if (current === 'paused' || current === 'cancelled') return current;
  return characterStatusRank[candidate] > characterStatusRank[current]
    ? candidate
    : current;
}

function advanceEventStatus(
  current: CustomEventEntryIntent['status'],
  candidate: Exclude<CustomEventEntryIntent['status'], 'paused' | 'cancelled'>
): CustomEventEntryIntent['status'] {
  if (current === 'paused' || current === 'cancelled') return current;
  return eventStatusRank[candidate] > eventStatusRank[current]
    ? candidate
    : current;
}

function characterTargetAchieved(
  intent: CustomCharacterEntryIntent
): boolean {
  if (intent.status === 'paused' || intent.status === 'cancelled') return false;
  const targetRank =
    intent.targetOutcome === 'contactable'
      ? characterStatusRank.contactable
      : characterStatusRank.met;
  return characterStatusRank[intent.status] >= targetRank;
}

function withCompletedPriority(
  items: CustomContentPriorityItem[],
  targetId: string,
  completed: boolean
): CustomContentPriorityItem[] {
  if (!completed) return items;
  return items.map((item) =>
    item.targetId === targetId && item.status === 'active'
      ? { ...item, status: 'completed' }
      : item
  );
}

function addPriorityOrders(
  customContent: RuntimeCustomContentState
): RuntimeCustomContentState {
  const orderByTargetId = new Map(
    customContent.priorityItems
      .filter((item) => item.status === 'active')
      .map((item, index) => [item.targetId, index + 1])
  );
  return {
    ...customContent,
    characterEntryIntents: customContent.characterEntryIntents.map((intent) => ({
      ...intent,
      priorityOrder: orderByTargetId.get(intent.bindingId)
    })),
    eventEntryIntents: customContent.eventEntryIntents.map((intent) => ({
      ...intent,
      priorityOrder: orderByTargetId.get(intent.instanceId)
    }))
  };
}

function nextCharacterStatus({
  current,
  actorId,
  after,
  appliedRefs
}: {
  current: CustomCharacterEntryIntent['status'];
  actorId: string;
  after: RuntimeState;
  appliedRefs: DramaWritebackRef[];
}): CustomCharacterEntryIntent['status'] {
  const relatedRefs = appliedRefs.filter((ref) =>
    refConcernsActor(after, ref, actorId)
  );
  const relationshipEstablished = relatedRefs.some(
    (ref) => ref.kind === 'relationship_thread'
  );
  const actualInteraction =
    relatedRefs.some((ref) => ref.kind === 'actor_memory') ||
    relatedRefs.some(
      (ref) =>
        (ref.kind === 'actor' || ref.kind === 'scene') &&
        actorIsPresentWithPlayer(after, actorId)
    );
  const contactPath = relatedRefs.some((ref) =>
    ['current_matter', 'deferred_event', 'case'].includes(ref.kind)
  );

  if (relationshipEstablished) {
    return advanceCharacterStatus(current, 'established');
  }
  if (actualInteraction) {
    return advanceCharacterStatus(
      current,
      current === 'met' || current === 'established' ? 'established' : 'met'
    );
  }
  if (contactPath) return advanceCharacterStatus(current, 'contactable');
  return advanceCharacterStatus(current, 'known_of');
}

function nextEventInstanceStatus(
  current: CustomEventGroupInstance['status'],
  intended: 'seeking_anchor' | 'anchored' | 'active'
): CustomEventGroupInstance['status'] {
  if (
    current === 'paused' ||
    current === 'diverged' ||
    current === 'completed' ||
    current === 'abandoned'
  ) {
    return current;
  }
  if (current === 'active' || intended === 'active') return 'active';
  if (current === 'anchored' || intended === 'anchored') return 'anchored';
  return 'seeking_anchor';
}

function primaryRuntimeArcRef(
  current: CustomEventGroupInstance['primaryRuntimeArcRef'],
  perceptibleRefs: DramaWritebackRef[]
): CustomEventGroupInstance['primaryRuntimeArcRef'] {
  if (current) return { ...current };
  const preferredKinds = [
    'current_matter',
    'case',
    'relationship_thread',
    'deferred_event',
    'signal',
    'news_issue',
    'actor',
    'scene',
    'place'
  ];
  for (const kind of preferredKinds) {
    const match = perceptibleRefs.find((ref) => ref.kind === kind);
    if (match) return { ...match };
  }
  return perceptibleRefs[0] ? { ...perceptibleRefs[0] } : undefined;
}

export function applyCustomContentDramaExecution({
  stateBeforeWriteback,
  stateAfterWriteback,
  plan,
  trace
}: {
  stateBeforeWriteback: RuntimeState;
  stateAfterWriteback: RuntimeState;
  plan?: DramaPlan;
  trace?: DramaExecutionTrace;
}): RuntimeState {
  const current = stateAfterWriteback.customContent;
  if (!current) return stateAfterWriteback;

  const plannedKeys = new Set(selectedSourceRefs(plan).map(sourceRefKey));
  const usedRefs = trace?.usedSourceRefs ?? [];
  const usedCharacterIds = new Set(
    usedRefs.filter(isCharacterSource).map((ref) => ref.sourceId)
  );
  const usedEventIds = new Set(
    usedRefs.filter(isEventSource).map((ref) => ref.sourceId)
  );
  const usedSourceCount = new Set(usedRefs.map(sourceRefKey)).size;
  const appliedRefs =
    trace?.status === 'used_persistently'
      ? uniqueWritebackRefs(
          trace.resultingWritebackRefs.filter((ref) =>
            wasDramaWritebackRefApplied(
              stateBeforeWriteback,
              stateAfterWriteback,
              ref
            )
          )
        )
      : [];
  const turnCounter = stateAfterWriteback.turnCounter;
  const eventAppliedRefs = (instanceId: string) =>
    appliedRefsForEvent({
      trace,
      instanceId,
      allAppliedRefs: appliedRefs,
      usedSourceCount
    });

  let priorityItems = current.priorityItems.map((item) => ({ ...item }));
  let characterRuntimeBindings = current.characterRuntimeBindings.map(
    (binding) => ({ ...binding })
  );
  const characterEntryIntents = current.characterEntryIntents.map((intent) => {
    const sourceRef: DramaSourceRef = {
      providerId: CHARACTER_PROVIDER_ID,
      sourceType: CHARACTER_SOURCE_TYPE,
      sourceId: intent.bindingId
    };
    const planned = plannedKeys.has(sourceRefKey(sourceRef));
    if (!usedCharacterIds.has(intent.bindingId)) {
      return planned ? { ...intent, lastPlannedTurn: turnCounter } : { ...intent };
    }

    const binding = current.characterBindings.find(
      (candidate) => candidate.bindingId === intent.bindingId
    );
    const adaptation = binding
      ? Object.values(current.characterAdaptations).find(
          (candidate) =>
            candidate.characterAssetId === binding.assetId &&
            candidate.sourceRevision === binding.revision
        )
      : undefined;
    const actorId = adaptation?.runtimeActorId;
    const status = actorId
      ? nextCharacterStatus({
          current: intent.status,
          actorId,
          after: stateAfterWriteback,
          appliedRefs
        })
      : advanceCharacterStatus(intent.status, 'known_of');
    const nextIntent: CustomCharacterEntryIntent = {
      ...intent,
      status,
      lastPlannedTurn: planned ? turnCounter : intent.lastPlannedTurn,
      lastConfirmedExposureTurn: turnCounter
    };

    if (
      binding &&
      adaptation &&
      stateAfterWriteback.actors[adaptation.runtimeActorId] &&
      appliedRefs.some((ref) =>
        refConcernsActor(stateAfterWriteback, ref, adaptation.runtimeActorId)
      ) &&
      !characterRuntimeBindings.some(
        (candidate) =>
          candidate.characterAssetId === binding.assetId &&
          candidate.sourceRevision === binding.revision
      )
    ) {
      characterRuntimeBindings = [
        ...characterRuntimeBindings,
        {
          characterAssetId: binding.assetId,
          sourceRevision: binding.revision,
          adaptationId: adaptation.adaptationId,
          actorId: adaptation.runtimeActorId
        }
      ];
    }
    priorityItems = withCompletedPriority(
      priorityItems,
      intent.bindingId,
      characterTargetAchieved(nextIntent)
    );
    return nextIntent;
  });

  const eventEntryIntents = current.eventEntryIntents.map((intent) => {
    const sourceRef: DramaSourceRef = {
      providerId: EVENT_PROVIDER_ID,
      sourceType: EVENT_SOURCE_TYPE,
      sourceId: intent.instanceId
    };
    const planned = plannedKeys.has(sourceRefKey(sourceRef));
    if (!usedEventIds.has(intent.instanceId)) {
      return planned ? { ...intent, lastPlannedTurn: turnCounter } : { ...intent };
    }
    const perceptibleRefs = eventAppliedRefs(intent.instanceId).filter((ref) =>
      isPlayerPerceptibleRef(stateAfterWriteback, ref)
    );
    const engaged = perceptibleRefs.some((ref) =>
      ['current_matter', 'judgement_check', 'combat_event'].includes(ref.kind)
    );
    const status = engaged
      ? advanceEventStatus(intent.status, 'engaged')
      : perceptibleRefs.length > 0
        ? advanceEventStatus(intent.status, 'anchored')
        : advanceEventStatus(intent.status, 'seeking_anchor');
    const nextIntent: CustomEventEntryIntent = {
      ...intent,
      status,
      lastPlannedTurn: planned ? turnCounter : intent.lastPlannedTurn,
      lastConfirmedExposureTurn: turnCounter
    };
    priorityItems = withCompletedPriority(
      priorityItems,
      intent.instanceId,
      status === 'anchored' || status === 'engaged'
    );
    return nextIntent;
  });

  const progressedEventInstances = current.eventInstances.map((instance) => {
    if (!usedEventIds.has(instance.instanceId)) return { ...instance };
    const attributedAppliedRefs = eventAppliedRefs(instance.instanceId);
    const perceptibleRefs = attributedAppliedRefs.filter((ref) =>
      isPlayerPerceptibleRef(stateAfterWriteback, ref)
    );
    const engaged = perceptibleRefs.some((ref) =>
      ['current_matter', 'judgement_check', 'combat_event'].includes(ref.kind)
    );
    const intendedStatus = engaged
      ? 'active'
      : perceptibleRefs.length > 0
        ? 'anchored'
        : 'seeking_anchor';
    const binding = current.eventGroupBindings.find(
      (candidate) =>
        candidate.assetId === instance.eventGroupId &&
        candidate.revision === instance.eventGroupRevision
    );
    const nextInstance = {
      ...instance,
      status: nextEventInstanceStatus(instance.status, intendedStatus),
      resultingWritebackRefs: uniqueWritebackRefs([
        ...instance.resultingWritebackRefs,
        ...attributedAppliedRefs
      ]),
      primaryRuntimeArcRef: primaryRuntimeArcRef(
        instance.primaryRuntimeArcRef,
        perceptibleRefs
      )
    };
    return applyEventProgress({
      instance: nextInstance,
      payload: binding?.payload,
      progress: trace?.customEventProgress?.find(
        (candidate) => candidate.instanceId === instance.instanceId
      ),
      appliedRefs: attributedAppliedRefs,
      turnCounter
    });
  });
  const characterAdaptationIntents = [
    ...(current.characterAdaptationIntents ?? [])
  ];
  const eventInstances = progressedEventInstances.map((instance) => {
    const eventBinding = current.eventGroupBindings.find(
      (binding) =>
        binding.assetId === instance.eventGroupId &&
        binding.revision === instance.eventGroupRevision
    );
    if (!eventBinding) return instance;
    const stage = resolveCustomEventCurrentStage(eventBinding.payload, {
      currentStageId: instance.currentStageId,
      usedStageIds: instance.usedStageIds
    });
    const referencedIds = collectCustomEventStageCharacterAssetIds(
      eventBinding.payload,
      stage
    );
    const projectCharacterBindings = {
      ...instance.projectCharacterBindings
    };
    for (const characterAssetId of referencedIds) {
      const characterBinding = current.characterBindings.find(
        (binding) => binding.assetId === characterAssetId
      );
      if (!characterBinding) continue;
      const adaptation = Object.values(current.characterAdaptations).find(
        (candidate) =>
          candidate.characterAssetId === characterAssetId &&
          candidate.sourceRevision === characterBinding.revision
      );
      if (adaptation) {
        projectCharacterBindings[characterAssetId] =
          adaptation.runtimeActorId;
      }
      const intentId = [
        'adaptation-intent',
        instance.instanceId,
        characterAssetId,
        characterBinding.revision
      ].join(':');
      const incoming: CustomCharacterAdaptationIntent = {
        intentId,
        bindingId: characterBinding.bindingId,
        instanceId: instance.instanceId,
        reason: 'current_stage',
        status: adaptation?.status ?? 'pending',
        requestedStageId: stage?.stageId,
        requestedTurn: turnCounter,
        adaptationId: adaptation?.adaptationId
      };
      const existingIndex = characterAdaptationIntents.findIndex(
        (candidate) => candidate.intentId === intentId
      );
      if (existingIndex >= 0) {
        characterAdaptationIntents[existingIndex] = {
          ...characterAdaptationIntents[existingIndex],
          ...incoming,
          reason:
            characterAdaptationIntents[existingIndex].reason === 'manual'
              ? 'manual'
              : incoming.reason
        };
      } else {
        characterAdaptationIntents.push(incoming);
      }
    }
    const roleBindings = {
      ...instance.roleBindings
    };
    for (const slot of eventBinding.payload.roleSlots) {
      if (slot.bindingMode === 'current_player') {
        roleBindings[slot.roleSlotId] = stateAfterWriteback.player.actorId;
        continue;
      }
      const characterAssetId = slot.fixedCharacterRef?.assetId;
      const actorId = characterAssetId
        ? projectCharacterBindings[characterAssetId]
        : undefined;
      if (actorId) roleBindings[slot.roleSlotId] = actorId;
    }
    return {
      ...instance,
      projectCharacterBindings,
      roleBindings
    };
  });

  return {
    ...stateAfterWriteback,
    customContent: addPriorityOrders({
      ...current,
      characterEntryIntents,
      characterAdaptationIntents,
      eventEntryIntents,
      characterRuntimeBindings,
      eventInstances,
      priorityItems
    })
  };
}
