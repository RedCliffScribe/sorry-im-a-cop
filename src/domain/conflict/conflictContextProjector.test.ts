import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { CombatEvent, GameTime, JudgementCheck, RuntimeState } from '../runtime/types';
import { projectConflictContext } from './conflictContextProjector';

const baseTime: GameTime = { year: 1988, month: 9, day: 12, hour: 21, minute: 0 };

function gameTime(minute: number): GameTime {
  return { ...baseTime, minute };
}

function makeState(): RuntimeState {
  return {
    ...createInitialRuntimeState(),
    time: gameTime(30),
    judgementChecks: {},
    combatEvents: {}
  };
}

function makeJudgementCheck(checkId: string, overrides: Partial<JudgementCheck> = {}): JudgementCheck {
  return {
    checkId,
    turnId: 'turn_1',
    gameTime: gameTime(10),
    title: '近身压制判定',
    category: 'melee',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    difficulty: 55,
    score: 68,
    margin: 13,
    outcome: 'success',
    shortSummary: '成功压住对方持刀手。',
    consequenceSummary: '对方被迫后退。',
    factors: [],
    visibility: 'player_known',
    ...overrides
  };
}

function makeCombatEvent(index: number, overrides: Partial<CombatEvent> = {}): CombatEvent {
  return {
    combatId: `combat_${index}`,
    turnId: `turn_${index}`,
    gameTime: gameTime(index),
    title: `对抗记录 ${index}`,
    type: 'armed',
    locationSummary: '旺角后巷',
    participants: [
      {
        actorId: 'player',
        name: '玩家',
        side: 'player',
        roleSummary: '巡逻警员'
      }
    ],
    outcome: 'opponent_subdued',
    intensity: 40 + index,
    animationKey: 'armed_alley',
    combatText: '对方抽刀逼近，玩家侧身压腕，把人顶到卷闸门旁。',
    resultSummary: '成功控制对方。',
    consequenceSummary: '玩家体力下降，对方右腕受伤。',
    judgementCheckIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    visibility: 'player_known',
    unread: true,
    createdAt: gameTime(index),
    ...overrides
  };
}

describe('conflict context projector', () => {
  it('projects the latest visible combat events with a hard limit', () => {
    const state = makeState();
    for (let index = 1; index <= 5; index += 1) {
      state.combatEvents[`combat_${index}`] = makeCombatEvent(index);
    }

    const projection = projectConflictContext(state, { limit: 2 });

    expect(projection.combatEvents.map((event) => event.combatId)).toEqual(['combat_5', 'combat_4']);
    expect(projection.diagnostics).toMatchObject({
      sourceCount: 5,
      projectedCount: 2,
      omittedCount: 3,
      hiddenCount: 0
    });
    expect(projection.diagnostics.projectedCombatIds).toEqual(['combat_5', 'combat_4']);
  });

  it('filters hidden events and includes judgement checks linked to projected events', () => {
    const state = makeState();
    state.judgementChecks.check_1 = makeJudgementCheck('check_1');
    state.judgementChecks.hidden_check = makeJudgementCheck('hidden_check', { visibility: 'hidden' });
    state.combatEvents.combat_visible = makeCombatEvent(1, {
      combatId: 'combat_visible',
      judgementCheckIds: ['check_1', 'hidden_check']
    });
    state.combatEvents.combat_hidden = makeCombatEvent(2, {
      combatId: 'combat_hidden',
      visibility: 'hidden',
      judgementCheckIds: ['check_1']
    });

    const projection = projectConflictContext(state, { limit: 4 });

    expect(projection.combatEvents.map((event) => event.combatId)).toEqual(['combat_visible']);
    expect(projection.judgementChecks.map((check) => check.checkId)).toEqual(['check_1']);
    expect(projection.diagnostics.hiddenCount).toBe(1);
    expect(projection.diagnostics.projectedJudgementCheckIds).toEqual(['check_1']);
  });

  it('ranks current-place and player-related conflicts above unrelated newer events', () => {
    const state = makeState();
    state.combatEvents.newer_unrelated = makeCombatEvent(20, {
      combatId: 'newer_unrelated',
      relatedActorIds: [],
      relatedPlaceIds: []
    });
    state.combatEvents.current_place = makeCombatEvent(10, {
      combatId: 'current_place',
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    state.combatEvents.player_related = makeCombatEvent(9, {
      combatId: 'player_related',
      relatedActorIds: ['player'],
      relatedPlaceIds: []
    });

    const projection = projectConflictContext(state, { limit: 2 });

    expect(projection.combatEvents.map((event) => event.combatId)).toEqual(['current_place', 'player_related']);
  });
});
