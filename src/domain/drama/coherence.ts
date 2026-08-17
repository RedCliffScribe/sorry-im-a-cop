import type { PromptContext } from '../context/selectContext';
import { dramaSourceKey, type DramaExposureEvidenceTextSignature, type DramaPlan, type DramaPlanOrigin, type DramaPlanningContext, type DramaSourceRef, type ForegroundContract, type PlanningSource } from './types';

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function shared(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

export function deriveDramaArcKey(source: PlanningSource): string {
  if (source.relatedCaseIds[0]) return `case:${source.relatedCaseIds[0]}`;
  if (source.ref.sourceType === 'current_matter') return `matter:${source.ref.sourceId}`;
  if (
    source.ref.sourceType === 'relationship_thread' ||
    source.ref.sourceType === 'relationship_heartbeat_candidate'
  ) {
    return `relationship:${source.ref.sourceId.split(':')[0]}`;
  }
  if (source.relatedActorIds[0]) return `actor:${source.relatedActorIds[0]}`;
  if (source.relatedOrganizationIds[0]) return `organization:${source.relatedOrganizationIds[0]}`;
  if (source.ref.sourceType === 'city_evolution') return `city:${source.ref.sourceId}`;
  return `source:${dramaSourceKey(source.ref)}`;
}

function cloneExposureSignature(
  signature: DramaExposureEvidenceTextSignature
): DramaExposureEvidenceTextSignature {
  return {
    allTerms: [...signature.allTerms],
    ...(signature.anyTerms ? { anyTerms: [...signature.anyTerms] } : {})
  };
}

function exposureSignatureKey(signature: DramaExposureEvidenceTextSignature): string {
  return JSON.stringify([
    [...signature.allTerms].sort(),
    [...(signature.anyTerms ?? [])].sort()
  ]);
}

export function deriveDramaArcKeyFromWritebackRef(ref: {
  kind: string;
  id: string;
}): string {
  if (ref.kind === 'case') return `case:${ref.id}`;
  if (ref.kind === 'current_matter') return `matter:${ref.id}`;
  if (ref.kind === 'relationship_thread') {
    return `relationship:${ref.id.split(':')[0]}`;
  }
  if (ref.kind === 'actor') return `actor:${ref.id}`;
  if (ref.kind === 'organization') return `organization:${ref.id}`;
  if (ref.kind === 'city_situation_track') return `city:${ref.id}`;
  return `runtime:${ref.kind}:${ref.id}`;
}

export function withDramaSourceCoherenceMetadata(source: PlanningSource): PlanningSource {
  return {
    ...source,
    exposureEvidenceTextSignatures: (source.exposureEvidenceTextSignatures ?? [])
      .map(cloneExposureSignature),
    arcKey: source.arcKey ?? deriveDramaArcKey(source),
    evidenceRefs: source.evidenceRefs?.length
      ? source.evidenceRefs.map((ref) => ({ ...ref }))
      : [{ ...source.ref }]
  };
}

function mergeSources(group: PlanningSource[]): PlanningSource {
  const ranked = [...group].sort(
    (left, right) =>
      Number(right.mandatory) - Number(left.mandatory) ||
      right.score - left.score ||
      dramaSourceKey(left.ref).localeCompare(dramaSourceKey(right.ref))
  );
  const representative = ranked[0];
  return {
    ...representative,
    arcKey: representative.arcKey ?? deriveDramaArcKey(representative),
    evidenceRefs: Array.from(
      new Map(
        ranked
          .flatMap((source) => source.evidenceRefs?.length ? source.evidenceRefs : [source.ref])
          .map((ref) => [dramaSourceKey(ref), { ...ref }])
      ).values()
    ),
    exposureEvidenceActorIds: unique(
      ranked.flatMap((source) => source.exposureEvidenceActorIds ?? [])
    ),
    exposureEvidenceTextSignatures: Array.from(
      new Map(
        ranked
          .flatMap((source) => source.exposureEvidenceTextSignatures ?? [])
          .map((signature) => [
            exposureSignatureKey(signature),
            cloneExposureSignature(signature)
          ])
      ).values()
    ),
    plannerSummary: unique(ranked.map((source) => source.plannerSummary).filter(Boolean)).slice(0, 2).join('；'),
    priorityClass: ranked.some((source) => source.priorityClass === 'user_requested')
      ? 'user_requested'
      : 'normal',
    channelIds: unique(ranked.flatMap((source) => source.channelIds)),
    mandatory: ranked.some((source) => source.mandatory),
    score: Math.max(...ranked.map((source) => source.score)),
    relatedActorIds: unique(ranked.flatMap((source) => source.relatedActorIds)),
    relatedOrganizationIds: unique(ranked.flatMap((source) => source.relatedOrganizationIds)),
    relatedPlaceIds: unique(ranked.flatMap((source) => source.relatedPlaceIds)),
    relatedCaseIds: unique(ranked.flatMap((source) => source.relatedCaseIds)),
    ...(ranked.some((source) => source.caseContinuityPolicy === 'reuse_linked_when_present')
      ? { caseContinuityPolicy: 'reuse_linked_when_present' as const }
      : representative.caseContinuityPolicy
        ? { caseContinuityPolicy: representative.caseContinuityPolicy }
        : {}),
    softAffinities: Object.fromEntries(
      unique(ranked.flatMap((source) => Object.keys(source.softAffinities))).map((key) => [
        key,
        unique(ranked.flatMap((source) => source.softAffinities[key] ?? []))
      ])
    )
  };
}

export function clusterDramaPlanningSources(sources: PlanningSource[]): PlanningSource[] {
  const groups = new Map<string, PlanningSource[]>();
  for (const rawSource of sources) {
    const source = withDramaSourceCoherenceMetadata(rawSource);
    const key = source.arcKey ?? deriveDramaArcKey(source);
    groups.set(key, [...(groups.get(key) ?? []), source]);
  }
  return Array.from(groups.values()).map(mergeSources);
}

export function sourcesShareHardRelation(left: PlanningSource, right: PlanningSource): boolean {
  return (
    (left.arcKey ?? deriveDramaArcKey(left)) === (right.arcKey ?? deriveDramaArcKey(right)) ||
    shared(left.relatedCaseIds, right.relatedCaseIds) ||
    shared(left.relatedActorIds, right.relatedActorIds) ||
    shared(left.relatedPlaceIds, right.relatedPlaceIds)
  );
}

function findCandidate(context: DramaPlanningContext, ref: DramaSourceRef): PlanningSource | undefined {
  const key = dramaSourceKey(ref);
  return [
    ...context.requiredContextSources,
    ...context.userPrioritySources,
    ...context.optionalDynamicSources,
    ...context.staticSeedSources,
    ...(context.officialDlcSources ?? [])
  ].find((source) => dramaSourceKey(source.ref) === key);
}

function sourceIds(refs: DramaSourceRef[], type: string): string[] {
  return unique(refs.filter((ref) => ref.sourceType === type).map((ref) => ref.sourceId.split(':')[0]));
}

export function createForegroundContract({
  context,
  promptContext,
  plan,
  origin
}: {
  context: DramaPlanningContext;
  promptContext: PromptContext;
  plan: DramaPlan;
  origin: DramaPlanOrigin;
}): ForegroundContract {
  const selectedRefs = [
    ...(plan.primarySource ? [plan.primarySource] : []),
    ...plan.supportSources
  ];
  const selectedSources = selectedRefs
    .map((ref) => findCandidate(context, ref))
    .filter((source): source is PlanningSource => Boolean(source));
  const primarySource = plan.primarySource
    ? findCandidate(context, plan.primarySource)
    : undefined;
  const mandatorySources = context.requiredContextSources;
  const evidenceRefs = Array.from(
    new Map(
      [...selectedSources, ...mandatorySources]
        .flatMap((source) => source.evidenceRefs?.length ? source.evidenceRefs : [source.ref])
        .map((ref) => [dramaSourceKey(ref), { ...ref }])
    ).values()
  );
  const presentActorIds = promptContext.presentActors.map((actor) => actor.actorId);
  const currentPlaceId = promptContext.currentPlace?.placeId;
  return {
    planId: plan.planId,
    mode: plan.mode,
    origin,
    primaryArcKey: primarySource?.arcKey,
    selectedSourceRefs: selectedRefs.map((ref) => ({ ...ref })),
    evidenceSourceRefs: evidenceRefs,
    mandatorySourceRefs: mandatorySources.map((source) => ({ ...source.ref })),
    allowedActorIds: unique([
      ...presentActorIds,
      ...selectedSources.flatMap((source) => source.relatedActorIds),
      ...mandatorySources.flatMap((source) => source.relatedActorIds)
    ]),
    allowedOrganizationIds: unique([
      ...selectedSources.flatMap((source) => source.relatedOrganizationIds),
      ...mandatorySources.flatMap((source) => source.relatedOrganizationIds)
    ]),
    allowedPlaceIds: unique([
      ...(currentPlaceId ? [currentPlaceId] : []),
      ...selectedSources.flatMap((source) => source.relatedPlaceIds),
      ...mandatorySources.flatMap((source) => source.relatedPlaceIds)
    ]),
    allowedCaseIds: unique([
      ...selectedSources.flatMap((source) => source.relatedCaseIds),
      ...mandatorySources.flatMap((source) => source.relatedCaseIds)
    ]),
    ...(primarySource?.caseContinuityPolicy
      ? {
          caseContinuityPolicy: primarySource.caseContinuityPolicy,
          caseContinuityCaseIds: unique(primarySource.relatedCaseIds)
        }
      : {}),
    allowedMatterIds: sourceIds(evidenceRefs, 'current_matter'),
    allowedRelationshipThreadIds: unique([
      ...sourceIds(evidenceRefs, 'relationship_thread'),
      ...sourceIds(evidenceRefs, 'relationship_heartbeat_candidate')
    ]),
    allowedCityTrackIds: sourceIds(evidenceRefs, 'city_evolution'),
    maxForegroundArcs: unique(selectedSources.map((source) => source.arcKey ?? deriveDramaArcKey(source))).length,
    maxNewActors: plan.maxNewActors,
    maxNewDurableThreads: plan.mode === 'quiet' ? 0 : 1
  };
}

/**
 * Keep mandatory time/scene/player context intact and narrow only the
 * high-noise foreground projections. The original projection remains the
 * source of truth and is not mutated.
 */
export function focusPromptContext(
  context: PromptContext,
  contract: ForegroundContract | undefined
): PromptContext {
  if (!contract) return context;
  const actorIds = new Set(contract.allowedActorIds);
  const caseIds = new Set(contract.allowedCaseIds);
  const matterIds = new Set(contract.allowedMatterIds);
  const relationshipIds = new Set(contract.allowedRelationshipThreadIds);
  const organizationIds = new Set(contract.allowedOrganizationIds);
  const cityTrackIds = new Set(contract.allowedCityTrackIds);

  const presentCandidates = context.presentActorReactionProjection.candidates
    .filter((candidate) => actorIds.has(candidate.actorId))
    .slice(0, 1);
  const remoteCandidates = context.remoteNpcPresenceProjection.candidates
    .filter((candidate) => actorIds.has(candidate.actorId))
    .slice(0, 1);
  const npcMemoryEntries = context.npcMemoryProjection.entries.filter((entry) => actorIds.has(entry.actorId));
  const relationshipThreads = context.relationshipProjection.threads.filter(
    (thread) => relationshipIds.has(thread.threadId) || thread.relatedActorIds.some((actorId) => actorIds.has(actorId))
  );
  const relationshipHeartbeatCandidates = context.relationshipProjection.heartbeatCandidates.filter(
    (candidate) => relationshipIds.has(candidate.threadId)
  );
  const currentMatters = context.dynamicProjection.currentMatters.filter(
    (matter) =>
      matterIds.has(matter.id) ||
      context.dynamicProjection.diagnostics.dueCurrentMatterIds.includes(matter.id)
  );
  const backgroundNpcActions = context.backgroundEvolutionProjection.activeNpcActions.filter(
    (item) => actorIds.has(item.actorId)
  );
  const backgroundOrganizationActions = context.backgroundEvolutionProjection.activeOrganizationActions.filter(
    (item) => organizationIds.has(item.organizationId)
  );
  const backgroundOutcomes = context.backgroundEvolutionProjection.recentOutcomes.filter(
    (item) =>
      item.relatedActorIds.some((actorId) => actorIds.has(actorId)) ||
      item.relatedOrganizationIds.some((organizationId) => organizationIds.has(organizationId)) ||
      item.relatedCaseIds.some((caseId) => caseIds.has(caseId))
  );
  const cityTracks = context.citySituationTrackProjection.tracks.filter((track) => cityTrackIds.has(track.trackId));

  return {
    ...context,
    relevantCases: caseIds.size
      ? context.relevantCases.filter((caseFile) => caseIds.has(caseFile.caseId))
      : context.relevantCases.slice(0, 1),
    presentActorReactionProjection: {
      ...context.presentActorReactionProjection,
      candidates: presentCandidates,
      diagnostics: {
        ...context.presentActorReactionProjection.diagnostics,
        selectedActorIds: presentCandidates.map((candidate) => candidate.actorId),
        omittedActorCount:
          context.presentActorReactionProjection.diagnostics.omittedActorCount +
          Math.max(0, context.presentActorReactionProjection.candidates.length - presentCandidates.length)
      }
    },
    remoteNpcPresenceProjection: {
      ...context.remoteNpcPresenceProjection,
      candidates: remoteCandidates,
      diagnostics: {
        ...context.remoteNpcPresenceProjection.diagnostics,
        selectedActorIds: remoteCandidates.map((candidate) => candidate.actorId),
        selectedCandidateIds: remoteCandidates.map((candidate) => `${candidate.source}:${candidate.sourceId}`),
        omittedCandidateCount:
          context.remoteNpcPresenceProjection.diagnostics.omittedCandidateCount +
          Math.max(0, context.remoteNpcPresenceProjection.candidates.length - remoteCandidates.length)
      }
    },
    npcMemoryProjection: {
      ...context.npcMemoryProjection,
      entries: npcMemoryEntries,
      diagnostics: {
        ...context.npcMemoryProjection.diagnostics,
        selectedMemoryIds: npcMemoryEntries.map((entry) => entry.memoryId),
        selectedActorIds: unique(npcMemoryEntries.map((entry) => entry.actorId)),
        omittedMemoryCount:
          context.npcMemoryProjection.diagnostics.omittedMemoryCount +
          Math.max(0, context.npcMemoryProjection.entries.length - npcMemoryEntries.length)
      }
    },
    relationshipProjection: {
      ...context.relationshipProjection,
      threads: relationshipThreads,
      heartbeatCandidates: relationshipHeartbeatCandidates,
      diagnostics: {
        ...context.relationshipProjection.diagnostics,
        projectedThreadCount: relationshipThreads.length,
        projectedThreadIds: relationshipThreads.map((thread) => thread.threadId),
        heartbeatCandidateCount: relationshipHeartbeatCandidates.length,
        heartbeatCandidateThreadIds: relationshipHeartbeatCandidates.map((candidate) => candidate.threadId)
      }
    },
    dynamicProjection: {
      ...context.dynamicProjection,
      currentMatters,
      diagnostics: {
        ...context.dynamicProjection.diagnostics,
        projectedCurrentMatterCount: currentMatters.length,
        currentMatterIds: currentMatters.map((matter) => matter.id)
      }
    },
    backgroundEvolutionProjection: {
      ...context.backgroundEvolutionProjection,
      activeNpcActions: backgroundNpcActions,
      activeOrganizationActions: backgroundOrganizationActions,
      recentOutcomes: backgroundOutcomes
    },
    citySituationTrackProjection: {
      ...context.citySituationTrackProjection,
      tracks: cityTracks,
      diagnostics: {
        ...context.citySituationTrackProjection.diagnostics,
        selectedTrackIds: cityTracks.map((track) => track.trackId)
      }
    }
  };
}
