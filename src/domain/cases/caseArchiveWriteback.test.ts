import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import type { CaseFile } from '../runtime/types';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { validateNarratorResponse } from '../writeback/validateWriteback';

function createLeadCase(state: ReturnType<typeof createInitialRuntimeState>): CaseFile {
  return {
    caseId: 'case_archive_writeback',
    title: '和胜和高利贷组织犯罪案',
    caseType: 'organized_financial_crime',
    status: 'sentenced',
    playerRole: 'lead',
    summary: '法院已经判决。',
    currentFocus: '整理卷宗并办理归档。',
    playerVisibleProgress: '结案文书已经签署。',
    internalProgressSummary: '等待归档。',
    relatedActorIds: [state.player.actorId],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: { ...state.time },
    updatedAt: { ...state.time }
  };
}

describe('case archive writeback', () => {
  it('persists an archive transition and supplies a stable archive time when the patch omits it', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_writeback = createLeadCase(state);
    const response = validateNarratorResponse({
      narrativeText: '值日官核对文件后完成归档。',
      turnSummary: '案件正式归档。',
      suggestedActions: ['查看归档记录'],
      timePatch: { elapsedMinutes: 15, reason: '核对并封存卷宗。' },
      writeback: {
        casePatches: [{
          caseId: 'case_archive_writeback',
          status: 'archived',
          activityLog: [{ kind: 'archived', summary: '案件卷宗已封存归档。' }]
        }]
      }
    });

    const next = applyNarratorResponse(state, response);
    const reloaded = withRuntimeDefaults(structuredClone(next));

    expect(next.cases.case_archive_writeback).toMatchObject({
      status: 'archived',
      archivedAt: next.time
    });
    expect(reloaded.cases.case_archive_writeback.status).toBe('archived');
    expect(reloaded.cases.case_archive_writeback.archivedAt).toEqual(next.time);
    expect(Object.values(reloaded.memories)).toContainEqual(expect.objectContaining({
      kind: 'case',
      relatedCaseIds: ['case_archive_writeback'],
      certainty: 'fact',
      text: expect.stringContaining('和胜和高利贷组织犯罪案')
    }));
  });

  it('records an externally closed related case in memory exactly once', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_writeback = createLeadCase(state);
    state.cases.case_archive_writeback.playerRole = 'aware';
    state.cases.case_archive_writeback.relatedActorIds = [];
    const response = validateNarratorResponse({
      narrativeText: '检控部门通知，相关案件已由外部主办单位完成判决与归档。',
      turnSummary: '玩家收到相关案件正式结案通知。',
      suggestedActions: ['查看案件记录'],
      writeback: {
        casePatches: [{
          caseId: 'case_archive_writeback',
          status: 'archived',
          activityLog: [{ kind: 'archived', summary: '外部主办单位已完成归档。' }]
        }]
      }
    });

    const once = applyNarratorResponse(state, response);
    const twice = applyNarratorResponse(once, response);
    const linkedMemories = Object.values(twice.memories).filter(
      (memory) => memory.kind === 'case' && memory.relatedCaseIds.includes('case_archive_writeback')
    );

    expect(twice.cases.case_archive_writeback).toMatchObject({ status: 'archived', playerRole: 'aware' });
    expect(linkedMemories).toHaveLength(1);
    expect(linkedMemories[0].text).toContain('外部主办单位已完成归档');
  });

  it('keeps archive state and archive memory consistent when duplicate patches conflict', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_writeback = createLeadCase(state);
    const response = validateNarratorResponse({
      narrativeText: '值日官完成卷宗封存，后续重复字段不再撤销已成立的归档。',
      turnSummary: '案件正式归档。',
      suggestedActions: ['查看归档记录'],
      timePatch: { elapsedMinutes: 10, reason: '完成归档手续。' },
      writeback: {
        casePatches: [
          {
            caseId: 'case_archive_writeback',
            status: 'archived',
            activityLog: [{ kind: 'archived', summary: '案件卷宗已完成封存。' }]
          },
          {
            caseId: 'case_archive_writeback',
            status: 'investigating',
            internalProgressSummary: '重复写回误带了旧状态。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const laterResponse = validateNarratorResponse({
      narrativeText: '后续记录仍以已经成立的归档为准。',
      turnSummary: '归档状态保持。',
      suggestedActions: ['查看归档记录'],
      writeback: {
        casePatches: [{ caseId: 'case_archive_writeback', status: 'investigating' }]
      }
    });
    const afterLaterConflict = applyNarratorResponse(next, laterResponse);
    const linkedMemories = Object.values(afterLaterConflict.memories).filter(
      (memory) => memory.kind === 'case' && memory.relatedCaseIds.includes('case_archive_writeback')
    );

    expect(afterLaterConflict.cases.case_archive_writeback).toMatchObject({
      status: 'archived',
      archivedAt: next.time
    });
    expect(linkedMemories).toHaveLength(1);
    expect(linkedMemories[0].text).toContain('案件卷宗已完成封存');
  });

  it('collapses exact same-turn evidence patches but preserves a distinct evidence item', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_writeback = createLeadCase(state);
    const sharedPatch = {
      caseId: 'case_archive_writeback',
      title: '大福财务高利贷与夜场账本',
      evidenceType: 'document' as const,
      sourceSummary: '由玩家在本回合提交。',
      summary: '证明大福财务并非正规放贷，而是涉及洗钱的关键物证。',
      submittedByActorId: state.player.actorId,
      relatedActorIds: [state.player.actorId],
      relatedPlaceIds: []
    };
    const response = validateNarratorResponse({
      narrativeText: '值日官接收账本并登记证物。',
      turnSummary: '玩家提交了一份账本证物。',
      suggestedActions: ['继续整理卷宗'],
      writeback: {
        caseEvidencePatches: [
          { ...sharedPatch, evidenceId: 'evidence_ledger_a' },
          { ...sharedPatch, evidenceId: 'evidence_ledger_b' },
          {
            ...sharedPatch,
            evidenceId: 'evidence_ledger_distinct',
            summary: '账本夹页另有一条不同收款人的独立记录。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(Object.keys(next.caseEvidence)).toEqual([
      'evidence_ledger_a',
      'evidence_ledger_distinct'
    ]);
    expect(next.cases.case_archive_writeback.evidenceIds).toEqual([
      'evidence_ledger_a',
      'evidence_ledger_distinct'
    ]);
  });
});
