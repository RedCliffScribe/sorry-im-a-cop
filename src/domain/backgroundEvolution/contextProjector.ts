import type {
  EvolutionChronicleEntry,
  EvolutionOutcomeRecord,
  GameTime,
  NpcEvolutionActionKind,
  NpcEvolutionTrackStatus,
  OrganizationEvolutionTrackStatus,
  RuntimeState
} from '../runtime/types';
import { compareGameTimes } from './time';
import { isNpcEvolutionTrackProjectable } from './trackVisibility';

export const MAX_BACKGROUND_NPC_ACTIONS_IN_PROMPT = 4;
export const MAX_BACKGROUND_ORGANIZATION_ACTIONS_IN_PROMPT = 3;
export const MAX_BACKGROUND_OUTCOMES_IN_PROMPT = 4;
export const MAX_BACKGROUND_CHRONICLE_IN_PROMPT = 2;

export interface BackgroundNpcActionProjection {
  trackId: string;
  actorId: string;
  actorName: string;
  status: NpcEvolutionTrackStatus;
  actionKind: NpcEvolutionActionKind;
  objective: string;
  currentAction: string;
  currentStatus: string;
  currentPlaceId?: string;
  currentPlaceName?: string;
  startedAt?: GameTime;
  expectedEndAt?: GameTime;
  relatedActorIds: string[];
  relatedCaseIds: string[];
  relatedRelationshipThreadIds: string[];
}

export interface BackgroundOutcomeProjection {
  outcomeId: string;
  occurredAt: GameTime;
  sourceKind: EvolutionOutcomeRecord['sourceKind'];
  sourceId: string;
  title: string;
  summary: string;
  consequence?: string;
  relatedActorIds: string[];
  relatedOrganizationIds: string[];
  relatedCaseIds: string[];
  relatedRelationshipThreadIds: string[];
  significance: EvolutionOutcomeRecord['significance'];
}

export interface BackgroundChronicleProjection {
  entryId: string;
  occurredAt: GameTime;
  title: string;
  summary: string;
  longTermImpact: string;
  relatedActorIds: string[];
  relatedOrganizationIds: string[];
  relatedCaseIds: string[];
}

export interface BackgroundOrganizationActionProjection {
  trackId: string;
  organizationId: string;
  organizationName: string;
  status: OrganizationEvolutionTrackStatus;
  objective: string;
  currentAction: string;
  currentStatus: string;
  startedAt?: GameTime;
  expectedEndAt?: GameTime;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  relatedCityTrackIds: string[];
}

export interface BackgroundEvolutionContextProjection {
  activeNpcActions: BackgroundNpcActionProjection[];
  activeOrganizationActions: BackgroundOrganizationActionProjection[];
  recentOutcomes: BackgroundOutcomeProjection[];
  chronicle: BackgroundChronicleProjection[];
  diagnostics: {
    sourceActiveActionCount: number;
    sourceActiveOrganizationActionCount: number;
    sourceOutcomeCount: number;
    sourceChronicleCount: number;
    omittedActionCount: number;
    omittedOrganizationActionCount: number;
    omittedOutcomeCount: number;
    omittedChronicleCount: number;
    omittedHiddenCount: number;
  };
}

function directTextMatch(text: string, values: Array<string | undefined>): boolean {
  const normalized = text.trim().toLocaleLowerCase();
  if (!normalized) return false;
  return values.some((value) => {
    const candidate = value?.trim().toLocaleLowerCase();
    return Boolean(candidate && normalized.includes(candidate));
  });
}

function actionScore(state: RuntimeState, track: RuntimeState['backgroundEvolution']['npcTracks'][string], playerInput: string): number {
  const actor = state.actors[track.actorId];
  const inputMatch = directTextMatch(playerInput, [actor?.name, actor?.englishName, actor?.callName, ...(actor?.aliases ?? [])]);
  const visibleCase = track.relatedCaseIds.some((caseId) => state.cases[caseId]?.visibility !== 'hidden');
  const visibleRelationship = track.relatedRelationshipThreadIds.some(
    (threadId) => state.relationshipThreads[threadId]?.visibility !== 'hidden'
  );
  return (inputMatch ? 40 : 0) + (visibleCase ? 20 : 0) + (visibleRelationship ? 15 : 0) + (track.status === 'blocked' ? 5 : 0);
}

