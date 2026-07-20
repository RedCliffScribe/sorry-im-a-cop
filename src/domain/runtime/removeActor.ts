import type { ActorId, RuntimeState } from './types';

const withoutActor = (actorIds: ActorId[], actorId: ActorId): ActorId[] =>
  actorIds.filter((candidateId) => candidateId !== actorId);

export function removeActorFromRuntimeState(state: RuntimeState, actorId: ActorId): RuntimeState {
  if (actorId === state.player.actorId || !state.actors[actorId]) {
    return state;
  }

  const actors = Object.fromEntries(
    Object.entries(state.actors)
      .filter(([candidateId]) => candidateId !== actorId)
      .map(([candidateId, actor]) => {
        const police = actor.roleProfiles?.police;
        const triad = actor.roleProfiles?.triad;

        if (!police && !triad) {
          return [candidateId, actor];
        }

        return [
          candidateId,
          {
            ...actor,
            roleProfiles: {
              ...actor.roleProfiles,
              ...(police
                ? {
                    police: {
                      ...police,
                      supervisorActorIds: withoutActor(police.supervisorActorIds, actorId),
                      peerActorIds: withoutActor(police.peerActorIds, actorId)
                    }
                  }
                : {}),
              ...(triad
                ? {
                    triad: {
                      ...triad,
                      patronActorIds: withoutActor(triad.patronActorIds, actorId),
                      peerActorIds: withoutActor(triad.peerActorIds, actorId),
                      rivalActorIds: withoutActor(triad.rivalActorIds, actorId)
                    }
                  }
                : {})
            }
          }
        ];
      })
  ) as RuntimeState['actors'];

  const relationshipThreads = Object.fromEntries(
    Object.entries(state.relationshipThreads).flatMap(([threadId, thread]) => {
      const relatedActorIds = withoutActor(thread.relatedActorIds, actorId);
      const milestones = thread.milestones.map((milestone) => ({
        ...milestone,
        relatedActorIds: withoutActor(milestone.relatedActorIds, actorId)
      }));

      if (relatedActorIds.length === 0) {
        return [];
      }

      return [
        [
          threadId,
          {
            ...thread,
            relatedActorIds,
            primaryActorId: thread.primaryActorId === actorId ? relatedActorIds[0] : thread.primaryActorId,
            milestones
          }
        ]
      ];
    })
  ) as RuntimeState['relationshipThreads'];

  const grayNetworks = {
    ...state.grayNetworks,
    byAreaId: Object.fromEntries(
      Object.entries(state.grayNetworks.byAreaId).map(([areaId, profile]) => [
        areaId,
        {
          ...profile,
          knownOrganizations: profile.knownOrganizations.map((organization) => ({
            ...organization,
            relatedActorIds: withoutActor(organization.relatedActorIds, actorId)
          })),
          keyPlaces: profile.keyPlaces.map((place) => ({
            ...place,
            relatedActorIds: withoutActor(place.relatedActorIds, actorId)
          })),
          relatedPeople: profile.relatedPeople.filter((person) => person.actorId !== actorId),
          relationClues: profile.relationClues.map((clue) => ({
            ...clue,
            relatedActorIds: withoutActor(clue.relatedActorIds, actorId)
          })),
          actionRisks: profile.actionRisks.map((risk) => ({
            ...risk,
            relatedActorIds: withoutActor(risk.relatedActorIds, actorId)
          })),
          suggestedActions: profile.suggestedActions.map((action) => ({
            ...action,
            relatedActorIds: withoutActor(action.relatedActorIds, actorId)
          }))
        }
      ])
    ) as RuntimeState['grayNetworks']['byAreaId']
  };

  return {
    ...state,
    actors,
    pendingActorWritebackRecoveries: state.pendingActorWritebackRecoveries.filter(
      (recovery) => recovery.actorId !== actorId
    ),
    scenes: Object.fromEntries(
      Object.entries(state.scenes).map(([sceneId, scene]) => [
        sceneId,
        { ...scene, presentActorIds: withoutActor(scene.presentActorIds, actorId) }
      ])
    ) as RuntimeState['scenes'],
    lawIdentity: {
      ...state.lawIdentity,
      supervisorActorIds: withoutActor(state.lawIdentity.supervisorActorIds, actorId),
      peerActorIds: withoutActor(state.lawIdentity.peerActorIds, actorId)
    },
    policePanel: {
      ...state.policePanel,
      relatedActorIds: withoutActor(state.policePanel.relatedActorIds, actorId)
    },
    grayNetworks,
    relationshipThreads,
    dynamicEvents: {
      ...state.dynamicEvents,
      currentMatters: Object.fromEntries(
        Object.entries(state.dynamicEvents.currentMatters).map(([matterId, matter]) => [
          matterId,
          { ...matter, relatedActorIds: withoutActor(matter.relatedActorIds, actorId) }
        ])
      ) as RuntimeState['dynamicEvents']['currentMatters'],
      signals: Object.fromEntries(
        Object.entries(state.dynamicEvents.signals).map(([signalId, signal]) => [
          signalId,
          { ...signal, relatedActorIds: withoutActor(signal.relatedActorIds, actorId) }
        ])
      ) as RuntimeState['dynamicEvents']['signals']
    },
    citySituationTracks: Object.fromEntries(
      Object.entries(state.citySituationTracks).map(([trackId, track]) => [
        trackId,
        { ...track, relatedActorIds: withoutActor(track.relatedActorIds, actorId) }
      ])
    ) as RuntimeState['citySituationTracks']
  };
}
