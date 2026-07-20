import { describe, expect, it } from 'vitest';
import { BackgroundEvolutionProtocolError, parseBackgroundEvolutionWriteback } from './protocol';

describe('background evolution protocol', () => {
  it('soft-drops one invalid patch while preserving a valid stable-ID patch', () => {
    const result = parseBackgroundEvolutionWriteback({
      npcTrackPatches: [
        {
          operation: 'create',
          trackId: 'track_liu_case',
          actorId: 'actor_liu',
          reviewKey: 'npc:actor_liu:1984-12-27T09:00:turn_1',
          reason: '刘启负责该案，需要开始一项远场调查。',
          sourceRefs: { actorIds: ['actor_liu'], caseIds: ['case_stolen_car'] },
          status: 'active',
          actionKind: 'case',
          objective: '核对目击时间',
          currentAction: '走访夜班工人',
          currentStatus: '调查中',
          nextReviewAt: { year: 1984, month: 12, day: 27, hour: 15, minute: 0 }
        },
        {
          operation: 'update',
          actorName: '刘启',
          reason: '试图用姓名定位',
          sourceRefs: {}
        }
      ]
    });

    expect(result.writeback.npcTrackPatches).toHaveLength(1);
    expect(result.writeback.npcTrackPatches[0]?.actorId).toBe('actor_liu');
    expect(result.droppedItemCount).toBe(1);
  });

  it('treats a non-object response as a fatal protocol error', () => {
    expect(() => parseBackgroundEvolutionWriteback('not-json')).toThrow(BackgroundEvolutionProtocolError);
  });

  it('accepts an explicit terminal non-case memory decision', () => {
    const result = parseBackgroundEvolutionWriteback({
      npcTrackPatches: [
        {
          operation: 'settle',
          trackId: 'track_lau_contact',
          actorId: 'actor_lau',
          outcomeKind: 'progress',
          outcomeSummary: '刘启确认了一条以后仍会使用的联络渠道。',
          persistToMemory: true,
          reviewKey: 'npc:track_lau_contact:1984-12-27T15:00:turn_2',
          reason: '结果会持续改变人物之后的联络选择。',
          sourceRefs: { actorIds: ['actor_lau'] }
        }
      ]
    });

    expect(result.writeback.npcTrackPatches[0]?.persistToMemory).toBe(true);
  });

  it('accepts only the restricted organization evolution contract and rejects profile rewrites', () => {
    const base = {
      operation: 'activate',
      trackId: 'organization_track_tvb',
      organizationId: 'org_tvb',
      reviewKey: 'organization:org_tvb:1984-12-27T09:00:turn_1',
      reason: '玩家已经与电视台形成公开采访关系。',
      sourceRefs: { organizationIds: ['org_tvb'] },
      status: 'planned',
      objective: '安排一轮采访',
      currentAction: '协调采访组',
      currentStatus: '等待档期确认',
      expectedEndAt: { year: 1984, month: 12, day: 29, hour: 9, minute: 0 },
      nextReviewAt: { year: 1984, month: 12, day: 28, hour: 9, minute: 0 }
    };
    const result = parseBackgroundEvolutionWriteback({
      organizationEvolutionPatches: [base, { ...base, trackId: 'bad_track', name: '擅自改名' }]
    });

    expect(result.writeback.organizationEvolutionPatches).toHaveLength(1);
    expect(result.writeback.organizationEvolutionPatches[0]).toMatchObject({
      organizationId: 'org_tvb',
      operation: 'activate'
    });
    expect(result.droppedItemCount).toBe(1);
  });

  it('rejects impossible calendar dates without discarding valid sibling patches', () => {
    const base = {
      operation: 'update',
      trackId: 'track_factory_shift',
      reviewKey: 'city:track_factory_shift:1984-12-31T19:20:turn_1',
      reason: '跨年货运仍需按合法日期复核。',
      sourceRefs: { cityTrackIds: ['track_factory_shift'] },
      summary: '厂商继续协调北运档期。'
    };
    const result = parseBackgroundEvolutionWriteback({
      citySituationTrackPatches: [
        {
          ...base,
          nextReviewAt: { year: 1984, month: 12, day: 32, hour: 19, minute: 20 }
        },
        {
          ...base,
          trackId: 'track_factory_shift_valid',
          reviewKey: 'city:track_factory_shift_valid:1985-01-01T19:20:turn_1',
          sourceRefs: { cityTrackIds: ['track_factory_shift_valid'] },
          nextReviewAt: { year: 1985, month: 1, day: 1, hour: 19, minute: 20 }
        }
      ]
    });

    expect(result.writeback.citySituationTrackPatches).toHaveLength(1);
    expect(result.writeback.citySituationTrackPatches[0]?.trackId).toBe('track_factory_shift_valid');
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'too_big' })
    ]));
    expect(result.droppedItemCount).toBe(1);
  });
});
