import type {
  ActorId,
  CaseFile,
  CitySituationTrack,
  GameTime,
  NpcEvolutionTrack,
  OrganizationEvolutionTrack,
  RuntimeState
} from '../runtime/types';
import { getCurrentAreaId } from '../grayNetwork/grayNetwork';
import { compareGameTimes, elapsedGameHours, gameDateKey, gameTimeKey } from './time';
import type { ForegroundEvolutionDelta } from './foregroundDelta';

export const MAX_BACKGROUND_NPC_CANDIDATES = 4;
export const MAX_BACKGROUND_ORGANIZATION_CANDIDATES = 2;
export const MAX_BACKGROUND_CITY_CANDIDATES = 3;
export const MAX_BACKGROUND_CASE_CONTEXTS = 2;
export const MIN_BACKGROUND_REVIEW_HOURS = 6;
export const MIN_BACKGROUND_ORGANIZATION_REVIEW_HOURS = 24;

export interface BackgroundNpcCandidate {
  actorId: ActorId;
  trackId?: string;
  reviewKey: string;
  trigger: 'due' | 'foreground-impact' | 'case-lead' | 'relationship';
  allowMaterialProgress: boolean;
  relatedCaseIds: string[];
  relatedRelationshipThreadIds: string[];
}

export interface BackgroundCityCandidate {
  trackId: string;
  reviewKey: string;
  trigger: 'due' | 'foreground-impact';
}

export interface BackgroundOrganizationCandidate {
  organizationId: string;
  trackId?: string;
  reviewKey: string;
  trigger:
    | 'due'
    | 'foreground-impact'
    | 'player-link'
    | 'case-link'
    | 'place-link'
    | 'relationship-link'
    | 'gray-network';
  allowMaterialProgress: boolean;
  allowPlayerStanceChange: boolean;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  relatedCityTrackIds: string[];
}

export interface BackgroundEvolutionSelection {
  reason: 'due' | 'foreground-impact' | 'time-jump' | 'manual';
  npcCandidates: BackgroundNpcCandidate[];
  organizationCandidates: BackgroundOrganizationCandidate[];
  cityCandidates: BackgroundCityCandidate[];
  selectedReviewKeys: string[];
  excludedActorIds: string[];
  foregroundTouchedCaseIds: string[];
  foregroundTouchedRelationshipThreadIds: string[];
  foregroundTouchedCityTrackIds: string[];
  foregroundTouchedOrganizationIds: string[];
  foregroundDelta?: ForegroundEvolutionDelta;
  truncatedNpcCount: number;
  truncatedOrganizationCount: number;
  truncatedCityCount: number;
}

export interface SelectBackgroundEvolutionCandidatesInput {
  state: RuntimeState;
  previousTime?: GameTime;
  foregroundTurnId: string;
  foregroundTouchedActorIds?: Iterable<string>;
  foregroundTouchedCaseIds?: Iterable<string>;
  foregroundTouchedRelationshipThreadIds?: Iterable<string>;
  foregroundTouchedCityTrackIds?: Iterable<string>;
  foregroundTouchedOrganizationIds?: Iterable<string>;
  foregroundDelta?: ForegroundEvolutionDelta;
  manual?: boolean;
}

const inactiveCaseStatuses = new Set<CaseFile['status']>(['sentenced', 'archived', 'cold']);
const activeNpcTrackStatuses = new Set<NpcEvolutionTrack['status']>(['planned', 'active', 'blocked']);
const activeOrganizationTrackStatuses = new Set<OrganizationEvolutionTrack['status']>(['planned', 'active', 'blocked']);

function isRemoteActor(state: RuntimeState, actorId: string, excluded: Set<string>): boolean {
  if (actorId === state.player.actorId || actorId === 'player' || excluded.has(actorId)) return false;
  const actor = state.actors[actorId];
  return Boolean(actor && actor.presence !== 'present' && actor.presence !== 'nearby');
}

function collectExcludedActorIds(state: RuntimeState, foregroundIds: Iterable<string> | undefined): Set<string> {
  const excluded = new Set<string>(foregroundIds ?? []);
  excluded.add(state.player.actorId);
  excluded.add('player');
  for (const actor of Object.values(state.actors)) {
    if (actor.presence === 'present' || actor.presence === 'nearby') excluded.add(actor.actorId);
  }
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  for (const actorId of scene?.presentActorIds ?? []) excluded.add(actorId);
  return excluded;
}

