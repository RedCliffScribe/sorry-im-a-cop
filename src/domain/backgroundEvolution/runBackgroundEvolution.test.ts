import { describe, expect, it, vi } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, CaseFile } from '../runtime/types';
import { runBackgroundEvolution } from './runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from './selection';
import { addGameHours } from './time';

function stateWithCandidate() {
  const state = createInitialRuntimeState();
  state.actors.actor_liu = {
    ...state.actors.player,
    actorId: 'actor_liu',
    name: '刘启',
    aliases: [],
    presence: 'absent',
    currentSceneId: undefined,
    visibility: 'player_known'
  } as Actor;
  state.cases.case_1 = {
    caseId: 'case_1',
    title: '测试案',
    caseType: 'test',
    status: 'investigating',
    playerRole: 'aware',
    leadActorId: 'actor_liu',
    summary: '测试案件。',
    currentFocus: '走访。',
    playerVisibleProgress: '调查中。',
    internalProgressSummary: '调查中。',
    relatedActorIds: ['actor_liu'],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time
  } as CaseFile;
  return state;
}

describe('runBackgroundEvolution', () => {
  it('keeps the already-applied foreground state when the background API fails', async () => {
    const state = stateWithCandidate();
    state.finance.cashOnHand = 777;
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const client: NarratorClient = {
      complete: vi.fn().mockRejectedValue(new Error('network down'))
    };

    const result = await runBackgroundEvolution({ state, selection, client, foregroundTurnId: 'turn_1' });

    expect(result.status).toBe('failed');
    expect(result.state.finance.cashOnHand).toBe(777);
    expect(result.state.backgroundEvolution.npcTracks).toEqual({});
    expect(result.state.backgroundEvolution.lastRun).toMatchObject({
      status: 'failed',
      errorReason: 'network down'
    });
  });

  it('treats abort as a background-only abort and preserves the main turn state', async () => {
    const state = stateWithCandidate();
    state.turnCounter = 9;
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_9' });
    const controller = new AbortController();
    const client: NarratorClient = {
      complete: vi.fn(async (_prompt, options) => {
        controller.abort(new DOMException('Aborted', 'AbortError'));
        throw options?.signal?.reason;
      })
    };

    const result = await runBackgroundEvolution({
      state,
      selection,
      client,
      foregroundTurnId: 'turn_9',
      signal: controller.signal
    });

    expect(result.aborted).toBe(true);
    expect(result.state.turnCounter).toBe(9);
    expect(result.state.backgroundEvolution.lastRun?.status).toBe('aborted');
    expect(result.diagnostics[0].message).toContain('主回合已保留');
  });

  it('does not call an API when no candidates are due', async () => {
    const state = createInitialRuntimeState();
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const client: NarratorClient = { complete: vi.fn() };

    const result = await runBackgroundEvolution({ state, selection, client, foregroundTurnId: 'turn_1' });

    expect(client.complete).not.toHaveBeenCalled();
    expect(result.status).toBe('skipped');
    expect(result.state.backgroundEvolution.lastRun?.errorReason).toBe('no_candidates');
  });

  it('records the last applied game time only when validated patches change state', async () => {
    const state = stateWithCandidate();
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_success' });
    const reviewKey = selection.npcCandidates[0].reviewKey;
    const client: NarratorClient = {
      complete: vi.fn().mockResolvedValue({
        npcTrackPatches: [
          {
            operation: 'create',
            trackId: 'track_actor_liu_case_1',
            actorId: 'actor_liu',
            status: 'active',
            actionKind: 'case',
            objective: '完成第一轮走访',
            currentAction: '走访报案人附近住户',
            currentStatus: '刚开始走访',
            expectedEndAt: addGameHours(state.time, 24),
            nextReviewAt: addGameHours(state.time, 6),
            relatedActorIds: ['actor_liu'],
            relatedCaseIds: ['case_1'],
            reviewKey,
            reason: '主办人开始安排第一轮走访。',
            sourceRefs: {
              actorIds: ['actor_liu'],
              caseIds: ['case_1'],
              placeIds: [],
              organizationIds: [],
              relationshipThreadIds: [],
              cityTrackIds: [],
              deferredEventIds: [],
              outcomeIds: []
            },
            visibility: 'player_known'
          }
        ]
      })
    };

    const result = await runBackgroundEvolution({
      state,
      selection,
      client,
      foregroundTurnId: 'turn_success'
    });

    expect(result.status).toBe('succeeded');
    expect(result.state.backgroundEvolution.lastAppliedAt).toEqual(state.time);
  });

  it('records a successful empty organization review so the same inactive institution is not queried every turn', async () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'contractor',
      summary: '协助采访',
      visibility: 'player_known'
    });
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_org_empty' });
    expect(selection.organizationCandidates).toHaveLength(1);
    const client: NarratorClient = { complete: vi.fn().mockResolvedValue({}) };

    const result = await runBackgroundEvolution({
      state,
      selection,
      client,
      foregroundTurnId: 'turn_org_empty'
    });

    expect(result.status).toBe('succeeded');
    expect(result.state.backgroundEvolution.lastOrganizationReviewAt).toEqual(state.time);
    expect(result.state.backgroundEvolution.lastAppliedAt).toBeUndefined();
    expect(
      selectBackgroundEvolutionCandidates({ state: result.state, foregroundTurnId: 'turn_org_next' })
        .organizationCandidates
    ).toEqual([]);
  });
});
