import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { narratorResponseSchema } from '../writeback/schema';
import {
  enforceCivilianLivelihoodWritebackAtomicity,
  shouldRepairCivilianLivelihoodWriteback
} from './civilianLivelihoodWriteback';

function responseWith(writeback: Record<string, unknown>) {
  return narratorResponseSchema.parse({
    narrativeText: '本回合职业状态发生变化。',
    turnSummary: '玩家的职业状态发生变化。',
    suggestedActions: ['继续处理工作。'],
    writeback
  });
}

function civilianSalary(status: 'active' | 'paused' | 'ended' = 'active') {
  return {
    itemId: 'cashflow_player_civilian_primary_job',
    direction: 'income' as const,
    kind: 'salary' as const,
    title: '固定月薪',
    amount: 1800,
    account: 'bank' as const,
    identityBinding: 'civilian' as const,
    summary: '正式受雇后的固定月薪。',
    activeFromMonth: '1984-12',
    relatedAssetItemIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    source: 'writeback' as const,
    status,
    visibility: 'player_known' as const
  };
}

describe('civilian livelihood writeback coherence', () => {
  it('requests repair when an unemployed civilian receives a salary without a role update', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed'
    });
    const response = responseWith({
      financePatch: {
        upsertCashflows: [civilianSalary()]
      }
    });

    expect(shouldRepairCivilianLivelihoodWriteback(state, response)).toBe(true);
  });

  it('rejects an unpaired civilian salary instead of creating contradictory state', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed'
    });
    const response = responseWith({
      financePatch: {
        upsertCashflows: [civilianSalary()]
      }
    });

    const result = enforceCivilianLivelihoodWritebackAtomicity(state, response, '1984-12');

    expect(result.response.writeback.financePatch?.upsertCashflows).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'civilian_salary_without_role_profile_rejected' })
    );
  });

  it('keeps a paired employment profile and salary writeback', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed'
    });
    const employerOrganizationId = Object.keys(state.organizations)[0];
    const response = responseWith({
      civilianRoleProfilePatch: {
        reason: '已经正式入职。',
        employmentStatusId: 'employed',
        employerOrganizationId,
        publicOccupation: '公司文员'
      },
      financePatch: {
        upsertCashflows: [civilianSalary()]
      }
    });

    const result = enforceCivilianLivelihoodWritebackAtomicity(state, response, '1984-12');

    expect(result.response.writeback.financePatch?.upsertCashflows).toHaveLength(1);
    expect(result.diagnostics).toEqual([]);
  });

  it('ends existing civilian salaries together with an explicit unemployment patch', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'news_production_staff'
    });
    state.finance.cashflows.cashflow_player_civilian_primary_job = civilianSalary();
    const response = responseWith({
      civilianRoleProfilePatch: {
        reason: '已经正式离职。',
        employmentStatusId: 'unemployed',
        employerOrganizationId: null
      }
    });

    const result = enforceCivilianLivelihoodWritebackAtomicity(state, response, '1985-01');

    expect(result.response.writeback.financePatch?.upsertCashflows).toContainEqual(
      expect.objectContaining({
        itemId: 'cashflow_player_civilian_primary_job',
        status: 'ended',
        activeToMonth: '1985-01'
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'civilian_salary_closed_with_employment' })
    );
  });

  it('resolves old livelihood matters when employment ends and keeps new matters', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'news_production_staff'
    });
    const now = { ...state.time };
    state.dynamicEvents.currentMatters.matter_old_shift = {
      id: 'matter_old_shift',
      title: '午市顶班',
      summary: '旧雇主要求玩家临时顶班。',
      status: 'active',
      priority: 60,
      visibility: 'known',
      source: 'workplace',
      matterKind: 'livelihood',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    const response = responseWith({
      civilianRoleProfilePatch: {
        reason: '已经正式离职。',
        employmentStatusId: 'unemployed'
      },
      currentMatterPatches: [
        {
          id: 'matter_job_search',
          title: '寻找新工作',
          summary: '玩家准备联系旧同事打听职位。',
          status: 'active',
          matterKind: 'livelihood'
        }
      ]
    });

    const result = enforceCivilianLivelihoodWritebackAtomicity(
      state,
      response,
      '1985-01'
    );

    expect(result.response.writeback.currentMatterPatches).toContainEqual(
      expect.objectContaining({
        id: 'matter_old_shift',
        status: 'resolved',
        unread: false
      })
    );
    expect(result.response.writeback.currentMatterPatches).toContainEqual(
      expect.objectContaining({
        id: 'matter_job_search',
        status: 'active'
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'civilian_livelihood_matters_closed_with_role_change'
      })
    );
  });

  it('resolves old livelihood matters when the employer changes', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'news_production_staff'
    });
    const now = { ...state.time };
    state.dynamicEvents.currentMatters.matter_old_editor = {
      id: 'matter_old_editor',
      title: '旧编辑催稿',
      summary: '旧报馆编辑仍在等待稿件。',
      status: 'dormant',
      priority: 40,
      visibility: 'known',
      source: 'workplace',
      matterKind: 'livelihood',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    state.organizations.org_new_employer = {
      ...Object.values(state.organizations)[0],
      organizationId: 'org_new_employer',
      name: '永昌印务公司'
    };
    const response = responseWith({
      civilianRoleProfilePatch: {
        reason: '玩家转到新公司。',
        employmentStatusId: 'employed',
        employerOrganizationId: 'org_new_employer',
        publicOccupation: '印刷制作员'
      }
    });

    const result = enforceCivilianLivelihoodWritebackAtomicity(
      state,
      response,
      '1985-01'
    );

    expect(result.response.writeback.currentMatterPatches).toContainEqual(
      expect.objectContaining({
        id: 'matter_old_editor',
        status: 'resolved'
      })
    );
  });
});
