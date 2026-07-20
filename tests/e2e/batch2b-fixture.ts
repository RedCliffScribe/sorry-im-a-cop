import { createBatch2aRuntimeState } from './batch2a-fixture';

export function createBatch2bRuntimeState() {
  const state = createBatch2aRuntimeState();
  state.judgementChecks.check_combat_visual = {
    checkId: 'check_combat_visual',
    turnId: 'turn_visual',
    gameTime: state.time,
    title: '后巷持械拘捕',
    category: 'combat',
    targetSummary: '目标：持刀男子',
    relatedActorIds: [],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: ['case_player'],
    difficulty: 62,
    score: 79,
    margin: 17,
    outcome: 'success',
    shortSummary: '玩家抓住空隙挑开刀锋，成功控制对方。',
    consequenceSummary: '对方被制服，现场转入拘捕和证物登记。',
    factors: [],
    relatedCombatEventId: 'combat_visual',
    visibility: 'player_known'
  };
  state.combatEvents.combat_visual = {
    combatId: 'combat_visual',
    turnId: 'turn_visual',
    gameTime: state.time,
    title: '花园街后巷持械拘捕',
    type: 'armed',
    locationSummary: '花园街后巷',
    participants: [
      { actorId: 'player', name: '周星星', side: 'player', roleSummary: '军装巡逻警员，持警棍上前' },
      { name: '持刀男子', side: 'opponent', roleSummary: '持折刀拒捕', conditionAfter: '被制服，手腕轻伤' }
    ],
    outcome: 'opponent_subdued',
    intensity: 74,
    animationKey: 'close_quarters',
    combatText: '雨水沿着铁皮檐落下，警棍与折刀在狭窄后巷撞出一声脆响。玩家压低重心逼近，顺势挑开刀锋，把对方按在墙面上。',
    resultSummary: '持刀男子被制服，玩家没有受伤。',
    consequenceSummary: '现场转入拘捕程序，折刀装袋登记。',
    judgementCheckIds: ['check_combat_visual'],
    relatedActorIds: ['player'],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: ['case_player'],
    visibility: 'player_known',
    unread: true,
    createdAt: state.time
  };
  return state;
}
