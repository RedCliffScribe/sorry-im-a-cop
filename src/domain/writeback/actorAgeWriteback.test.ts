import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyNarratorResponse } from './applyWriteback';
import { validateNarratorResponse } from './validateWriteback';

function response(writeback: Record<string, unknown>, targetTime = { year: 1989, month: 2, day: 1, hour: 12, minute: 0 }) {
  return validateNarratorResponse({
    narrativeText: '时间向前推进，人物继续各自的生活。',
    turnSummary: '时间推进后，人物年龄与档案保持一致。',
    suggestedActions: ['继续行动'],
    timePatch: { targetTime, reason: '年龄跨年测试。' },
    writeback
  });
}

describe('actor age writeback boundary', () => {
  it('recalculates player and NPC cached ages when a turn crosses their birthdays', () => {
    const state = createInitialRuntimeState({
      birthDate: '1972-01-15',
      startTime: { year: 1988, month: 12, day: 31, hour: 12, minute: 0 }
    });
    state.actors.npc_age = createActorDefaults({
      actorId: 'npc_age',
      name: '陈嘉豪',
      currentIdentity: 'civilian',
      publicIdentity: '电台职员',
      birthDate: '1965-01-10',
      computedAge: 23
    });

    const next = applyNarratorResponse(state, response({}));

    expect(next.actors.player.birthDate).toBe('1972-01-15');
    expect(next.actors.player.computedAge).toBe(17);
    expect(next.player.birthDate).toBe('1972-01-15');
    expect(next.actors.npc_age.computedAge).toBe(24);
  });

  it('ignores model attempts to overwrite an existing player age while applying neighboring fields', () => {
    const state = createInitialRuntimeState({
      birthDate: '1972-01-15',
      startTime: { year: 1988, month: 12, day: 31, hour: 12, minute: 0 }
    });
    const next = applyNarratorResponse(
      state,
      response({
        actorPatches: [
          {
            actorId: 'player',
            birthDate: '1899-01-01',
            computedAge: 90,
            statusSummary: '已经完成上午的巡逻。'
          }
        ]
      })
    );

    expect(next.actors.player.birthDate).toBe('1972-01-15');
    expect(next.actors.player.computedAge).toBe(17);
    expect(next.actors.player.statusSummary).toBe('已经完成上午的巡逻。');
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_immutable_demographic_ignored' })
    );
  });

  it('protects existing NPC demographics while applying an ordinary actor patch', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 12, day: 31, hour: 12, minute: 0 }
    });
    state.actors.npc_age = createActorDefaults({
      actorId: 'npc_age',
      name: '陈嘉豪',
      currentIdentity: 'civilian',
      publicIdentity: '电台职员',
      birthDate: '1965-01-10',
      computedAge: 23
    });
    const next = applyNarratorResponse(
      state,
      response({
        actorPatches: [
          {
            actorId: 'npc_age',
            birthDate: '1940-01-01',
            computedAge: 90,
            statusSummary: '正在剪辑晚间新闻。'
          }
        ]
      })
    );

    expect(next.actors.npc_age.birthDate).toBe('1965-01-10');
    expect(next.actors.npc_age.computedAge).toBe(24);
    expect(next.actors.npc_age.statusSummary).toBe('正在剪辑晚间新闻。');
  });

  it('derives a new NPC age from a valid birth date instead of trusting a conflicting cache', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1989, month: 1, day: 31, hour: 12, minute: 0 }
    });
    const next = applyNarratorResponse(
      state,
      response({
        actorPatches: [
          {
            actorId: 'npc_new_age',
            name: '梁美仪',
            gender: 'female',
            currentIdentity: 'civilian',
            publicIdentity: '杂志编辑',
            birthDate: '1965-05-20',
            computedAge: 90
          }
        ]
      })
    );

    expect(next.actors.npc_new_age.birthDate).toBe('1965-05-20');
    expect(next.actors.npc_new_age.computedAge).toBe(23);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_age_rederived_from_birth_date' })
    );
  });

  it('drops an invalid new birth date but keeps a valid approximate age', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1989, month: 1, day: 31, hour: 12, minute: 0 }
    });
    const next = applyNarratorResponse(
      state,
      response({
        actorPatches: [
          {
            actorId: 'npc_invalid_birth',
            name: '何志明',
            gender: 'male',
            currentIdentity: 'civilian',
            publicIdentity: '会计文员',
            birthDate: '1988-02-31',
            computedAge: 22
          }
        ]
      })
    );

    expect(next.actors.npc_invalid_birth.birthDate).toBeUndefined();
    expect(next.actors.npc_invalid_birth.computedAge).toBe(22);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toContainEqual(
      expect.objectContaining({ code: 'actor_invalid_birth_date_ignored' })
    );
  });

  it('does not invent a birth date when a new NPC only has an approximate age', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1989, month: 1, day: 31, hour: 12, minute: 0 }
    });
    const next = applyNarratorResponse(
      state,
      response({
        actorPatches: [
          {
            actorId: 'npc_age_only',
            name: '周国荣',
            gender: 'male',
            currentIdentity: 'civilian',
            publicIdentity: '运输公司经理',
            computedAge: 41
          }
        ]
      })
    );

    expect(next.actors.npc_age_only.birthDate).toBeUndefined();
    expect(next.actors.npc_age_only.computedAge).toBe(41);
  });
});