function isDue(time: GameTime | undefined, now: GameTime): boolean {
  return Boolean(time && compareGameTimes(time, now) <= 0);
}

function hasDueRelatedDeferredEvent(state: RuntimeState, actorId: string, caseIds: string[]): boolean {
  return Object.values(state.deferredEvents).some(
    (event) =>
      event.status === 'pending' &&
      isDue(event.triggerAt, state.time) &&
      (event.relatedIds.actorId === actorId || Boolean(event.relatedIds.caseId && caseIds.includes(event.relatedIds.caseId)))
  );
}

function latestGeneralReviewAllowsNewActor(state: RuntimeState): boolean {
  const lastAppliedAt =
    state.backgroundEvolution.lastAppliedAt ??
    (state.backgroundEvolution.lastRun?.status === 'succeeded' ? state.backgroundEvolution.lastRun.finishedAt : undefined);
  if (!lastAppliedAt) return true;
  return elapsedGameHours(lastAppliedAt, state.time) >= MIN_BACKGROUND_REVIEW_HOURS;
}

function activeTrackByActor(state: RuntimeState): Map<string, NpcEvolutionTrack> {
  const result = new Map<string, NpcEvolutionTrack>();
  for (const track of Object.values(state.backgroundEvolution.npcTracks)) {
    if (!activeNpcTrackStatuses.has(track.status)) continue;
    if (!result.has(track.actorId)) result.set(track.actorId, track);
  }
  return result;
}

function organizationTrackByOrganization(state: RuntimeState): Map<string, OrganizationEvolutionTrack> {
  return new Map(
    Object.values(state.backgroundEvolution.organizationTracks ?? {}).map((track) => [track.organizationId, track])
  );
}

function caseIdsForActor(state: RuntimeState, actorId: string): string[] {
  return Object.values(state.cases)
    .filter((caseFile) => caseFile.leadActorId === actorId && !inactiveCaseStatuses.has(caseFile.status))
    .sort((left, right) => compareGameTimes(right.updatedAt, left.updatedAt) || left.caseId.localeCompare(right.caseId))
    .map((caseFile) => caseFile.caseId);
}

function relationshipIdsForActor(state: RuntimeState, actorId: string): string[] {
  return Object.values(state.relationshipThreads)
    .filter((thread) => thread.status === 'active' || thread.status === 'strained')
    .filter((thread) => thread.primaryActorId === actorId || thread.relatedActorIds.includes(actorId))
    .filter((thread) => Boolean(thread.currentPull || thread.promiseSummary || thread.conflictSummary || thread.riskSummary || thread.nextNaturalBeatHint))
    .sort((left, right) => compareGameTimes(right.updatedAt, left.updatedAt) || left.threadId.localeCompare(right.threadId))
    .map((thread) => thread.threadId);
}

function scheduledReviewTime(track: Pick<NpcEvolutionTrack, 'nextReviewAt'>, now: GameTime): GameTime {
  if (compareGameTimes(track.nextReviewAt, now) <= 0) return track.nextReviewAt;
  return now;
}

function cityScheduledReviewTime(track: CitySituationTrack, now: GameTime): GameTime {
  return track.nextReviewAt && compareGameTimes(track.nextReviewAt, now) <= 0 ? track.nextReviewAt : now;
}

function createReviewKey(kind: 'npc' | 'organization' | 'city', sourceId: string, scheduledAt: GameTime, foregroundTurnId: string): string {
  return `${kind}:${sourceId}:${gameTimeKey(scheduledAt)}:${foregroundTurnId}`;
}

function visibleOrganizationRelation(state: RuntimeState, actorId: string, organizationId: string): boolean {
  return Boolean(
    state.actors[actorId]?.organizationRelations.some(
      (relation) => relation.organizationId === organizationId && relation.visibility !== 'hidden'
    )
  );
}

function activeCaseIdsForOrganization(state: RuntimeState, organizationId: string): string[] {
  return Object.values(state.cases)
    .filter((caseFile) => !inactiveCaseStatuses.has(caseFile.status))
    .filter((caseFile) => caseFile.playerRole !== 'aware')
    .filter((caseFile) => caseFile.relatedOrganizationIds.includes(organizationId))
    .sort((left, right) => compareGameTimes(right.updatedAt, left.updatedAt) || left.caseId.localeCompare(right.caseId))
    .map((caseFile) => caseFile.caseId);
}

