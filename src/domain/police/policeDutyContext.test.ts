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
    expect(projection.shiftLabel).toBe('晚更');
    expect(projection.scheduleWindow).toBe('14:00–22:45');
    expect(projection.currentDutySummary).toContain('1988年9月12日 星期一 晚更 14:00–22:45');
    expect(projection.nextDutySummary).toContain('1988年9月13日 星期二 晚更 14:00–22:45');
    expect(projection.rosterSummary).toContain('4天晚更');
    expect(projection.ordinaryTurnRules.join('\n')).toContain('不要因为玩家是警察就每回合自动新增报案');
    expect(projection.ordinaryTurnRules.join('\n')).toContain('交班、下班、补眠、私人生活');
  });

  it('assigns one actual uniform shift instead of treating all three shifts as simultaneous duty', () => {
    const beforeShift = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 13, hour: 10, minute: 0 },
      currentIdentity: 'police',
      lawIdentity: createLawIdentity()
    });
    const afterShift = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 13, hour: 23, minute: 10 },
      currentIdentity: 'police',
      lawIdentity: createLawIdentity()
    });

    expect(beforeShift.status).toBe('before_shift');
    expect(beforeShift.label).toBe('尚未开更');
    expect(beforeShift.summary).toContain('晚更 14:00–22:45');
    expect(afterShift.status).toBe('off_duty');
    expect(afterShift.label).toBe('已交班');
  });

  it('keeps overnight duty attached to the previous roster day until morning handover', () => {
    const projection = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 19, hour: 5, minute: 55 },
      currentIdentity: 'police',
      lawIdentity: createLawIdentity()
    });

    expect(projection.status).toBe('near_shift_end');
    expect(projection.shiftKind).toBe('night');
    expect(projection.currentDutySummary).toBe('夜更（昨日22:00–今日06:45）');
    expect(projection.nextDutySummary).toContain('1988年9月19日 星期一 夜更 22:00–次日06:45');
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
    expect(projection.currentDutySummary).toContain('1988年9月17日 星期六 轮休');
  });

  it('uses a clear weekday office roster for non-uniform police assignments', () => {
    const officeIdentity = createLawIdentity({
      department: 'Criminal Investigation Department（刑事侦缉处 CID）',
      assignmentSummary: 'Case Officer（案件调查员）',
      dutySummary: '案件调查、文件与证人联络。'
    });
    const monday = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 12, hour: 10, minute: 0 },
      currentIdentity: 'police',
      lawIdentity: officeIdentity
    });
    const saturday = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 17, hour: 10, minute: 0 },
      currentIdentity: 'police',
      lawIdentity: officeIdentity
    });

    expect(monday.status).toBe('on_duty');
    expect(monday.shiftLabel).toBe('日勤');
    expect(monday.scheduleWindow).toBe('09:00–18:00');
    expect(monday.rosterSummary).toContain('周一至周五');
    expect(saturday.status).toBe('rest_day');
    expect(saturday.nextDutySummary).toContain('1988年9月19日 星期一 日勤 09:00–18:00');
  });

  it('does not project police duty pressure for non-police identities', () => {
    const projection = projectPoliceDutyContext({
      time: { year: 1988, month: 9, day: 12, hour: 22, minute: 13 },
      currentIdentity: 'civilian',
      lawIdentity: createLawIdentity()
    });

    expect(projection.available).toBe(false);
    expect(projection.status).toBe('not_applicable');
    expect(projection.shiftKind).toBe('not_applicable');
  });
});
