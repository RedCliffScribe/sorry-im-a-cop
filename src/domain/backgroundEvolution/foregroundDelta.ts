import type { GameTime, RuntimeState } from '../runtime/types';

const MAX_FOREGROUND_ACTORS = 8;
const MAX_FOREGROUND_CASES = 6;
const MAX_FOREGROUND_RELATIONSHIPS = 4;
const MAX_FOREGROUND_ORGANIZATIONS = 4;
const MAX_FOREGROUND_CITY_TRACKS = 4;
const MAX_FOREGROUND_DEFERRED_EVENTS = 4;
const MAX_TURN_SUMMARY_LENGTH = 900;

export interface ForegroundEvolutionTouches {
  actorIds: string[];
  caseIds: string[];
  relationshipThreadIds: string[];
  cityTrackIds: string[];
  organizationIds: string[];
}

export interface ForegroundEvolutionDelta {
  foregroundTurnId: string;
  startedAt: GameTime;
  finishedAt: GameTime;
  turnSummary: string;
  currentLocation: {
    sceneId?: string;
    placeId: string;
  };
  touched: ForegroundEvolutionTouches;
  canonicalSnapshots: {
    actors: Array<{
      actorId: string;
      presence: RuntimeState['actors'][string]['presence'];
      currentPlaceId?: string;
      statusSummary?: string;
    }>;
    cases: Array<{
      caseId: string;
      status: RuntimeState['cases'][string]['status'];
      leadActorId?: string;
      currentFocus: string;
      internalProgressSummary: string;
    }>;
    relationships: Array<{
      threadId: string;
      status: RuntimeState['relationshipThreads'][string]['status'];
      summary: string;
      currentPull?: string;
      conflictSummary?: string;
      promiseSummary?: string;
      riskSummary?: string;
    }>;
    organizations: Array<{
      organizationId: string;
      currentState?: string;
      pressureSummary?: string;
      stanceTowardPlayer?: string;
    }>;
    cityTracks: Array<{
      trackId: string;
      status: RuntimeState['citySituationTracks'][string]['status'];
      pressureLevel: number;
      currentBeat: string;
      nextReviewAt?: GameTime;
    }>;
    deferredEvents: Array<{
      eventId: string;
      status: RuntimeState['deferredEvents'][string]['status'];
      title: string;
      summary: string;
      triggerAt: GameTime;
      relatedIds: RuntimeState['deferredEvents'][string]['relatedIds'];
    }>;
  };
}

export interface BuildForegroundEvolutionDeltaInput {
  state: RuntimeState;
  foregroundTurnId: string;
  startedAt: GameTime;
  turnSummary: string;
  touches: ForegroundEvolutionTouches;
}

function stableUnique(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export function buildForegroundEvolutionDelta({
  state,
  foregroundTurnId,
  startedAt,
  turnSummary,
  touches
}: BuildForegroundEvolutionDeltaInput): ForegroundEvolutionDelta {
  const touched: ForegroundEvolutionTouches = {
    actorIds: stableUnique(touches.actorIds),
    caseIds: stableUnique(touches.caseIds),
    relationshipThreadIds: stableUnique(touches.relationshipThreadIds),
    cityTrackIds: stableUnique(touches.cityTrackIds),
    organizationIds: stableUnique(touches.organizationIds)
  };
  const touchedActors = new Set(touched.actorIds);
  const touchedCases = new Set(touched.caseIds);
  const touchedOrganizations = new Set(touched.organizationIds);

  return {
    foregroundTurnId,
    startedAt: { ...startedAt },
    finishedAt: { ...state.time },
    turnSummary: turnSummary.trim().slice(0, MAX_TURN_SUMMARY_LENGTH),
    currentLocation: {
      sceneId: state.location.currentSceneId,
      placeId: state.location.currentPlaceId
    },
    touched,
    canonicalSnapshots: {
      actors: touched.actorIds
        .map((actorId) => state.actors[actorId])
        .filter(Boolean)
        .slice(0, MAX_FOREGROUND_ACTORS)
        .map((actor) => ({
          actorId: actor.actorId,
          presence: actor.presence,
          currentPlaceId: actor.currentPlaceId,
          statusSummary: actor.statusSummary
        })),
      cases: touched.caseIds
        .map((caseId) => state.cases[caseId])
        .filter(Boolean)
        .slice(0, MAX_FOREGROUND_CASES)
        .map((caseFile) => ({
          caseId: caseFile.caseId,
          status: caseFile.status,
          leadActorId: caseFile.leadActorId,
          currentFocus: caseFile.currentFocus,
          internalProgressSummary: caseFile.internalProgressSummary
        })),
      relationships: touched.relationshipThreadIds
        .map((threadId) => state.relationshipThreads[threadId])
        .filter(Boolean)
        .slice(0, MAX_FOREGROUND_RELATIONSHIPS)
        .map((thread) => ({
          threadId: thread.threadId,
          status: thread.status,
          summary: thread.summary,
          currentPull: thread.currentPull,
          conflictSummary: thread.conflictSummary,
          promiseSummary: thread.promiseSummary,
          riskSummary: thread.riskSummary
        })),
      organizations: touched.organizationIds
        .map((organizationId) => state.organizations[organizationId])
        .filter(Boolean)
        .slice(0, MAX_FOREGROUND_ORGANIZATIONS)
        .map((organization) => ({
          organizationId: organization.organizationId,
          currentState: organization.currentState,
          pressureSummary: organization.pressureSummary,
          stanceTowardPlayer: organization.stanceTowardPlayer
        })),
      cityTracks: touched.cityTrackIds
        .map((trackId) => state.citySituationTracks[trackId])
        .filter(Boolean)
        .slice(0, MAX_FOREGROUND_CITY_TRACKS)
        .map((track) => ({
          trackId: track.trackId,
          status: track.status,
          pressureLevel: track.pressureLevel,
          currentBeat: track.currentBeat,
          nextReviewAt: track.nextReviewAt ? { ...track.nextReviewAt } : undefined
        })),
      deferredEvents: Object.values(state.deferredEvents)
        .filter((event) => event.status === 'pending')
        .filter(
          (event) =>
            Boolean(event.relatedIds.actorId && touchedActors.has(event.relatedIds.actorId)) ||
            Boolean(event.relatedIds.caseId && touchedCases.has(event.relatedIds.caseId)) ||
            Boolean(event.relatedIds.organizationId && touchedOrganizations.has(event.relatedIds.organizationId))
        )
        .slice(0, MAX_FOREGROUND_DEFERRED_EVENTS)
        .map((event) => ({
          eventId: event.eventId,
          status: event.status,
          title: event.title,
          summary: event.summary,
          triggerAt: { ...event.triggerAt },
          relatedIds: { ...event.relatedIds }
        }))
    }
  };
}