function relationshipActorIdsForOrganization(state: RuntimeState, organizationId: string): string[] {
  const actorIds = new Set<string>();
  for (const thread of Object.values(state.relationshipThreads)) {
    if (thread.status !== 'active' && thread.status !== 'strained') continue;
    for (const actorId of [thread.primaryActorId, ...thread.relatedActorIds]) {
      if (actorId && visibleOrganizationRelation(state, actorId, organizationId)) actorIds.add(actorId);
    }
  }
  return [...actorIds];
}

function visibleGrayNetworkOrganizationIds(state: RuntimeState): Set<string> {
  const profile = state.grayNetworks?.byAreaId[getCurrentAreaId(state)];
  const identity = state.player.currentIdentity;
  return new Set(
    (profile?.knownOrganizations ?? [])
      .filter((item) => item.organizationId && item.visibility[identity] !== 'hidden')
      .map((item) => item.organizationId!)
  );
}

function organizationCandidateContext(state: RuntimeState, organizationId: string) {
  const organization = state.organizations[organizationId];
  const relationshipActorIds = relationshipActorIdsForOrganization(state, organizationId);
  const relationActorIds = Object.values(state.actors)
    .filter((actor) => visibleOrganizationRelation(state, actor.actorId, organizationId))
    .map((actor) => actor.actorId);
  const relatedActorIds = [...new Set([...(organization?.relatedActorIds ?? []), ...relationshipActorIds, ...relationActorIds])]
    .filter((actorId) => actorId !== state.player.actorId && actorId !== 'player' && Boolean(state.actors[actorId]))
    .slice(0, 4);
  const relatedCaseIds = [...new Set([...(organization?.relatedCaseIds ?? []), ...activeCaseIdsForOrganization(state, organizationId)])]
    .filter((caseId) => Boolean(state.cases[caseId]) && !inactiveCaseStatuses.has(state.cases[caseId].status))
    .slice(0, 2);
  const relatedPlaceIds = [...new Set([
    ...(organization?.relatedPlaceIds ?? []),
    ...Object.values(state.places)
      .filter((place) => place.owningOrganizationId === organizationId)
      .map((place) => place.placeId)
  ])]
    .filter((placeId) => Boolean(state.places[placeId]))
    .slice(0, 3);
  const relatedCityTrackIds = Object.values(state.citySituationTracks)
    .filter((track) => track.status !== 'resolved' && track.relatedOrganizationIds.includes(organizationId))
    .sort((left, right) => compareGameTimes(left.nextReviewAt ?? state.time, right.nextReviewAt ?? state.time))
    .map((track) => track.trackId)
    .slice(0, 2);
  return { relatedActorIds, relatedCaseIds, relatedPlaceIds, relatedCityTrackIds, relationshipActorIds };
}

