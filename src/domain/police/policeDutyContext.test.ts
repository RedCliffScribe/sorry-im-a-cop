import { describe, expect, it } from 'vitest';
import { projectPoliceDutyContext } from './policeDutyContext';
import type { LawIdentityRuntime } from '../runtime/types';

function createLawIdentity(overrides: Partial<LawIdentityRuntime> = {}): LawIdentityRuntime {
  return {
    status: 'active',
    agencyId: 'org_hk_police',
    stationOrPost: 'Mong Kok Police Station',
    department: 'Uniform Branch（军装巡逻）',
    rank: 'Constable',
    assignmentSummary: 'Patrol Constable（巡逻警员）',
    supervisorActorIds: [],
    peerActorIds: [],
    authoritySummary: '基础警务权限。',
    accessSummary: '可接触岗位相关资料。',
    dutySummary: '军装巡逻与街面处置。',
    institutionalReputation: '暂无稳定评价。',
    disciplinePressureSummary: '受警队纪律和上级链条约束。',
    ...overrides
  };
}

describe('police duty context projection', () => {
  it('marks a uniform patrol turn near handover as breathing room instead of auto-new duty', () => {
    const projection = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 12, hour: 22, minute: 13 },
      currentIdentity: 'police',
      lawIdentity: createLawIdentity()
    });

    expect(projection.status).toBe('near_shift_end');
    expect(projection.label).toBe('临近交班');
    expect(projection.ordinaryTurnRules.join('\n')).toContain('不要因为玩家是警察就每回合自动新增报案');
    expect(projection.ordinaryTurnRules.join('\n')).toContain('交班、下班、补眠、私人生活');
  });

  it('keeps room for rest days in the lightweight uniform rhythm', () => {
    const projection = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 17, hour: 10, minute: 0 },
      currentIdentity: 'police',
      lawIdentity: createLawIdentity()
    });

    expect(projection.status).toBe('rest_day');
    expect(projection.label).toBe('轮休中');
    expect(projection.summary).toContain('自由活动空间');
  });

  it('does not project police duty pressure for non-police identities', () => {
    const projection = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 12, hour: 22, minute: 13 },
      currentIdentity: 'civilian',
      lawIdentity: createLawIdentity()
    });

    expect(projection.available).toBe(false);
    expect(projection.status).toBe('not_applicable');
  });
});
