import type { Actor, ActorId, CaseFile } from '../runtime/types';

export function enforcePlayerCaseLead({
  caseFile,
  playerActorId,
  playerActorName
}: {
  caseFile: CaseFile;
  playerActorId: ActorId;
  playerActorName?: string;
}): CaseFile {
  if (caseFile.playerRole !== 'lead') {
    return caseFile;
  }

  const canonicalPlayerName = playerActorName?.trim();
  if (
    caseFile.leadActorId === playerActorId &&
    (!canonicalPlayerName || caseFile.leadActorName === canonicalPlayerName)
  ) {
    return caseFile;
  }

  return {
    ...caseFile,
    leadActorId: playerActorId,
    leadActorName: canonicalPlayerName || caseFile.leadActorName
  };
}

export function resolveCaseLeadDisplayName({
  caseFile,
  actors,
  playerActorId
}: {
  caseFile: CaseFile;
  actors: Record<ActorId, Actor>;
  playerActorId: ActorId;
}): string {
  const canonicalLeadActorId =
    caseFile.leadActorId ?? (caseFile.playerRole === 'lead' ? playerActorId : undefined);

  return (
    (canonicalLeadActorId ? actors[canonicalLeadActorId]?.name?.trim() : undefined) ||
    caseFile.leadActorName?.trim() ||
    canonicalLeadActorId ||
    '未明确'
  );
}
