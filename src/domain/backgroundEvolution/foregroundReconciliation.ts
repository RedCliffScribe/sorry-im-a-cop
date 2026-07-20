import type { RuntimeState } from '../runtime/types';
import { cloneGameTime } from './time';
import { isActorInForeground, isNpcEvolutionTrackActive } from './trackVisibility';

export interface ReconcileForegroundNpcTracksInput {
  state: RuntimeState;
  foregroundTurnId: string;
  directlyTouchedActorIds?: Iterable<string>;
}

export function reconcileForegroundNpcTracks({
  state,
  foregroundTurnId,
  directlyTouchedActorIds
}: ReconcileForegroundNpcTracksInput): RuntimeState {
  const touchedActorIds = new Set(directlyTouchedActorIds ?? []);
  let npcTracks = state.backgroundEvolution.npcTracks;
  let changed = false;

  for (const track of Object.values(state.backgroundEvolution.npcTracks)) {
    if (!isNpcEvolutionTrackActive(track)) continue;
    const reason = isActorInForeground(state, track.actorId)
      ? 'present'
      : touchedActorIds.has(track.actorId)
        ? 'foreground_writeback'
        : undefined;
    if (!reason || track.foregroundInterruption) continue;
    if (!changed) npcTracks = { ...npcTracks };
    npcTracks[track.trackId] = {
      ...track,
      status: 'blocked',
      currentStatus: '前台剧情已介入，原远场行动暂停；离场后必须按最新事实重新复核。',
      nextReviewAt: cloneGameTime(state.time),
      foregroundInterruption: {
        interruptedAt: cloneGameTime(state.time),
        foregroundTurnId,
        reason
      }
    };
    changed = true;
  }

  if (!changed) return state;
  return {
    ...state,
    backgroundEvolution: {
      ...state.backgroundEvolution,
      npcTracks
    }
  };
}
