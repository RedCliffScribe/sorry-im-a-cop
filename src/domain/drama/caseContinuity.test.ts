import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CaseFile, RuntimeState } from '../runtime/types';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { narratorResponseSchema, type NarratorResponse } from '../writeback/schema';
import { enforceDramaCaseContinuity } from './caseContinuity';
import type { ForegroundContract } from './types';

const sourceRef = {
  providerId: 'official-dlc',
  sourceType: 'official_dlc_event',
  sourceId: 'urban_legends_hk1988_vacant_flat_calls',
  dlcId: 'urban_legends'
};

function caseFile(state: RuntimeState, caseId: string): CaseFile {
  return {
    caseId,
    title: '砵兰街空屋来电案',
    caseType: 'suspicious_death',
    status: 'investigating',
    playerRole: 'assist',
    summary: '同一间空置单位的来电已经进入调查。',
    currentFocus: '承接现有现场与电话记录。',
    playerVisibleProgress: '案件正在调查。',
    internalProgressSummary: '不得重建平行案件。',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time
  };
}

function stateWithCases(...caseIds: string[]): RuntimeState {
  const state = createInitialRuntimeState();
  state.cases = Object.fromEntries(caseIds.map((caseId) => [caseId, caseFile(state, caseId)]));
  return state;
}

function contract(
  caseIds: string[],
  policy: ForegroundContract['caseContinuityPolicy'] = 'reuse_linked_when_present'
): ForegroundContract {
  return {
    planId: 'drama_plan_turn_4',
    mode: 'continue_existing',
    origin: 'main_two_pass',
    primaryArcKey: 'official-dlc:urban_legends:vacant_flat_calls',
    selectedSourceRefs: [sourceRef],
    evidenceSourceRefs: [sourceRef],
    mandatorySourceRefs: [],
    allowedActorIds: [],
    allowedOrganizationIds: [],
    allowedPlaceIds: [],
    allowedCaseIds: [...caseIds],
    ...(policy ? { caseContinuityPolicy: policy, caseContinuityCaseIds: [...caseIds] } : {}),
    allowedMatterIds: [],
    allowedRelationshipThreadIds: [],
    allowedCityTrackIds: [],
    maxForegroundArcs: 1,
    maxNewActors: 0,
    maxNewDurableThreads: 1
  };
}

function response(caseId = 'case_parallel_vacant_flat'): NarratorResponse {
  return narratorResponseSchema.parse({
    narrativeText: '调查继续承接同一间空屋。',
    turnSummary: '同一宗空屋来电事件取得后续记录。',
    dramaExecutionTrace: {
      planId: 'drama_plan_turn_4',
      status: 'used_persistently',
      usedSourceRefs: [sourceRef],
      resultingWritebackRefs: [
        { kind: 'case', id: caseId },
        { kind: 'case_evidence', id: 'evidence_phone_log' }
      ],
      narrativeArcProgress: [
        {
          arcInstanceId: 'arc_vacant_flat_calls',
          sourceRef,
          decision: 'advance_stage',
          currentStageId: 'street_rumor',
          nextStageId: 'first_clues',
          usedNodeIds: ['node_phone_log'],
          supportingWritebackRefs: [{ kind: 'case', id: caseId }]
        }
      ]
    },
    writeback: {
      casePatches: [
        {
          caseId,
          title: '另一宗空屋来电案',
          status: 'investigating',
          activityLog: [{ kind: 'created', summary: '新建了平行案件。' }]
        }
      ],
      caseEvidencePatches: [
        { evidenceId: 'evidence_phone_log', caseId, summary: '同一电话的后续记录。' }
      ],
      currentMatterPatches: [
        {
          id: 'matter_vacant_flat',
          title: '继续核对空屋来电',
          relatedCaseIds: [caseId, 'case_existing_vacant_flat']
        }
      ],
      signalPatches: [
        { id: 'signal_vacant_flat', title: '空屋电话记录', relatedCaseIds: [caseId] }
      ],
      deferredEventPatches: [
        {
          eventId: 'event_phone_company_reply',
          summary: '等待电话公司回复。',
          relatedIds: { caseId }
        }
      ]
    }
  });
}

