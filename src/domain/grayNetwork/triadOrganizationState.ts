import type {
  ActorId,
  TriadActivityAreaState,
  TriadLeadershipPhase,
  TriadOrganizationState
} from '../runtime/types';

export interface TriadLeadershipStatePatch {
  phase?: TriadLeadershipPhase;
  visibleSummary?: string;
  nextMilestone?: string;
  currentLeaderActorId?: ActorId;
  knownCandidateActorIds?: ActorId[];
  confidence?: TriadOrganizationState['leadership']['confidence'];
}

export interface TriadActivityAreaStatePatch {
  placeId: string;
  statusSummary?: string;
  pressureSummary?: string;
  confidence?: TriadActivityAreaState['confidence'];
}

export interface TriadOrganizationStatePatch {
  leadership?: TriadLeadershipStatePatch;
  activityAreas?: TriadActivityAreaStatePatch[];
}

export function applyTriadOrganizationStatePatch(
  existing: TriadOrganizationState | undefined,
  patch: TriadOrganizationStatePatch | undefined
): TriadOrganizationState | undefined {
  if (!existing || !patch) return existing;

  const areaPatches = new Map((patch.activityAreas ?? []).map((area) => [area.placeId, area]));
  return {
    leadership: patch.leadership
      ? {
          ...existing.leadership,
          ...patch.leadership,
          knownCandidateActorIds:
            patch.leadership.knownCandidateActorIds === undefined
              ? existing.leadership.knownCandidateActorIds
              : [...new Set(patch.leadership.knownCandidateActorIds)]
        }
      : existing.leadership,
    activityAreas: existing.activityAreas.map((area) => {
      const areaPatch = areaPatches.get(area.placeId);
      return areaPatch ? { ...area, ...areaPatch, placeId: area.placeId } : area;
    })
  };
}

export function remapTriadOrganizationStateActorIds(
  patch: TriadOrganizationStatePatch | undefined,
  actorIdAliases: Map<string, string>
): TriadOrganizationStatePatch | undefined {
  if (!patch?.leadership) return patch;
  return {
    ...patch,
    leadership: {
      ...patch.leadership,
      currentLeaderActorId: patch.leadership.currentLeaderActorId
        ? actorIdAliases.get(patch.leadership.currentLeaderActorId) ?? patch.leadership.currentLeaderActorId
        : undefined,
      knownCandidateActorIds: patch.leadership.knownCandidateActorIds?.map(
        (actorId) => actorIdAliases.get(actorId) ?? actorId
      )
    }
  };
}
