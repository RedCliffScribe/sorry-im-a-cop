import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { NpcEvolutionTrack } from '../runtime/types';
import { applyBackgroundEvolution } from './applyBackgroundEvolution';
import { reconcileForegroundNpcTracks } from './foregroundReconciliation';
import { parseBackgroundEvolutionWriteback } from './protocol';
import { selectBackgroundEvolutionCandidates } from './selection';
import { addGameHours } from './time';
import { isNpcEvolutionTrackProjectable } from './trackVisibility';

function addRemoteTrack(state: ReturnType<typeof createInitialRuntimeState>): NpcEvolutionTrack {
  state.actors.actor_lau = createActorDefaults({
    actorId: 'actor_lau',
    name: '刘启',
    currentIdentity: 'police',
    publicIdentity: '便衣探员'
  });
  state.actors.actor_lau.presence = 'absent';
  const track: NpcEvolutionTrack = {
    trackId: 'track_lau_remote',
    actorId: 'actor_lau',
    status: 'active',
    actionKind: 'work',
    objective: '核对一批值班记录',
    currentAction: '向值日警员逐一核实签名',
    currentStatus: '已核对前半本记录',
    nextReviewAt: addGameHours(state.time, 12),
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedRelationshipThreadIds: [],
    relatedCityTrackIds: [],
    relatedDeferredEventIds: [],
    visibility: 'player_known'
  };
  state.backgroundEvolution.npcTracks[track.trackId] = track;
  return track;
}

function sourceRefs() {
  return {
    actorIds: ['actor_lau'],
    caseIds: [],
    placeIds: [],
    organizationIds: [],
    relationshipThreadIds: [],
    cityTrackIds: [],
    deferredEventIds: [],
    outcomeIds: []
  };
}

describe('foreground NPC track reconciliation', () => {
  it('pauses a directly touched remote action without deleting its plan and is idempotent', () => {
    const state = createInitialRuntimeState();
    const track = addRemoteTrack(state);

    const interrupted = reconcileForegroundNpcTracks({
      state,
      foregroundTurnId: 'turn_foreground_1',
      directlyTouchedActorIds: ['actor_lau']
    });

    expect(interrupted).not.toBe(state);
    expect(interrupted.backgroundEvolution.npcTracks[track.trackId]).toMatchObject({
      status: 'blocked',
      objective: track.objective,
      currentAction: track.currentAction,
      foregroundInterruption: {
        foregroundTurnId: 'turn_foreground_1',
        reason: 'foreground_writeback'
      }
    });
    expect(isNpcEvolutionTrackProjectable(interrupted, interrupted.backgroundEvolution.npcTracks[track.trackId])).toBe(false);
    expect(
      reconcileForegroundNpcTracks({
        state: interrupted,
        foregroundTurnId: 'turn_foreground_1',
        directlyTouchedActorIds: ['actor_lau']
      })
    ).toBe(interrupted);
  });

  it('keeps an interrupted action hidden until the remote NPC receives a fresh structured review', () => {
    const initial = createInitialRuntimeState();
    addRemoteTrack(initial);
    const interrupted = reconcileForegroundNpcTracks({
      state: initial,
      foregroundTurnId: 'turn_foreground_1',
      directlyTouchedActorIds: ['actor_lau']
    });
    const selection = selectBackgroundEvolutionCandidates({
      state: interrupted,
      foregroundTurnId: 'turn_background_2'
    });
    expect(selection.npcCandidates[0]).toMatchObject({ actorId: 'actor_lau', trackId: 'track_lau_remote' });
    const reviewKey = selection.npcCandidates[0].reviewKey;
    const writeback = parseBackgroundEvolutionWriteback({
      npcTrackPatches: [
        {
          operation: 'update',
          trackId: 'track_lau_remote',
          actorId: 'actor_lau',
          status: 'active',
          currentStatus: '已按前台新情况重排核对次序',
          nextReviewAt: addGameHours(interrupted.time, 6),
          reviewKey,
          reason: '人物已经离场，按最新结构化事实复核原行动。',
          sourceRefs: sourceRefs()
        }
      ]
    }).writeback;
    const applied = applyBackgroundEvolution({
      state: interrupted,
      selection,
      writeback,
      foregroundTurnId: 'turn_background_2'
    }).state;
    const reviewedTrack = applied.backgroundEvolution.npcTracks.track_lau_remote;

    expect(reviewedTrack.foregroundInterruption).toBeUndefined();
    expect(reviewedTrack.currentStatus).toBe('已按前台新情况重排核对次序');
    expect(reviewedTrack.sourceRefs?.actorIds).toEqual(['actor_lau']);
    expect(isNpcEvolutionTrackProjectable(applied, reviewedTrack)).toBe(true);
  });

  it('uses current presence as a stronger interruption reason than a writeback touch', () => {
    const state = createInitialRuntimeState();
    addRemoteTrack(state);
    state.actors.actor_lau.presence = 'present';

    const interrupted = reconcileForegroundNpcTracks({
      state,
      foregroundTurnId: 'turn_present',
      directlyTouchedActorIds: ['actor_lau']
    });

    expect(interrupted.backgroundEvolution.npcTracks.track_lau_remote.foregroundInterruption?.reason).toBe('present');
  });
});