describe('drama case continuity', () => {
  it('reconciles one parallel candidate and every typed case reference to the linked case', () => {
    const state = stateWithCases('case_existing_vacant_flat');
    const original = response();

    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract(['case_existing_vacant_flat']),
      executionTrace: original.dramaExecutionTrace
    });

    expect(result.response.writeback.casePatches[0]).toMatchObject({
      caseId: 'case_existing_vacant_flat',
      activityLog: [expect.objectContaining({ kind: 'note' })]
    });
    expect(result.response.writeback.caseEvidencePatches[0]?.caseId).toBe(
      'case_existing_vacant_flat'
    );
    expect(result.response.writeback.currentMatterPatches[0]?.relatedCaseIds).toEqual([
      'case_existing_vacant_flat'
    ]);
    expect(result.response.writeback.signalPatches[0]?.relatedCaseIds).toEqual([
      'case_existing_vacant_flat'
    ]);
    expect(result.response.writeback.deferredEventPatches[0]?.relatedIds.caseId).toBe(
      'case_existing_vacant_flat'
    );
    expect(result.executionTrace?.resultingWritebackRefs).toContainEqual({
      kind: 'case',
      id: 'case_existing_vacant_flat'
    });
    expect(
      result.executionTrace?.narrativeArcProgress?.[0]?.supportingWritebackRefs
    ).toContainEqual({ kind: 'case', id: 'case_existing_vacant_flat' });
    expect(result.caseIdAliases).toEqual({
      case_parallel_vacant_flat: 'case_existing_vacant_flat'
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'drama_case_continuity_reconciled' })
    ]);
    expect(original.writeback.casePatches[0]?.caseId).toBe('case_parallel_vacant_flat');
    expect(Object.keys(state.cases)).toEqual(['case_existing_vacant_flat']);
  });

  it('applies a reconciled continuation to the existing case without persisting a duplicate case', () => {
    const state = stateWithCases('case_existing_vacant_flat');
    const original = response();
    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract(['case_existing_vacant_flat']),
      executionTrace: original.dramaExecutionTrace
    });
    const normalizedResponse: NarratorResponse = {
      ...result.response,
      writeback: {
        ...result.response.writeback,
        caseEvidencePatches: [],
        currentMatterPatches: [],
        signalPatches: [],
        deferredEventPatches: []
      }
    };

    const nextState = applyNarratorResponse(state, normalizedResponse, {
      playerInput: '继续核对同一间空屋的电话记录。'
    });

    expect(Object.keys(nextState.cases)).toEqual(['case_existing_vacant_flat']);
    expect(nextState.cases.case_existing_vacant_flat?.activityLog).toEqual([
      expect.objectContaining({ kind: 'note', summary: '新建了平行案件。' })
    ]);
  });

  it('allows the first case when the arc has not linked an existing case yet', () => {
    const state = stateWithCases();
    const original = response();
    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract([])
    });

    expect(result.response).toBe(original);
    expect(result.diagnostics).toEqual([]);
  });

  it('does not guess when more than one linked existing case is present', () => {
    const state = stateWithCases('case_a', 'case_b');
    const original = response();
    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract(['case_a', 'case_b'])
    });

    expect(result.response).toBe(original);
    expect(result.diagnostics).toEqual([]);
  });

  it('does not alter an already stable update', () => {
    const state = stateWithCases('case_existing_vacant_flat');
    const original = response('case_existing_vacant_flat');
    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract(['case_existing_vacant_flat'])
    });

    expect(result.response).toBe(original);
    expect(result.diagnostics).toEqual([]);
  });

  it('leaves ordinary sources free to create a new case', () => {
    const state = stateWithCases('case_existing_vacant_flat');
    const original = response();
    const result = enforceDramaCaseContinuity({
      state,
      response: original,
      contract: contract(['case_existing_vacant_flat'], 'allow_new')
    });

    expect(result.response).toBe(original);
    expect(result.diagnostics).toEqual([]);
  });
});
