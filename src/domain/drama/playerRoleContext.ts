import type { RuntimeState } from '../runtime/types';
import type { CanonicalPlayerRoleContext } from './types';

function playerMatterIds(state: RuntimeState): string[] {
  return Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.status === 'active' || matter.status === 'dormant')
    .filter((matter) => matter.relatedActorIds.includes(state.player.actorId))
    .map((matter) => matter.id)
    .slice(0, 8);
}

export function deriveCanonicalPlayerRoleContext(state: RuntimeState): CanonicalPlayerRoleContext {
  const playerActor = state.actors[state.player.actorId];
  const activeMatterIds = playerMatterIds(state);

  if (state.player.currentIdentity === 'police') {
    return {
      identity: 'police',
      publicRole: state.lawIdentity.rank ?? '警务人员',
      organizationName: '皇家香港警察',
      placeId: state.location.currentPlaceId,
      unitSummary: state.lawIdentity.stationOrPost,
      positionSummary: state.lawIdentity.assignmentSummary,
      dutySummary: state.lawIdentity.dutySummary,
      decisionScopeSummary: state.lawIdentity.authoritySummary,
      accessSummary: state.lawIdentity.accessSummary,
      stableContactActorIds: Object.values(state.actors)
        .filter((actor) => actor.actorId !== state.player.actorId)
        .filter((actor) => actor.roleProfiles.law?.status === 'active')
        .sort((left, right) => right.importance - left.importance)
        .slice(0, 4)
        .map((actor) => actor.actorId),
      activeMatterIds
    };
  }

  if (state.player.currentIdentity === 'gang_member') {
    const profile = playerActor?.roleProfiles.triad;
    const organizationId = profile?.organizationId;
    return {
      identity: 'gang_member',
      publicRole: profile?.roleTitle ?? profile?.rankSummary ?? '社团成员',
      organizationId,
      organizationName: organizationId ? state.organizations[organizationId]?.name : undefined,
      placeId: state.location.currentPlaceId,
      unitSummary: profile?.territorySummary,
      positionSummary: profile?.rankSummary ?? profile?.roleTitle,
      dutySummary: profile?.obligationSummary,
      decisionScopeSummary: profile?.riskSummary,
      accessSummary: profile?.coverIdentitySummary,
      stableContactActorIds: [
        ...(profile?.patronActorIds ?? []),
        ...(profile?.peerActorIds ?? [])
      ].slice(0, 6),
      activeMatterIds
    };
  }

  const profile = playerActor?.roleProfiles.civilian;
  const organizationId = profile?.employerOrganizationId;
  return {
    identity: 'civilian',
    publicRole: profile?.publicOccupation ?? '普通市民',
    organizationId,
    organizationName: organizationId ? state.organizations[organizationId]?.name : undefined,
    placeId: profile?.workplacePlaceId ?? state.location.currentPlaceId,
    unitSummary: profile?.workUnitSummary,
    positionSummary: profile?.positionSummary,
    dutySummary: profile?.dutySummary,
    decisionScopeSummary: profile?.decisionScopeSummary,
    accessSummary: profile?.accessSummary,
    stableContactActorIds: [...(profile?.livelihoodActorIds ?? [])].slice(0, 6),
    activeMatterIds
  };
}
