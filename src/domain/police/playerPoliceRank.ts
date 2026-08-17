import type { Actor, LawIdentityRuntime, PolicePanelState } from '../runtime/types';

export interface PlayerPoliceRankState {
  lawIdentity: LawIdentityRuntime;
  policePanel: PolicePanelState;
  playerActor?: Actor;
}

export function synchronizePlayerPoliceRank({
  lawIdentity,
  policePanel,
  playerActor,
  rank
}: PlayerPoliceRankState & { rank: string | undefined }): PlayerPoliceRankState {
  const normalizedRank = rank?.trim();
  if (!normalizedRank) {
    return { lawIdentity, policePanel, playerActor };
  }

  const nextLawIdentity =
    lawIdentity.rank === normalizedRank
      ? lawIdentity
      : {
          ...lawIdentity,
          rank: normalizedRank
        };
  const nextPolicePanel =
    policePanel.careerPath.currentRank === normalizedRank
      ? policePanel
      : {
          ...policePanel,
          careerPath: {
            ...policePanel.careerPath,
            currentRank: normalizedRank
          }
        };
  const policeProfile = playerActor?.roleProfiles.police;
  const nextPlayerActor =
    playerActor && policeProfile && policeProfile.rank !== normalizedRank
      ? {
          ...playerActor,
          roleProfiles: {
            ...playerActor.roleProfiles,
            police: {
              ...policeProfile,
              rank: normalizedRank
            }
          }
        }
      : playerActor;

  return {
    lawIdentity: nextLawIdentity,
    policePanel: nextPolicePanel,
    playerActor: nextPlayerActor
  };
}
