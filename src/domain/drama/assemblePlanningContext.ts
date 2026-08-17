import type { PromptContext } from '../context/selectContext';
import type { RuntimeState } from '../runtime/types';
import { deriveCanonicalPlayerRoleContext } from './playerRoleContext';
import { resolveDramaMaterialBudget } from './settings';
import { isDramaSourceAlreadyConsumed, listProjectedDramaSources } from './sourceRegistry';
import { clusterDramaPlanningSources } from './coherence';
import {
  buildNarrativeArcPlanningSources,
  buildNarrativeArcSummaries,
  filterCompletedNarrativeArcSources
} from './narrativeArc';
import { dramaSourceKey, type DramaPlanningContext, type DramaticContentSettings, type PlanningSource } from './types';

const channelWeights = {
  off: 0,
  low: 0.75,
  medium: 1,
  high: 1.25
} as const;

const customContentProviderIds = new Set([
  'custom-character',
  'custom-event-group'
]);

function isStatic(source: PlanningSource): boolean {
  return (
    source.sourceStatus === 'static_seed' ||
    (
      source.priorityClass === 'normal' &&
      customContentProviderIds.has(source.ref.providerId) &&
      source.sourceStatus === 'undecided_suggestion'
    )
  );
}

function channelWeight(source: PlanningSource, settings: DramaticContentSettings): number {
  return Math.max(...source.channelIds.map((channelId) => channelWeights[settings.channels[channelId]]));
}

function continuityPenalty(state: RuntimeState, source: PlanningSource): number {
  if (source.mandatory || source.priorityClass === 'user_requested') return 0;
  const evidenceKeys = new Set(
    (source.evidenceRefs?.length ? source.evidenceRefs : [source.ref]).map(dramaSourceKey)
  );
  let closestDistance: number | undefined;
  for (const receipt of state.dramaticContent?.recentExecutions ?? []) {
    const refs = receipt.usedSourceRefs;
    if (!refs.some((ref) => evidenceKeys.has(dramaSourceKey(ref)))) continue;
    const distance = Math.max(0, state.turnCounter - receipt.turnCounter);
    closestDistance = closestDistance === undefined ? distance : Math.min(closestDistance, distance);
  }
  if (closestDistance === undefined) return 0;
  if (closestDistance <= 1) return 90;
  if (closestDistance === 2) return 60;
  if (closestDistance <= 4) return 30;
  if (closestDistance <= 6) return 12;
  return 0;
}

export function allDramaPlanningSources(context: DramaPlanningContext): PlanningSource[] {
  return [
    ...context.requiredContextSources,
    ...context.userPrioritySources,
    ...context.optionalDynamicSources,
    ...context.staticSeedSources,
    ...(context.officialDlcSources ?? [])
  ];
}

