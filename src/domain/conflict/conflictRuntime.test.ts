import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { GameTime, RuntimeState } from '../runtime/types';
import { applyCombatEventPatch, applyJudgementCheckPatch, linkConflictRecordsToStoryEntry } from './conflictRuntime';

const gameTime: GameTime = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };

function baseState(): RuntimeState {
  return {
    ...createInitialRuntimeState(),
    time: gameTime,
    storyLog: [
      {
        turnId: 'turn_1',
        speaker: 'narrator',
        text: '【旁白】后巷里有人抽刀。',
        gameTime
      }
    ],
    turnCounter: 1
  };
}

describe('conflict runtime defaults', () => {
  it('initializes judgement and combat stores', () => {
    const state = createInitialRuntimeState();

    expect(state.judgementChecks).toEqual({});
    expect(state.combatEvents).toEqual({});
  });
});

describe('conflict runtime patch application', () => {
  it('stores judgement checks and derives clamped margin', () => {
    const state = baseState();
    const check = applyJudgementCheckPatch(state, {
      checkId: 'check_1',
      turnId: 'turn_1',
      gameTime,
      title: '夺刀压制',
      category: 'melee',
      difficulty: 140,
      score: -10,
      outcome: 'failure',
      shortSummary: '试图夺刀但被迫后退。',
      factors: [{ label: '环境', value: -6, reason: '雨水让地面湿滑。' }],
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known'
    });

    expect(check.difficulty).toBe(100);
    expect(check.score).toBe(0);
    expect(check.margin).toBe(-100);
    expect(state.judgementChecks.check_1).toEqual(check);
  });

  it('stores combat events and links visible records to the story entry', () => {
    const state = baseState();

    applyJudgementCheckPatch(state, {
      checkId: 'check_1',
      turnId: 'turn_1',
      gameTime,
      title: '近身压制',
      category: 'melee',
      difficulty: 55,
      score: 67,
      outcome: 'success',
      shortSummary: '成功压住对方持刀手。',
      factors: [],
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known'
    });

    applyCombatEventPatch(state, {
      combatId: 'combat_1',
      turnId: 'turn_1',
      gameTime,
      title: '旺角后巷持刀冲突',
      type: 'armed',
      locationSummary: '旺角后巷',
      participants: [{ name: '玩家', side: 'player', roleSummary: '当值警员' }],
      outcome: 'opponent_subdued',
      intensity: 75,
      animationKey: 'armed_alley',
      combatText: '雨水顺着铁皮棚滴下来，对方抽刀贴着路灯反光往你肋下扎，你侧身压腕，将人顶到卷闸门上。',
      resultSummary: '成功控制持刀者。',
      consequenceSummary: '玩家体力下降，对方右腕受伤。',
      judgementCheckIds: ['check_1'],
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known',
      unread: true,
      createdAt: gameTime
    });

    linkConflictRecordsToStoryEntry(state, 'turn_1');

    expect(state.storyLog[0].judgementCheckIds).toEqual(['check_1']);
    expect(state.storyLog[0].combatEventIds).toEqual(['combat_1']);
    expect(state.judgementChecks.check_1.relatedCombatEventId).toBe('combat_1');
  });
});
