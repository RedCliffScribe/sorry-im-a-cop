import { describe, expect, it } from 'vitest';
import type { CivilianRoleProfile } from '../runtime/types';
import { projectCivilianWorkSchedule } from './civilianWorkSchedule';

function createProfile(overrides: Partial<CivilianRoleProfile> = {}): CivilianRoleProfile {
  return {
    status: 'active',
    civilianProfileId: 'bank_employee',
    employmentStatusId: 'employed',
    publicOccupation: '银行文员',
    sectorIds: ['finance'],
    roleTags: ['clerk'],
    livelihoodActorIds: [],
    communitySummary: '办公室关系。',
    familyEconomicSummary: '收入稳定。',
    legalStatusSummary: '普通市民。',
    ...overrides
  };
}

describe('civilian work schedule projection', () => {
  it('uses a clear Monday-to-Friday schedule for a regular employed civilian', () => {
    const projection = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 12, hour: 10, minute: 0 },
      currentIdentity: 'civilian',
      profile: createProfile()
    });

    expect(projection.status).toBe('working');
    expect(projection.label).toBe('上班中');
    expect(projection.scheduleLabel).toBe('周一至周五 · 日班');
    expect(projection.scheduleWindow).toBe('09:00–18:00');
    expect(projection.nextWorkSummary).toContain('1988年9月13日 星期二 日班 09:00–18:00');
  });

  it('marks weekends and post-work hours as personal time', () => {
    const afterWork = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 12, hour: 20, minute: 0 },
      currentIdentity: 'civilian',
      profile: createProfile()
    });
    const weekend = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 17, hour: 10, minute: 0 },
      currentIdentity: 'civilian',
      profile: createProfile()
    });

    expect(afterWork.status).toBe('off_work');
    expect(afterWork.label).toBe('已下班');
    expect(weekend.status).toBe('rest_day');
    expect(weekend.nextWorkSummary).toContain('1988年9月19日 星期一');
  });

  it('keeps explicit night work overnight without treating Saturday daytime as work', () => {
    const nightProfile = createProfile({
      civilianProfileId: 'nightlife_staff',
      publicOccupation: '夜场侍应',
      dutySummary: '负责夜场楼面与交班。',
      sectorIds: ['nightlife'],
      roleTags: ['shift_work']
    });
    const overnight = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 17, hour: 1, minute: 0 },
      currentIdentity: 'civilian',
      profile: nightProfile
    });
    const saturdayDay = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 17, hour: 12, minute: 0 },
      currentIdentity: 'civilian',
      profile: nightProfile
    });

    expect(overnight.status).toBe('near_work_end');
    expect(overnight.currentWorkSummary).toBe('夜场班（昨日18:00–今日02:00）');
    expect(saturdayDay.status).toBe('rest_day');
  });

  it('does not force self-employed, freelance or unemployed players into weekday office hours', () => {
    const flexible = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 12, hour: 10, minute: 0 },
      currentIdentity: 'civilian',
      profile: createProfile({
        employmentStatusId: 'self_employed',
        roleTags: ['owner']
      })
    });
    const unemployed = projectCivilianWorkSchedule({
      time: { year: 1988, month: 9, day: 12, hour: 10, minute: 0 },
      currentIdentity: 'civilian',
      profile: createProfile({ employmentStatusId: 'unemployed' })
    });

    expect(flexible.status).toBe('flexible');
    expect(flexible.scheduleWindow).toBe('无固定朝九晚六');
    expect(unemployed.status).toBe('unemployed');
  });
});
