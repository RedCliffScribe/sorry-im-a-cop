import type { NpcEvolutionTrack, RuntimeState } from '../runtime/types';

const activeNpcTrackStatuses = new Set<NpcEvolutionTrack['status']>(['planned', 'active', 'blocked']);

export function isNpcEvolutionTrackActive(track: NpcEvolutionTrack): boolean {
  return activeNpcTrackStatuses.has(track.status);
}

export function isActorInForeground(state: RuntimeState, actorId: string): boolean {
  const actor = state.actors[actorId];
  if (!actor) return false;
  if (actor.presence === 'present' || actor.presence === 'nearby') return true;
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  return Boolean(scene?.presentActorIds.includes(actorId));
}

export function isNpcEvolutionTrackProjectable(state: RuntimeState, track: NpcEvolutionTrack): boolean {
  return (
    isNpcEvolutionTrackActive(track) &&
    !track.foregroundInterruption &&
    !isActorInForeground(state, track.actorId)
  );
}