function outcomeScore(state: RuntimeState, outcome: EvolutionOutcomeRecord, playerInput: string): number {
  const directActorMatch = outcome.relatedActorIds.some((actorId) => {
    const actor = state.actors[actorId];
    return directTextMatch(playerInput, [actor?.name, actor?.englishName, actor?.callName, ...(actor?.aliases ?? [])]);
  });
  const directOrganizationMatch = outcome.relatedOrganizationIds.some((organizationId) =>
    directTextMatch(playerInput, [state.organizations[organizationId]?.name])
  );
  const visibleCase = outcome.relatedCaseIds.some((caseId) => state.cases[caseId]?.visibility !== 'hidden');
  const visibleRelationship = outcome.relatedRelationshipThreadIds.some(
    (threadId) => state.relationshipThreads[threadId]?.visibility !== 'hidden'
  );
  return (directActorMatch ? 40 : 0) + (directOrganizationMatch ? 30 : 0) + (visibleCase ? 20 : 0) + (visibleRelationship ? 15 : 0) +
    (outcome.significance === 'historic' ? 10 : outcome.significance === 'notable' ? 5 : 0);
}

function chronicleScore(state: RuntimeState, entry: EvolutionChronicleEntry, playerInput: string): number {
  const directActorMatch = entry.relatedActorIds.some((actorId) => {
    const actor = state.actors[actorId];
    return directTextMatch(playerInput, [actor?.name, actor?.englishName, actor?.callName, ...(actor?.aliases ?? [])]);
  });
  const directOrganizationMatch = entry.relatedOrganizationIds.some((organizationId) =>
    directTextMatch(playerInput, [state.organizations[organizationId]?.name])
  );
  const visibleCase = entry.relatedCaseIds.some((caseId) => state.cases[caseId]?.visibility !== 'hidden');
  const currentPlace = entry.relatedPlaceIds.includes(state.location.currentPlaceId);
  return (directActorMatch ? 40 : 0) + (directOrganizationMatch ? 30 : 0) + (visibleCase ? 20 : 0) + (currentPlace ? 15 : 0);
}

function organizationActionScore(
  state: RuntimeState,
  track: RuntimeState['backgroundEvolution']['organizationTracks'][string],
  playerInput: string
): number {
  const organization = state.organizations[track.organizationId];
  const inputMatch = directTextMatch(playerInput, [organization?.name]);
  const visibleCase = track.relatedCaseIds.some((caseId) => state.cases[caseId]?.visibility !== 'hidden');
  const currentPlaceOwner = state.places[state.location.currentPlaceId]?.owningOrganizationId === track.organizationId;
  const playerTriadProfile =
    state.player.currentIdentity === 'gang_member'
      ? state.actors[state.player.actorId]?.roleProfiles.triad
      : undefined;
  const currentPlayerOrganization =
    playerTriadProfile &&
    (playerTriadProfile.status === 'active' || playerTriadProfile.status === 'cover') &&
    playerTriadProfile.organizationId === track.organizationId;
  return (
    (currentPlayerOrganization ? 50 : 0) +
    (inputMatch ? 40 : 0) +
    (visibleCase ? 20 : 0) +
    (currentPlaceOwner ? 15 : 0) +
    (track.status === 'blocked' ? 5 : 0)
  );
}

function cloneOutcome(outcome: EvolutionOutcomeRecord): BackgroundOutcomeProjection {
  return {
    outcomeId: outcome.outcomeId,
    occurredAt: { ...outcome.occurredAt },
    sourceKind: outcome.sourceKind,
    sourceId: outcome.sourceId,
    title: outcome.title,
    summary: outcome.summary,
    consequence: outcome.consequence,
    relatedActorIds: [...outcome.relatedActorIds],
    relatedOrganizationIds: [...outcome.relatedOrganizationIds],
    relatedCaseIds: [...outcome.relatedCaseIds],
    relatedRelationshipThreadIds: [...outcome.relatedRelationshipThreadIds],
    significance: outcome.significance
  };
}

function cloneChronicle(entry: EvolutionChronicleEntry): BackgroundChronicleProjection {
  return {
    entryId: entry.entryId,
    occurredAt: { ...entry.occurredAt },
    title: entry.title,
    summary: entry.summary,
    longTermImpact: entry.longTermImpact,
    relatedActorIds: [...entry.relatedActorIds],
    relatedOrganizationIds: [...entry.relatedOrganizationIds],
    relatedCaseIds: [...entry.relatedCaseIds]
  };
}

