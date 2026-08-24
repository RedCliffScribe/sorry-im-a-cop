import { describe, expect, it } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CaseFile, RuntimeState } from '../runtime/types';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import {
  formatCaseActionIntentForPrompt,
  repairCaseActionIntent,
  repairCaseActionIntents,
  resolveCaseActionIntent,
  resolveCaseActionIntents
} from './caseActionIntent';

function leadCase(state: RuntimeState, overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    caseId: 'case_archive_test',
    title: '油麻地高利贷案',
    caseType: 'organized_financial_crime',
    status: 'sentenced',
    playerRole: 'lead',
    summary: '法院已经判决。',
    currentFocus: '整理卷宗并办理归档。',
    playerVisibleProgress: '判决和结案文书已经签署。',
    internalProgressSummary: '等待归档。',
    relatedActorIds: [state.player.actorId],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: state.time,
    updatedAt: state.time,
    ...overrides
  };
}

function response(casePatches: unknown[] = []) {
  return validateNarratorResponse({
    narrativeText: '值日官核对卷宗后给出了明确答复。',
    turnSummary: '玩家已向值日官提交案件归档申请，并取得正式答复。',
    suggestedActions: ['查看案件记录', '继续处理其他事务'],
    writeback: { casePatches }
  });
}

class ArchiveDecisionClient implements NarratorClient {
  prompt = '';

  constructor(private readonly result: unknown) {}

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return this.result;
  }
}

