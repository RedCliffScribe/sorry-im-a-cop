import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../domain/runtime/initialState';
import type { CombatEvent, RuntimeState } from '../domain/runtime/types';
import { resolveCombatVisualAssets } from './combatVisualAssets';

function makeCombat(overrides: Partial<CombatEvent> = {}): CombatEvent {
  const state = createInitialRuntimeState();
  return {
    combatId: 'combat_test',
    turnId: 'turn_test',
    gameTime: state.time,
    title: '后巷短兵相接',
    type: 'armed',
    locationSummary: '旺角一条潮湿后巷',
    participants: [
      { actorId: 'player', name: '玩家', side: 'player', roleSummary: '持警棍逼近' },
      { name: '持刀男子', side: 'opponent', roleSummary: '手持折刀，试图脱身' }
    ],
    outcome: 'opponent_subdued',
    intensity: 76,
    animationKey: 'close_quarters',
    combatText: '警棍撞上折刀，对方被按在湿滑墙面上，手里的刀脱落。',
    resultSummary: '对方被制服，玩家未受明显伤。',
    consequenceSummary: '附近街坊开始围观。',
    judgementCheckIds: [],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    visibility: 'player_known',
    unread: true,
    createdAt: state.time,
    ...overrides
  };
}

function makeState(overrides: Partial<RuntimeState> = {}): RuntimeState {
  const state = createInitialRuntimeState();
  return {
    ...state,
    ...overrides
  };
}

describe('combatVisualAssets', () => {
  it('matches a back-alley baton arrest to local background, player, enemy, and success stamp', () => {
    const visual = resolveCombatVisualAssets(makeCombat(), makeState());

    expect(visual.background.id).toBe('back_alley');
    expect(visual.player.id).toBe('uniform_constable_baton');
    expect(visual.enemy.id).toBe('street_triad_knife');
    expect(visual.resultLabel).toBe('成功');
    expect(visual.resultTone).toBe('success');
    expect(visual.effectClassNames).toContain('combat-effect-impact');
  });

  it('uses plainclothes gun and female nightlife assets when the combat clue says so', () => {
    const state = makeState();
    state.player.clothing = '便装夹克，暗袋里有左轮手枪';
    state.player.clothingState = {
      currentSummary: '便装夹克，暗袋里有左轮手枪',
      mode: 'off_duty_plain'
    };

    const visual = resolveCombatVisualAssets(
      makeCombat({
        title: '夜总会后门女枪手对峙',
        type: 'firearm',
        locationSummary: '尖沙咀夜总会后门',
        participants: [
          { actorId: 'player', name: '玩家', side: 'player', roleSummary: '便装持枪' },
          { name: '女枪手', side: 'opponent', roleSummary: '藏着手枪的夜场女人' }
        ],
        combatText: '雨夜里，女枪手从后门退出来，玩家拔出左轮喝止。',
        outcome: 'player_advantage'
      }),
      state
    );

    expect(visual.background.id).toBe('nightclub_service_corridor');
    expect(visual.player.id).toMatch(/^plainclothes_[ab]_gun$/);
    expect(visual.enemy.id).toBe('female_gunman_informant');
    expect(visual.weatherClassNames).toEqual(expect.arrayContaining(['combat-weather-night', 'combat-weather-rain']));
    expect(visual.effectClassNames).toContain('combat-effect-gunfire');
  });

  it('marks player-wounded outcomes with a Traditional Chinese failure label', () => {
    const visual = resolveCombatVisualAssets(
      makeCombat({
        outcome: 'player_wounded',
        resultSummary: '玩家被划伤。',
        combatText: '对方的刀尖划过手臂，玩家后退半步。'
      }),
      makeState()
    );

    expect(visual.resultLabel).toBe('失敗');
    expect(visual.resultTone).toBe('failure');
  });

  it('renders an opponent advantage as a failure-side combat result', () => {
    const visual = resolveCombatVisualAssets(
      makeCombat({
        outcome: 'opponent_advantage',
        resultSummary: '对手抢到主动。',
        combatText: '对手逼近一步，玩家被迫后退调整站位。'
      }),
      makeState()
    );

    expect(visual.resultLabel).toBe('失敗');
    expect(visual.resultTone).toBe('failure');
  });

  it.each([
    'Chief Inspector（总督察 CIP）',
    'Superintendent（警司 SP）',
    'Senior Superintendent（高级警司 SSP）',
    'Chief Superintendent（总警司 CSP）',
    'Assistant Commissioner of Police（助理处长 ACP）',
    'Senior Assistant Commissioner of Police（高级助理处长 SACP）',
    'Deputy Commissioner of Police（副处长 DCP）',
    'Commissioner of Police（警务处长 CP）'
  ])('keeps %s on the command-uniform combat layer', (rank) => {
    const state = makeState();
    state.lawIdentity.rank = rank;
    state.policePanel.careerPath.currentRank = rank;

    const visual = resolveCombatVisualAssets(makeCombat(), state);

    expect(visual.player.id).toBe('command_uniform_baton');
  });
});