export function selectBackgroundEvolutionCandidates({
  state,
  previousTime,
  foregroundTurnId,
  foregroundTouchedActorIds,
  foregroundTouchedCaseIds,
  foregroundTouchedRelationshipThreadIds,
  foregroundTouchedCityTrackIds,
  foregroundTouchedOrganizationIds,
  foregroundDelta,
  manual = false
}: SelectBackgroundEvolutionCandidatesInput): BackgroundEvolutionSelection {
  const touchedActors = new Set(foregroundTouchedActorIds ?? []);
  const touchedCases = new Set(foregroundTouchedCaseIds ?? []);
  const touchedRelationships = new Set(foregroundTouchedRelationshipThreadIds ?? []);
  const touchedCityTracks = new Set(foregroundTouchedCityTrackIds ?? []);
  const touchedOrganizations = new Set(foregroundTouchedOrganizationIds ?? []);
  const excludedActors = collectExcludedActorIds(state, touchedActors);
  const trackByActor = activeTrackByActor(state);
  const npcCandidates = new Map<string, BackgroundNpcCandidate>();

  for (const track of Object.values(state.backgroundEvolution.npcTracks)) {
    if (!activeNpcTrackStatuses.has(track.status) || !isRemoteActor(state, track.actorId, excludedActors)) continue;
    const due = isDue(track.nextReviewAt, state.time) || isDue(track.expectedEndAt, state.time);
    const affected =
      touchedActors.has(track.actorId) ||
      track.relatedCaseIds.some((id) => touchedCases.has(id)) ||
      track.relatedRelationshipThreadIds.some((id) => touchedRelationships.has(id)) ||
      track.relatedCityTrackIds.some((id) => touchedCityTracks.has(id));
    if (!due && !affected && !manual) continue;
    const relatedCaseIds = [...new Set([...track.relatedCaseIds, ...caseIdsForActor(state, track.actorId)])];
    const relatedRelationshipThreadIds = [
      ...new Set([...track.relatedRelationshipThreadIds, ...relationshipIdsForActor(state, track.actorId)])
    ];
    const caseAlreadyAdvancedToday = Boolean(
      relatedCaseIds.length > 0 && track.lastEvolvedAt && gameDateKey(track.lastEvolvedAt) === gameDateKey(state.time)
    );
    npcCandidates.set(track.actorId, {
      actorId: track.actorId,
      trackId: track.trackId,
      reviewKey: createReviewKey('npc', track.trackId, scheduledReviewTime(track, state.time), foregroundTurnId),
      trigger: due ? 'due' : 'foreground-impact',
      allowMaterialProgress:
        due &&
        !caseAlreadyAdvancedToday &&
        !relatedCaseIds.some((caseId) => touchedCases.has(caseId)) &&
        (!track.lastEvolvedAt || elapsedGameHours(track.lastEvolvedAt, state.time) >= MIN_BACKGROUND_REVIEW_HOURS ||
          hasDueRelatedDeferredEvent(state, track.actorId, relatedCaseIds)),
      relatedCaseIds,
      relatedRelationshipThreadIds
    });
  }

  const allowNewActorReview = latestGeneralReviewAllowsNewActor(state) || manual;
  for (const caseFile of Object.values(state.cases)) {
    const actorId = caseFile.leadActorId;
    if (!actorId || inactiveCaseStatuses.has(caseFile.status) || trackByActor.has(actorId)) continue;
    if (!isRemoteActor(state, actorId, excludedActors)) continue;
    if (!allowNewActorReview && !touchedCases.has(caseFile.caseId)) continue;
    const existing = npcCandidates.get(actorId);
    const relatedCaseIds = [...new Set([...(existing?.relatedCaseIds ?? []), ...caseIdsForActor(state, actorId)])];
    npcCandidates.set(actorId, {
      actorId,
      reviewKey: existing?.reviewKey ?? createReviewKey('npc', actorId, state.time, foregroundTurnId),
      trigger: touchedCases.has(caseFile.caseId) ? 'foreground-impact' : 'case-lead',
      allowMaterialProgress: false,
      relatedCaseIds,
      relatedRelationshipThreadIds: relationshipIdsForActor(state, actorId)
    });
  }

  for (const thread of Object.values(state.relationshipThreads)) {
    if ((thread.status !== 'active' && thread.status !== 'strained') || !thread.primaryActorId) continue;
    if (!thread.currentPull && !thread.promiseSummary && !thread.conflictSummary && !thread.riskSummary && !thread.nextNaturalBeatHint) continue;
    const actorId = thread.primaryActorId;
    if (trackByActor.has(actorId) || npcCandidates.has(actorId) || !isRemoteActor(state, actorId, excludedActors)) continue;
    const cooldownDue = !thread.heartbeatCooldownUntil || isDue(thread.heartbeatCooldownUntil, state.time);
    if (!cooldownDue || (!allowNewActorReview && !touchedRelationships.has(thread.threadId))) continue;
    npcCandidates.set(actorId, {
      actorId,
      reviewKey: createReviewKey('npc', actorId, thread.heartbeatCooldownUntil ?? state.time, foregroundTurnId),
      trigger: touchedRelationships.has(thread.threadId) ? 'foreground-impact' : 'relationship',
      allowMaterialProgress: false,
      relatedCaseIds: caseIdsForActor(state, actorId),
      relatedRelationshipThreadIds: relationshipIdsForActor(state, actorId)
    });
  }

  const sortedNpcCandidates = [...npcCandidates.values()].sort((left, right) => {
    const triggerOrder = { due: 0, 'foreground-impact': 1, 'case-lead': 2, relationship: 3 } as const;
    return triggerOrder[left.trigger] - triggerOrder[right.trigger] || left.reviewKey.localeCompare(right.reviewKey);
  });
  const selectedNpcCandidates = sortedNpcCandidates.slice(0, MAX_BACKGROUND_NPC_CANDIDATES);

  const selectedCaseIds = new Set<string>();
  for (const candidate of selectedNpcCandidates) {
    candidate.relatedCaseIds = candidate.relatedCaseIds.filter((caseId) => {
      if (selectedCaseIds.has(caseId)) return true;
      if (selectedCaseIds.size >= MAX_BACKGROUND_CASE_CONTEXTS) return false;
      selectedCaseIds.add(caseId);
      return true;
    });
    candidate.relatedRelationshipThreadIds = candidate.relatedRelationshipThreadIds.slice(0, 2);
  }

  const organizationTracks = organizationTrackByOrganization(state);
  const visibleGrayOrganizations = visibleGrayNetworkOrganizationIds(state);
  const playerActor = state.actors[state.player.actorId];
  const playerOrganizationIds = new Set(
    (playerActor?.organizationRelations ?? [])
      .filter((relation) => relation.visibility !== 'hidden')
      .map((relation) => relation.organizationId)
  );
  const currentPlaceOrganizationId = state.places[state.location.currentPlaceId]?.owningOrganizationId;
  const allowNewOrganizationReview =
    !state.backgroundEvolution.lastOrganizationReviewAt ||
    elapsedGameHours(state.backgroundEvolution.lastOrganizationReviewAt, state.time) >= MIN_BACKGROUND_ORGANIZATION_REVIEW_HOURS;
  const organizationCandidates = new Map<string, BackgroundOrganizationCandidate>();

  for (const track of Object.values(state.backgroundEvolution.organizationTracks ?? {})) {
    const organization = state.organizations[track.organizationId];
    if (!organization || organization.type === 'police_force') continue;
    const context = organizationCandidateContext(state, track.organizationId);
    const due = isDue(track.nextReviewAt, state.time) || isDue(track.expectedEndAt, state.time);
    const affected =
      touchedOrganizations.has(track.organizationId) ||
      track.relatedActorIds.some((id) => touchedActors.has(id)) ||
      track.relatedCaseIds.some((id) => touchedCases.has(id)) ||
      track.relatedCityTrackIds.some((id) => touchedCityTracks.has(id));
    if (!due && !affected && !manual) continue;
    const active = activeOrganizationTrackStatuses.has(track.status);
    const materialCooldownPassed = !track.lastEvolvedAt ||
      elapsedGameHours(track.lastEvolvedAt, state.time) >= MIN_BACKGROUND_ORGANIZATION_REVIEW_HOURS;
    organizationCandidates.set(track.organizationId, {
      organizationId: track.organizationId,
      trackId: track.trackId,
      reviewKey: createReviewKey('organization', track.trackId, scheduledReviewTime(track, state.time), foregroundTurnId),
      trigger: due ? 'due' : 'foreground-impact',
      allowMaterialProgress:
        active && due && materialCooldownPassed && !touchedOrganizations.has(track.organizationId) &&
        !track.relatedCaseIds.some((id) => touchedCases.has(id)) &&
        !track.relatedCityTrackIds.some((id) => touchedCityTracks.has(id)),
      allowPlayerStanceChange: playerOrganizationIds.has(track.organizationId) || touchedOrganizations.has(track.organizationId),
      relatedActorIds: [...new Set([...track.relatedActorIds, ...context.relatedActorIds])].slice(0, 4),
      relatedPlaceIds: [...new Set([...track.relatedPlaceIds, ...context.relatedPlaceIds])].slice(0, 3),
      relatedCaseIds: [...new Set([...track.relatedCaseIds, ...context.relatedCaseIds])].slice(0, 2),
      relatedCityTrackIds: [...new Set([...track.relatedCityTrackIds, ...context.relatedCityTrackIds])].slice(0, 2)
    });
  }

  for (const organization of Object.values(state.organizations)) {
    if (organization.type === 'police_force' || organizationTracks.has(organization.organizationId)) continue;
    const context = organizationCandidateContext(state, organization.organizationId);
    const foreground = touchedOrganizations.has(organization.organizationId);
    const playerLink = playerOrganizationIds.has(organization.organizationId);
    const caseLink = context.relatedCaseIds.length > 0;
    const placeLink = currentPlaceOrganizationId === organization.organizationId;
    const relationshipLink = context.relationshipActorIds.length > 0;
    const grayNetworkLink = organization.type === 'triad' && visibleGrayOrganizations.has(organization.organizationId);
    if (!foreground && !playerLink && !caseLink && !placeLink && !relationshipLink && !grayNetworkLink) continue;
    if (!allowNewOrganizationReview && !foreground) continue;
    const trigger: BackgroundOrganizationCandidate['trigger'] = foreground
      ? 'foreground-impact'
      : placeLink
        ? 'place-link'
        : caseLink
          ? 'case-link'
          : relationshipLink
            ? 'relationship-link'
            : playerLink
              ? 'player-link'
              : 'gray-network';
    organizationCandidates.set(organization.organizationId, {
      organizationId: organization.organizationId,
      reviewKey: createReviewKey('organization', organization.organizationId, state.time, foregroundTurnId),
      trigger,
      allowMaterialProgress: false,
      allowPlayerStanceChange: playerLink || foreground,
      relatedActorIds: context.relatedActorIds,
      relatedPlaceIds: context.relatedPlaceIds,
      relatedCaseIds: context.relatedCaseIds,
      relatedCityTrackIds: context.relatedCityTrackIds
    });
  }

  const organizationTriggerOrder: Record<BackgroundOrganizationCandidate['trigger'], number> = {
    due: 0,
    'foreground-impact': 1,
    'place-link': 2,
    'case-link': 3,
    'relationship-link': 4,
    'player-link': 5,
    'gray-network': 6
  };
  const sortedOrganizationCandidates = [...organizationCandidates.values()].sort(
    (left, right) => organizationTriggerOrder[left.trigger] - organizationTriggerOrder[right.trigger] || left.reviewKey.localeCompare(right.reviewKey)
  );
  const selectedOrganizationCandidates = sortedOrganizationCandidates.slice(0, MAX_BACKGROUND_ORGANIZATION_CANDIDATES);

  const cityCandidates = Object.values(state.citySituationTracks)
    .filter((track) => track.status !== 'resolved')
    .filter((track) => isDue(track.nextReviewAt, state.time) || touchedCityTracks.has(track.trackId) || manual)
    .sort((left, right) => {
      const leftTouched = touchedCityTracks.has(left.trackId) ? 0 : 1;
      const rightTouched = touchedCityTracks.has(right.trackId) ? 0 : 1;
      const leftTime = left.nextReviewAt ?? state.time;
      const rightTime = right.nextReviewAt ?? state.time;
      return leftTouched - rightTouched || compareGameTimes(leftTime, rightTime) || left.trackId.localeCompare(right.trackId);
    })
    .map<BackgroundCityCandidate>((track) => ({
      trackId: track.trackId,
      reviewKey: createReviewKey('city', track.trackId, cityScheduledReviewTime(track, state.time), foregroundTurnId),
      trigger: touchedCityTracks.has(track.trackId) ? 'foreground-impact' : 'due'
    }));
  const selectedCityCandidates = cityCandidates.slice(0, MAX_BACKGROUND_CITY_CANDIDATES);

  const crossedDate = Boolean(previousTime && gameDateKey(previousTime) !== gameDateKey(state.time));
  const hasForegroundImpact =
    touchedActors.size + touchedCases.size + touchedRelationships.size + touchedCityTracks.size + touchedOrganizations.size > 0;
  const reason = manual ? 'manual' : hasForegroundImpact ? 'foreground-impact' : crossedDate ? 'time-jump' : 'due';
  const selectedReviewKeys = [
    ...selectedNpcCandidates.map((candidate) => candidate.reviewKey),
    ...selectedOrganizationCandidates.map((candidate) => candidate.reviewKey),
    ...selectedCityCandidates.map((candidate) => candidate.reviewKey)
  ];

  return {
    reason,
    npcCandidates: selectedNpcCandidates,
    organizationCandidates: selectedOrganizationCandidates,
    cityCandidates: selectedCityCandidates,
    selectedReviewKeys,
    excludedActorIds: [...excludedActors].sort(),
    foregroundTouchedCaseIds: [...touchedCases].sort(),
    foregroundTouchedRelationshipThreadIds: [...touchedRelationships].sort(),
    foregroundTouchedCityTrackIds: [...touchedCityTracks].sort(),
    foregroundTouchedOrganizationIds: [...touchedOrganizations].sort(),
    foregroundDelta,
    truncatedNpcCount: Math.max(0, sortedNpcCandidates.length - selectedNpcCandidates.length),
    truncatedOrganizationCount: Math.max(0, sortedOrganizationCandidates.length - selectedOrganizationCandidates.length),
    truncatedCityCount: Math.max(0, cityCandidates.length - selectedCityCandidates.length)
  };
}