function selectCandidates(
  state: RuntimeState,
  context: PromptContext,
  settings: DramaticContentSettings,
  exposedArcSources: readonly PlanningSource[] = []
): {
  required: PlanningSource[];
  userPriority: PlanningSource[];
  optionalDynamic: PlanningSource[];
  staticSources: PlanningSource[];
  filterRuleIds: string[];
} {
  const budget = resolveDramaMaterialBudget(settings);
  const exposedArcKeys = new Set(
    exposedArcSources.map((source) => source.arcKey ?? dramaSourceKey(source.ref))
  );
  const rawProjectedSources = listProjectedDramaSources(context);
  const availableProjectedSources = filterCompletedNarrativeArcSources(
    state,
    rawProjectedSources
  );
  const projectedSources = Array.from(
    new Map(
      [
        ...availableProjectedSources.filter((source) => {
          const sourceKey = source.arcKey ?? dramaSourceKey(source.ref);
          return !exposedArcKeys.has(sourceKey);
        }),
        ...exposedArcSources
      ].map((source) => [dramaSourceKey(source.ref), source] as const)
    ).values()
  );
  const consumed = projectedSources.filter((source) =>
    isDramaSourceAlreadyConsumed(state, source)
  );
  const channelBlocked = projectedSources.filter(
    (source) =>
      !source.mandatory &&
      source.priorityClass !== 'user_requested' &&
      source.channelIds.every((channelId) => settings.channels[channelId] === 'off')
  );
  const allSources = clusterDramaPlanningSources(
    projectedSources
    .filter((source) => !consumed.includes(source))
    .filter((source) => !channelBlocked.includes(source))
  );
  const cooledSources = allSources.filter((source) => continuityPenalty(state, source) > 0);
  const candidates = allSources
    .map((source) => ({
      ...source,
      score: source.mandatory
        ? source.score + 1_000
        : source.priorityClass === 'user_requested'
          ? source.score
          : source.score * channelWeight(source, settings) - continuityPenalty(state, source)
    }));
  const required = candidates
    .filter((source) => source.mandatory)
    .sort((left, right) => right.score - left.score);
  const userPriority = candidates
    .filter(
      (source) =>
        !source.mandatory && source.priorityClass === 'user_requested'
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
  const optionalDynamic = candidates
    .filter(
      (source) =>
        !source.mandatory &&
        source.priorityClass === 'normal' &&
        !isStatic(source)
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, budget.dynamicLimit);
  const staticSources = candidates
    .filter(
      (source) =>
        !source.mandatory &&
        source.priorityClass === 'normal' &&
        isStatic(source)
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, budget.staticLimit);
  const filterRuleIds = [
    ...(availableProjectedSources.length < rawProjectedSources.length
      ? ['narrative_arc.completed_source']
      : []),
    ...(consumed.length > 0 ? ['reuse.save_single_used'] : []),
    ...Array.from(new Set(channelBlocked.flatMap((source) => source.channelIds.map((channelId) => `channel.${channelId}.off`)))),
    ...(candidates.filter(
      (source) =>
        !source.mandatory &&
        source.priorityClass === 'normal' &&
        !isStatic(source)
    ).length > optionalDynamic.length
      ? ['budget.dynamic']
      : []),
    ...(candidates.filter(
      (source) =>
        !source.mandatory &&
        source.priorityClass === 'normal' &&
        isStatic(source)
    ).length > staticSources.length
      ? ['budget.static']
      : []),
    ...(projectedSources.length >
      allSources.length + consumed.length + channelBlocked.length
      ? ['cluster.same_arc']
      : []),
    ...(cooledSources.length > 0 ? ['continuity.cooldown'] : [])
  ];
  if (context.screenCharacterSeedProjection.characters.length === 0) {
    filterRuleIds.push('world.screen_characters.no_candidates');
  }
  if (context.storypackProjection.cards.length === 0) {
    filterRuleIds.push('world.storypack.no_candidates');
  }
  return {
    required,
    userPriority,
    optionalDynamic,
    staticSources,
    filterRuleIds
  };
}

export function assembleDramaPlanningContext(
  state: RuntimeState,
  context: PromptContext,
  settings: DramaticContentSettings,
  playerInput?: string,
  planningMode: DramaPlanningContext['planningMode'] = 'full'
): DramaPlanningContext {
  const customIntentOnly = planningMode === 'custom_intent_only';
  const exposedArcSources = buildNarrativeArcPlanningSources(
    state,
    listProjectedDramaSources(context)
  );
  const selection = selectCandidates(state, context, settings, exposedArcSources);
  return {
    planningScope: 'turn',
    planningMode,
    planningRoute: planningMode === 'custom_intent_only' ? 'custom_intent_only' : 'auto',
    turnCounter: state.turnCounter,
    currentTime: { ...state.time },
    playerInput,
    playerRoleContext: deriveCanonicalPlayerRoleContext(state),
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
    settings,
    pacing: settings.pacing,
    materialBudget: resolveDramaMaterialBudget(settings),
    recentTurnSummaries: context.recentStoryProjection.summaryEntries.map((entry) => ({
      turnId: entry.turnId,
      summary: entry.summaryText
    })),
    requiredContextSources: selection.required,
    userPrioritySources: selection.userPriority,
    // A custom-intent route still carries already-exposed arcs as compact
    // continuation candidates; it must not re-open the full ordinary pool.
    optionalDynamicSources: customIntentOnly ? exposedArcSources : selection.optionalDynamic,
    staticSeedSources: customIntentOnly ? [] : selection.staticSources,
    narrativeArcSummaries: buildNarrativeArcSummaries(state),
    recentExecutions: [...(state.dramaticContent?.recentExecutions ?? [])],
    filterRuleIds: selection.filterRuleIds
  };
}

const officialDlcSourceTypeOrder: Record<string, number> = {
  official_dlc_event: 0,
  official_dlc_news: 1,
  official_dlc_character: 2
};

const officialDlcDynamicProviderIds = new Set([
  'runtime-dynamic',
  'runtime-relationship',
  'runtime-case',
  'runtime-evolution',
  'livelihood'
]);

function compactOfficialDlcSources(sources: readonly PlanningSource[]): PlanningSource[] {
  return [...sources]
    .sort((left, right) =>
      (officialDlcSourceTypeOrder[left.ref.sourceType] ?? 99) -
        (officialDlcSourceTypeOrder[right.ref.sourceType] ?? 99) ||
      right.score - left.score ||
      left.ref.sourceId.localeCompare(right.ref.sourceId)
    )
    .slice(0, 4)
    .map((source) => ({
      ...source,
      channelIds: [...source.channelIds],
      relatedActorIds: [...source.relatedActorIds],
      relatedOrganizationIds: [...source.relatedOrganizationIds],
      relatedPlaceIds: [...source.relatedPlaceIds],
      relatedCaseIds: [...source.relatedCaseIds],
      exposureEvidenceActorIds: [...(source.exposureEvidenceActorIds ?? [])],
      exposureEvidenceTextSignatures: (source.exposureEvidenceTextSignatures ?? []).map(
        (signature) => ({
          allTerms: [...signature.allTerms],
          ...(signature.anyTerms ? { anyTerms: [...signature.anyTerms] } : {})
        })
      ),
      softAffinities: Object.fromEntries(
        Object.entries(source.softAffinities).map(([key, values]) => [key, [...values]])
      )
    }));
}

/**
 * Builds the original-pacing official-DLC route. Only a compact set of DLC
 * sources plus hard/current dynamic context is exposed; Storypack, screen
 * seeds, custom content and other static pools are intentionally omitted.
 */
export function assembleOfficialDlcPlanningContext(
  state: RuntimeState,
  context: PromptContext,
  settings: DramaticContentSettings,
  playerInput: string | undefined,
  officialSources: readonly PlanningSource[]
): DramaPlanningContext {
  const selection = selectCandidates(state, context, settings);
  const required = selection.required.filter((source) =>
    officialDlcDynamicProviderIds.has(source.ref.providerId)
  );
  const optionalDynamic = selection.optionalDynamic.filter((source) =>
    officialDlcDynamicProviderIds.has(source.ref.providerId)
  );
  const availableOfficialSources = filterCompletedNarrativeArcSources(state, officialSources);
  // A persisted arc is stronger evidence than the provider's first-exposure
  // projection. Overlay its compact current-stage source defensively so even a
  // stale planning-intent history cannot resolve execution with the initial
  // stage contract and move an existing arc backwards.
  const continuationSources = buildNarrativeArcPlanningSources(
    state,
    availableOfficialSources,
    availableOfficialSources.length
  );
  const continuationBySourceKey = new Map(
    continuationSources.map((source) => [dramaSourceKey(source.ref), source] as const)
  );
  const currentStageAwareSources = availableOfficialSources.map(
    (source) => continuationBySourceKey.get(dramaSourceKey(source.ref)) ?? source
  );
  const compactSources = compactOfficialDlcSources(currentStageAwareSources);
  const omitted = Math.max(0, availableOfficialSources.length - compactSources.length);
  const completedArcSourcesOmitted = officialSources.length - availableOfficialSources.length;
  return {
    planningScope: 'turn',
    planningMode: 'official_dlc_only',
    planningRoute: 'official_dlc_only',
    turnCounter: state.turnCounter,
    currentTime: { ...state.time },
    playerInput,
    playerRoleContext: deriveCanonicalPlayerRoleContext(state),
    currentPlaceId: state.location.currentPlaceId,
    currentSceneId: state.location.currentSceneId,
    settings,
    pacing: settings.pacing,
    materialBudget: resolveDramaMaterialBudget(settings),
    recentTurnSummaries: context.recentStoryProjection.summaryEntries.map((entry) => ({
      turnId: entry.turnId,
      summary: entry.summaryText
    })),
    requiredContextSources: required,
    userPrioritySources: [],
    optionalDynamicSources: optionalDynamic,
    staticSeedSources: [],
    officialDlcSources: compactSources,
    narrativeArcSummaries: buildNarrativeArcSummaries(state),
    recentExecutions: [...(state.dramaticContent?.recentExecutions ?? [])],
    filterRuleIds: [
      ...selection.filterRuleIds,
      'planning.official_dlc_only',
      ...(completedArcSourcesOmitted > 0 ? ['narrative_arc.completed_source'] : []),
      ...(omitted > 0 ? ['planning.official_dlc_compact'] : [])
    ]
  };
}
