import { describe, expect, it, vi } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, RuntimeState } from '../runtime/types';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { narratorResponseSchema, type NarratorResponse } from '../writeback/schema';
import {
  mergeExternalCaseLeadRepairs,
  normalizeExternalCaseLeadWritebacks,
  parseExternalCaseLeadRepairResponse,
  repairExternalCaseLeadWritebacks
} from './caseLeadRecovery';

function createState(): RuntimeState {
  const state = createInitialRuntimeState();
  const playerActor = state.actors[state.player.actorId];
  const leadActor: Actor = {
    ...playerActor,
    actorId: 'actor_leung_ying-kit',
    name: '梁英杰',
    aliases: ['梁Sir'],
    callName: '梁Sir',
    publicIdentity: 'CID 探长',
    positionSummary: '加拿大分道便利店劫案现场主办者'
  };
  return {
    ...state,
    actors: {
      ...state.actors,
      [leadActor.actorId]: leadActor
    }
  };
}

function createResponse(casePatch: Record<string, unknown>): NarratorResponse {
  return narratorResponseSchema.parse({
    narrativeText: '梁英杰探长接手现场主办，玩家按其部署守住后门。',
    turnSummary: '梁英杰探长被正式确认为案件主办者；玩家担任协办并负责后门封锁。',
    writeback: {
      casePatches: [casePatch]
    }
  });
}

describe('external case lead recovery', () => {
  it('fills the canonical actor name when a stable external lead actor id is already present', () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      playerRole: 'assist',
      leadActorId: 'actor_leung_ying-kit',
      leadActorName: '梁Sir',
      relatedActorIds: ['actor_leung_ying-kit']
    });

    const result = normalizeExternalCaseLeadWritebacks({ state, response });

    expect(result.response.writeback.casePatches[0]).toMatchObject({
      leadActorId: 'actor_leung_ying-kit',
      leadActorName: '梁英杰'
    });
    expect(result.candidates).toEqual([]);
  });

  it('does not infer a stable id from a lead name alone and instead creates a bounded repair candidate', () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      playerRole: 'assist',
      leadActorName: '梁英杰',
      relatedActorIds: ['actor_leung_ying-kit']
    });

    const result = normalizeExternalCaseLeadWritebacks({ state, response });

    expect(result.response.writeback.casePatches[0].leadActorId).toBeUndefined();
    expect(result.candidates).toEqual([
      {
        caseId: 'case_robbery',
        playerRole: 'assist',
        allowedLeadActorIds: ['actor_leung_ying-kit']
      }
    ]);
  });

  it('does not request external lead repair for an aware-only case', () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      playerRole: 'aware',
      relatedActorIds: ['actor_leung_ying-kit']
    });

    expect(normalizeExternalCaseLeadWritebacks({ state, response }).candidates).toEqual([]);
  });

  it('merges only an allowed existing actor id and derives its canonical name locally', () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      playerRole: 'assist',
      summary: '便利店劫案正在侦办。',
      relatedActorIds: ['actor_leung_ying-kit']
    });
    const normalized = normalizeExternalCaseLeadWritebacks({ state, response });

    const result = mergeExternalCaseLeadRepairs({
      state,
      response: normalized.response,
      candidates: normalized.candidates,
      repairs: parseExternalCaseLeadRepairResponse({
        caseLeadRepairs: [{
          caseId: 'case_robbery',
          decision: 'set',
          leadActorId: 'actor_leung_ying-kit',
          reason: '本回合明确任命。'
        }]
      })
    });

    expect(result.response.writeback.casePatches[0]).toMatchObject({
      caseId: 'case_robbery',
      playerRole: 'assist',
      summary: '便利店劫案正在侦办。',
      leadActorId: 'actor_leung_ying-kit',
      leadActorName: '梁英杰'
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('rejects an invented actor id without altering the case patch', () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      playerRole: 'execute',
      relatedActorIds: ['actor_leung_ying-kit']
    });
    const normalized = normalizeExternalCaseLeadWritebacks({ state, response });

    const result = mergeExternalCaseLeadRepairs({
      state,
      response: normalized.response,
      candidates: normalized.candidates,
      repairs: [{
        caseId: 'case_robbery',
        decision: 'set',
        leadActorId: 'actor_invented'
      }]
    });

    expect(result.response.writeback.casePatches[0].leadActorId).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('case_external_lead_repair_rejected');
  });

  it('uses one bounded repair request and preserves all unrelated case fields', async () => {
    const state = createState();
    const response = createResponse({
      caseId: 'case_robbery',
      title: '加拿大分道便利店劫案',
      caseType: 'robbery',
      playerRole: 'assist',
      status: 'investigating',
      summary: '便利店劫案已进入正式侦办。',
      currentFocus: '核对现场口供',
      playerVisibleProgress: '玩家受命协助封锁后门。',
      relatedActorIds: ['actor_leung_ying-kit']
    });
    const complete = vi.fn(async (
      _input: Parameters<NarratorClient['complete']>[0],
      _options?: Parameters<NarratorClient['complete']>[1]
    ) => ({
      caseLeadRepairs: [{
        caseId: 'case_robbery',
        decision: 'set',
        leadActorId: 'actor_leung_ying-kit',
        reason: '结构化摘要明确。'
      }]
    }));
    const writebackRepair: NarratorClient = { complete };

    const result = await repairExternalCaseLeadWritebacks({
      state,
      response,
      writebackRepair
    });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0]?.[1]).toMatchObject({
      requestPurpose: 'main_turn_case_lead_repair',
      stageMaxTokens: 4_096
    });
    expect(result.response.writeback.casePatches[0]).toMatchObject({
      status: 'investigating',
      currentFocus: '核对现场口供',
      leadActorId: 'actor_leung_ying-kit',
      leadActorName: '梁英杰'
    });
    expect(applyNarratorResponse(state, result.response).cases.case_robbery).toMatchObject({
      playerRole: 'assist',
      leadActorId: 'actor_leung_ying-kit',
      leadActorName: '梁英杰'
    });
  });
});
