import { describe, expect, it } from 'vitest';
import type { NarratorClient, NarratorStreamOptions } from '../narrator/NarratorClient';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import type { CaseFile } from '../runtime/types';
import { runPlayerTurn } from '../turn/TurnEngine';

class CaseActionMainNarrator implements NarratorClient {
  prompt = '';

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    this.prompt = prompt;
    const response = {
      narrativeText: '值日官逐页核对判决书、证物移交表和结案文书，确认手续齐全。',
      turnSummary: '案件已经完成判决、结案和卷宗核对，值日官确认可以归档。',
      suggestedActions: ['查看已归档案件', '继续处理其他案件'],
      playerVitalsReview: {
        changed: false,
        reason: '本回合仅办理文书手续。'
      },
      timePatch: { elapsedMinutes: 20, reason: '核对结案卷宗并办理归档手续。' },
      writeback: {}
    };
    options?.onTextDelta?.(response.narrativeText);
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

class CaseActionRepairNarrator implements NarratorClient {
  prompts: string[] = [];

  async complete(prompt: string): Promise<unknown> {
    this.prompts.push(prompt);
    if (prompt.includes('CASE_ARCHIVE_DECISIONS_TASK')) {
      return {
        caseArchiveDecisions: Array.from(prompt.matchAll(/"caseId":"([^"]+)"/g), (match) => match[1])
          .filter((caseId, index, all) => all.indexOf(caseId) === index)
          .map((caseId) => ({
            caseId,
            decision: 'archive',
            reason: '判决、证物移交和结案手续均已完成。'
          }))
      };
    }
    return {};
  }
}

function createLeadCase(state: ReturnType<typeof createInitialRuntimeState>): CaseFile {
  return {
    caseId: 'case_archive_turn',
    title: '砵兰街旧唐楼非法逼迁案',
    caseType: 'organized_crime',
    status: 'sentenced',
    playerRole: 'lead',
    summary: '法院已作出判决。',
    currentFocus: '完成卷宗归档。',
    playerVisibleProgress: '判决书与结案文书均已签署。',
    internalProgressSummary: '等待值日官核验归档材料。',
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

describe('case action turn integration', () => {
  it('carries an archive button intent through prompt, repair, application, and reload', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_turn = createLeadCase(state);
    const narrator = new CaseActionMainNarrator();
    const repair = new CaseActionRepairNarrator();

    const next = await runPlayerTurn({
      state,
      playerInput: '我申请将【砵兰街旧唐楼非法逼迁案】归档，并说明理由。',
      caseActionIntent: { kind: 'archive_request', caseId: 'case_archive_turn' },
      narrator,
      writebackRepair: repair
    });
    const reloaded = withRuntimeDefaults(structuredClone(next));

    expect(narrator.prompt).toContain('CASE_ACTION_INTENT');
    expect(narrator.prompt).toContain('caseId=case_archive_turn');
    expect(repair.prompts.some((prompt) => prompt.includes('CASE_ARCHIVE_DECISIONS_TASK'))).toBe(true);
    expect(next.cases.case_archive_turn.status).toBe('archived');
    expect(next.cases.case_archive_turn.archivedAt).toEqual(next.time);
    expect(next.cases.case_archive_turn.activityLog).toContainEqual(
      expect.objectContaining({ kind: 'archived', visibleToPlayer: true })
    );
    expect(reloaded.cases.case_archive_turn).toMatchObject({
      status: 'archived',
      archivedAt: next.time
    });
  });

  it('archives two named cases in one turn, then retains both after reload', async () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    state.cases.case_archive_turn = createLeadCase(state);
    state.cases.case_archive_second = {
      ...createLeadCase(state),
      caseId: 'case_archive_second',
      title: '蔡少芬受虐与社团逼债案',
      status: 'tried'
    };
    const narrator = new CaseActionMainNarrator();
    const repair = new CaseActionRepairNarrator();

    const next = await runPlayerTurn({
      state,
      playerInput: '我申请将【砵兰街旧唐楼非法逼迁案】归档。我申请将【蔡少芬受虐与社团逼债案】归档。',
      narrator,
      writebackRepair: repair
    });
    const reloaded = withRuntimeDefaults(structuredClone(next));

    expect(repair.prompts).toHaveLength(1);
    expect(reloaded.cases.case_archive_turn.status).toBe('archived');
    expect(reloaded.cases.case_archive_second.status).toBe('archived');
  });
});