export function projectBackgroundEvolutionContext(
  state: RuntimeState,
  playerInput: string
): BackgroundEvolutionContextProjection {
  let omittedHiddenCount = 0;
  const activeTracks = Object.values(state.backgroundEvolution?.npcTracks ?? {}).filter((track) => {
    if (track.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return isNpcEvolutionTrackProjectable(state, track);
  });
  const activeNpcActions = activeTracks
    .map((track) => ({ track, score: actionScore(state, track, playerInput) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareGameTimes(right.track.lastEvolvedAt ?? right.track.startedAt ?? state.time, left.track.lastEvolvedAt ?? left.track.startedAt ?? state.time) ||
        left.track.trackId.localeCompare(right.track.trackId)
    )
    .slice(0, MAX_BACKGROUND_NPC_ACTIONS_IN_PROMPT)
    .map(({ track }) => ({
      trackId: track.trackId,
      actorId: track.actorId,
      actorName: state.actors[track.actorId]?.name ?? track.actorId,
      status: track.status,
      actionKind: track.actionKind,
      objective: track.objective,
      currentAction: track.currentAction,
      currentStatus: track.currentStatus,
      currentPlaceId: track.currentPlaceId,
      currentPlaceName: track.currentPlaceId ? state.places[track.currentPlaceId]?.name : undefined,
      startedAt: track.startedAt ? { ...track.startedAt } : undefined,
      expectedEndAt: track.expectedEndAt ? { ...track.expectedEndAt } : undefined,
      relatedActorIds: [...track.relatedActorIds],
      relatedCaseIds: [...track.relatedCaseIds],
      relatedRelationshipThreadIds: [...track.relatedRelationshipThreadIds]
    }));

  const activeOrganizationTracks = Object.values(state.backgroundEvolution?.organizationTracks ?? {}).filter((track) => {
    if (track.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return track.status === 'planned' || track.status === 'active' || track.status === 'blocked';
  });
  const activeOrganizationActions = activeOrganizationTracks
    .map((track) => ({ track, score: organizationActionScore(state, track, playerInput) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareGameTimes(
          right.track.lastEvolvedAt ?? right.track.startedAt ?? state.time,
          left.track.lastEvolvedAt ?? left.track.startedAt ?? state.time
        ) ||
        left.track.trackId.localeCompare(right.track.trackId)
    )
    .slice(0, MAX_BACKGROUND_ORGANIZATION_ACTIONS_IN_PROMPT)
    .map(({ track }) => ({
      trackId: track.trackId,
      organizationId: track.organizationId,
      organizationName: state.organizations[track.organizationId]?.name ?? track.organizationId,
      status: track.status,
      objective: track.objective ?? '',
      currentAction: track.currentAction ?? '',
      currentStatus: track.currentStatus ?? '',
      startedAt: track.startedAt ? { ...track.startedAt } : undefined,
      expectedEndAt: track.expectedEndAt ? { ...track.expectedEndAt } : undefined,
      relatedActorIds: [...track.relatedActorIds],
      relatedPlaceIds: [...track.relatedPlaceIds],
      relatedCaseIds: [...track.relatedCaseIds],
      relatedCityTrackIds: [...track.relatedCityTrackIds]
    }));

  const visibleOutcomes = (state.backgroundEvolution?.recentOutcomes ?? []).filter((outcome) => {
    if (outcome.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return true;
  });
  const recentOutcomes = visibleOutcomes
    .map((outcome) => ({ outcome, score: outcomeScore(state, outcome, playerInput) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareGameTimes(right.outcome.occurredAt, left.outcome.occurredAt) ||
        left.outcome.outcomeId.localeCompare(right.outcome.outcomeId)
    )
    .slice(0, MAX_BACKGROUND_OUTCOMES_IN_PROMPT)
    .map(({ outcome }) => cloneOutcome(outcome));

  const visibleChronicle = (state.backgroundEvolution?.chronicle ?? []).filter((entry) => {
    if (entry.visibility === 'hidden') {
      omittedHiddenCount += 1;
      return false;
    }
    return true;
  });
  const chronicle = visibleChronicle
    .map((entry) => ({ entry, score: chronicleScore(state, entry, playerInput) }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        compareGameTimes(right.entry.occurredAt, left.entry.occurredAt) ||
        left.entry.entryId.localeCompare(right.entry.entryId)
    )
    .slice(0, MAX_BACKGROUND_CHRONICLE_IN_PROMPT)
    .map(({ entry }) => cloneChronicle(entry));

  return {
    activeNpcActions,
    activeOrganizationActions,
    recentOutcomes,
    chronicle,
    diagnostics: {
      sourceActiveActionCount: activeTracks.length,
      sourceActiveOrganizationActionCount: activeOrganizationTracks.length,
      sourceOutcomeCount: visibleOutcomes.length,
      sourceChronicleCount: visibleChronicle.length,
      omittedActionCount: Math.max(0, activeTracks.length - activeNpcActions.length),
      omittedOrganizationActionCount: Math.max(0, activeOrganizationTracks.length - activeOrganizationActions.length),
      omittedOutcomeCount: Math.max(0, visibleOutcomes.length - recentOutcomes.length),
      omittedChronicleCount: Math.max(0, visibleChronicle.length - chronicle.length),
      omittedHiddenCount
    }
  };
}