describe('case action intent', () => {
  it('resolves an exact lead-case archive action and emits a stable prompt contract', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    const resolved = resolveCaseActionIntent({
      state,
      playerInput: '我申请将【油麻地高利贷案】归档，并说明理由。',
      intent: { kind: 'archive_request', caseId: 'case_archive_test' }
    });

    expect(resolved).toMatchObject({
      caseId: 'case_archive_test',
      currentStatus: 'sentenced',
      playerRole: 'lead'
    });
    expect(formatCaseActionIntentForPrompt(resolved!)).toContain('caseId=case_archive_test');
  });

  it('rejects a stale hidden intent when the submitted text names a different action', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);

    expect(resolveCaseActionIntent({
      state,
      playerInput: '我先去食堂吃饭。',
      intent: { kind: 'archive_request', caseId: 'case_archive_test' }
    })).toBeUndefined();
  });

  it('falls back to the exact case named by edited text when a hidden draft intent became stale', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    state.cases.case_archive_second = leadCase(state, {
      caseId: 'case_archive_second',
      title: '砵兰街非法逼迁案'
    });

    expect(resolveCaseActionIntent({
      state,
      playerInput: '申请将【砵兰街非法逼迁案】归档。',
      intent: { kind: 'archive_request', caseId: 'case_archive_test' }
    })).toMatchObject({ caseId: 'case_archive_second' });
  });

  it('does not expand an exact bracketed case title into another case whose title is a substring', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    state.cases.case_archive_followup = leadCase(state, {
      caseId: 'case_archive_followup',
      title: '油麻地高利贷案续案'
    });

    expect(resolveCaseActionIntents({
      state,
      playerInput: '申请将【油麻地高利贷案续案】归档。',
      intent: { kind: 'archive_request', caseId: 'case_archive_followup' }
    }).map((item) => item.caseId)).toEqual(['case_archive_followup']);
  });

  it('prefers the longest non-overlapping case title in legacy unbracketed archive text', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    state.cases.case_archive_followup = leadCase(state, {
      caseId: 'case_archive_followup',
      title: '油麻地高利贷案续案'
    });

    expect(resolveCaseActionIntents({
      state,
      playerInput: '申请将油麻地高利贷案续案归档。'
    }).map((item) => item.caseId)).toEqual(['case_archive_followup']);
  });

  it('keeps an existing valid archive patch and adds a visible archive activity', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    const intent = resolveCaseActionIntent({
      state,
      playerInput: '申请将【油麻地高利贷案】归档。'
    });
    const repair = new ArchiveDecisionClient({});

    const result = await repairCaseActionIntent({
      state,
      response: response([{ caseId: 'case_archive_test', status: 'archived' }]),
      intent,
      playerInput: '申请将【油麻地高利贷案】归档。',
      writebackRepair: repair
    });

    expect(repair.prompt).toBe('');
    expect(result.response.writeback.casePatches[0]).toMatchObject({ status: 'archived' });
    expect(result.response.writeback.casePatches[0].activityLog).toContainEqual(
      expect.objectContaining({ kind: 'archived', visibleToPlayer: true })
    );
  });

  it('repairs an omitted archive writeback through a bounded decision call', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    const intent = resolveCaseActionIntent({
      state,
      playerInput: '申请将【油麻地高利贷案】归档。'
    });
    const repair = new ArchiveDecisionClient({
      caseArchiveDecision: { decision: 'archive', reason: '判决、卷宗和结案手续均已完成。' }
    });

    const result = await repairCaseActionIntent({
      state,
      response: response(),
      intent,
      playerInput: '申请将【油麻地高利贷案】归档。',
      writebackRepair: repair
    });

    expect(repair.prompt).toContain('CASE_ARCHIVE_DECISIONS_TASK');
    expect(repair.prompt).toContain('case_archive_test');
    expect(result.response.writeback.casePatches).toContainEqual(
      expect.objectContaining({ caseId: 'case_archive_test', status: 'archived' })
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves and repairs every named lead case in one archive action and one bounded call', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state);
    state.cases.case_archive_second = leadCase(state, {
      caseId: 'case_archive_second',
      title: '蔡少芬受虐与社团逼债案',
      status: 'court_scheduled'
    });
    const playerInput = '我申请将【油麻地高利贷案】归档，并说明理由。我申请将【蔡少芬受虐与社团逼债案】归档，并说明理由。';
    const intents = resolveCaseActionIntents({ state, playerInput });
    const repair = new ArchiveDecisionClient({
      caseArchiveDecisions: [
        { caseId: 'case_archive_test', decision: 'archive', reason: '判决与结案手续均已完成。' },
        { caseId: 'case_archive_second', decision: 'defer', reason: '仍需等待法庭作出正式裁决。' }
      ]
    });

    const result = await repairCaseActionIntents({
      state,
      response: response(),
      intents,
      playerInput,
      writebackRepair: repair
    });

    expect(intents.map((intent) => intent.caseId)).toEqual(['case_archive_test', 'case_archive_second']);
    expect(repair.prompt).toContain('case_archive_test');
    expect(repair.prompt).toContain('case_archive_second');
    expect(result.response.writeback.casePatches).toEqual(expect.arrayContaining([
      expect.objectContaining({ caseId: 'case_archive_test', status: 'archived' }),
      expect.objectContaining({
        caseId: 'case_archive_second',
        activityLog: expect.arrayContaining([
          expect.objectContaining({ kind: 'instruction', summary: expect.stringContaining('等待法庭') })
        ])
      })
    ]));
    expect(result.diagnostics).toEqual([]);
  });

  it('records an explicit visible reason when the archive request is deferred', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_test = leadCase(state, { status: 'investigating' });
    const intent = resolveCaseActionIntent({
      state,
      playerInput: '申请将【油麻地高利贷案】归档。'
    });
    const repair = new ArchiveDecisionClient({
      caseArchiveDecision: { decision: 'defer', reason: '仍需等待检控部门退回最后一份文件。' }
    });

    const result = await repairCaseActionIntent({
      state,
      response: response(),
      intent,
      playerInput: '申请将【油麻地高利贷案】归档。',
      writebackRepair: repair
    });
    const patch = result.response.writeback.casePatches[0];

    expect(patch.status).toBeUndefined();
    expect(patch.activityLog).toContainEqual(
      expect.objectContaining({
        kind: 'instruction',
        summary: expect.stringContaining('仍需等待检控部门')
      })
    );
  });
});
