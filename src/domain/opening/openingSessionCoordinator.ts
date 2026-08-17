import type { OpeningSetup } from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import {
  lockOpeningCastDraft,
  type LockedOpeningCast
} from './openingCastDraft';
import {
  createOpeningSessionDraft,
  createOpeningSetupHash,
  saveOpeningCastCheckpoint,
  type OpeningSessionDraft
} from './openingSessionDraft';
import type { OpeningSessionRepository } from './openingSessionRepository';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

function draftMatchesCurrentBase(
  draft: OpeningSessionDraft,
  state: RuntimeState
): boolean {
  const skeleton = draft.skeleton;
  return (
    draft.worldpackId === state.world.worldpackId &&
    skeleton.playerActorId === state.player.actorId &&
    skeleton.playerIdentity === state.player.currentIdentity &&
    skeleton.currentPlaceId === state.location.currentPlaceId &&
    skeleton.currentSceneId === state.location.currentSceneId &&
    JSON.stringify(skeleton.openingTime) === JSON.stringify(state.time)
  );
}

export async function beginOrResumeOpeningSession({
  setup,
  state,
  repository,
  openingSessionId,
  now = new Date().toISOString()
}: {
  setup: OpeningSetup;
  state: RuntimeState;
  repository: OpeningSessionRepository;
  openingSessionId?: string;
  now?: string;
}): Promise<{ draft: OpeningSessionDraft; resumed: boolean }> {
  const setupHash = await createOpeningSetupHash(setup);
  const existing = await repository.findLatestResumable(setupHash);
  if (existing && draftMatchesCurrentBase(existing, state)) {
    return { draft: existing, resumed: true };
  }

  const skeleton = createOpeningLocalSkeleton({ state, openingSessionId });
  const draft = await createOpeningSessionDraft({ setup, skeleton, now });
  await repository.save(draft);
  return { draft, resumed: false };
}

export async function persistOpeningCastStage({
  draft,
  rawCast,
  state,
  repository,
  now = new Date().toISOString()
}: {
  draft: OpeningSessionDraft;
  rawCast: unknown;
  state: RuntimeState;
  repository: OpeningSessionRepository;
  now?: string;
}): Promise<{
  draft: OpeningSessionDraft;
  lockedCast: LockedOpeningCast;
}> {
  const lockedCast = lockOpeningCastDraft(rawCast, draft.skeleton, state);
  const nextDraft = saveOpeningCastCheckpoint(
    draft,
    {
      openingSessionId: lockedCast.openingSessionId,
      openingFacts: lockedCast.openingFacts,
      actors: lockedCast.actors.map(({ actorId: _actorId, ...actor }) => actor),
      actionIntents: lockedCast.actionIntents,
      dramaPlan: lockedCast.dramaPlan
    },
    now
  );
  await repository.save(nextDraft);
  return { draft: nextDraft, lockedCast };
}

export async function abandonOpeningSession(
  repository: OpeningSessionRepository,
  openingSessionId: string
): Promise<void> {
  await repository.delete(openingSessionId);
}
