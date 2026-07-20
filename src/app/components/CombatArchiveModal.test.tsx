import { fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error The app tsconfig intentionally omits Node ambient types; this test only reads CSS text.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { CombatEvent, JudgementCheck, RuntimeState } from '../../domain/runtime/types';
import { CombatArchiveModal } from './CombatArchiveModal';

function withCombatFixtures(): RuntimeState {
  const state = createInitialRuntimeState();
  const check: JudgementCheck = {
    checkId: 'check_chase_1',
    turnId: 'turn_1',
    gameTime: state.time,
    title: '追截后巷持刀男子',
    category: 'chase',
    targetSummary: '目标：持刀男子',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    difficulty: 62,
    score: 71,
    margin: 9,
    outcome: 'success',
    shortSummary: '玩家追上对方，但逼近时消耗明显。',
    consequenceSummary: '对方被迫转身，局面进入近身对峙。',
    factors: [],
    relatedCombatEventId: 'combat_1',
    visibility: 'player_known'
  };
  const combat: CombatEvent = {
    combatId: 'combat_1',
    turnId: 'turn_1',
    gameTime: state.time,
    title: '后巷短兵相接',
    type: 'armed',
    locationSummary: '旺角一条潮湿后巷',
    participants: [
      { actorId: 'player', name: '玩家', side: 'player', roleSummary: '持警棍逼近' },
      { name: '持刀男子', side: 'opponent', roleSummary: '手持折刀，试图脱身', conditionAfter: '被制服但手腕擦伤' }
    ],
    outcome: 'opponent_subdued',
    intensity: 76,
    animationKey: 'close_quarters',
    combatText:
      '雨水从铁皮檐边落下，警棍撞上折刀时发出一声脆响。对方借着垃圾桶遮挡往侧门退，你压低重心逼近，左手护住胸口，右手顺势挑开刀锋。围观者在巷口倒吸一口气，直到他被按在湿滑墙面上，手里的刀才终于脱落。',
    resultSummary: '对方被制服，玩家未受明显伤。',
    consequenceSummary: '附近街坊开始围观，后续需要处理现场秩序。',
    judgementCheckIds: ['check_chase_1'],
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    visibility: 'player_known',
    unread: true,
    createdAt: state.time
  };
  state.judgementChecks[check.checkId] = check;
  state.combatEvents[combat.combatId] = combat;
  state.combatEvents.combat_hidden = {
    ...combat,
    combatId: 'combat_hidden',
    title: '隐藏冲突',
    visibility: 'hidden'
  };
  return state;
}

describe('CombatArchiveModal', () => {
  it('keeps the combat visual placeholder in a 16:9 art-ready ratio', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const landscapeRule = css.match(/\.combat-animation-stage-landscape\s*\{[^}]+\}/)?.[0] ?? '';

    expect(landscapeRule).toContain('aspect-ratio: 16 / 9');
  });

  it('renders visible combat records and hides hidden combat events', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗记录' });
    expect(dialog).not.toHaveTextContent('重大冲突记录');
    expect(dialog).not.toHaveTextContent(/Combat Archive|Combat Detail/);
    expect(dialog).toHaveTextContent('后巷短兵相接');
    expect(dialog).toHaveTextContent('对方被制服，玩家未受明显伤。');
    expect(dialog).not.toHaveTextContent('隐藏冲突');
  });

  it('opens the selected combat detail with cinematic text and linked judgement', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '查看后巷短兵相接详情' }));

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    expect(dialog).not.toHaveTextContent('过程记录');
    expect(dialog).not.toHaveTextContent(/Combat Archive|Combat Detail/);
    expect(dialog).not.toHaveTextContent('close_quarters');
    expect(dialog).toHaveTextContent('雨水从铁皮檐边落下');
    expect(dialog).toHaveTextContent('持刀男子');
    expect(dialog).toHaveTextContent('追截后巷持刀男子');
    expect(dialog).toHaveTextContent('差额 +9');
  });

  it('opens an initial combat detail when supplied', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    expect(dialog).toHaveTextContent('后巷短兵相接');
    expect(dialog).toHaveTextContent('雨水从铁皮檐边落下');
  });

  it('renders combat detail with a top visual stage and a scrollable record area', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    expect(dialog.querySelector('.combat-animation-stage')).not.toBeNull();
    expect(dialog.querySelector('.combat-detail-scroll')).not.toBeNull();
    expect(dialog.querySelector('.combat-detail-grid')).toBeNull();
  });

  it('uses a landscape visual stage and keeps participants result and judgement in one summary row', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    expect(dialog.querySelector('.combat-animation-stage.combat-animation-stage-landscape')).not.toBeNull();
    const summaryRow = dialog.querySelector('.combat-detail-summary-row');
    expect(summaryRow).not.toBeNull();
    expect(summaryRow?.children).toHaveLength(3);
    expect(summaryRow?.firstElementChild).toHaveClass('combat-detail-result');
  });

  it('renders combat art layers and a Traditional Chinese success stamp in combat detail', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    const stage = dialog.querySelector('.combat-visual-stage');
    const background = stage?.querySelector('.combat-visual-background');
    const player = stage?.querySelector('.combat-visual-player');
    const enemy = stage?.querySelector('.combat-visual-enemy');

    expect(stage).not.toBeNull();
    expect(background).not.toBeNull();
    expect(background).toHaveAttribute('width', '1672');
    expect(background).toHaveAttribute('height', '941');
    expect(background).toHaveAttribute('decoding', 'async');
    expect(background).toHaveAttribute('fetchpriority', 'high');
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute('width', '1086');
    expect(player).toHaveAttribute('height', '1448');
    expect(player).toHaveAttribute('decoding', 'async');
    expect(enemy).not.toBeNull();
    expect(enemy).toHaveAttribute('width', '1086');
    expect(enemy).toHaveAttribute('height', '1448');
    expect(enemy).toHaveAttribute('decoding', 'async');
    expect(stage).toHaveClass('combat-result-success');
    expect(stage).toHaveTextContent('成功');
  });

  it('renders a Traditional Chinese failure stamp for player wounded combat detail', () => {
    const state = withCombatFixtures();
    state.combatEvents.combat_1 = {
      ...state.combatEvents.combat_1,
      outcome: 'player_wounded',
      resultSummary: '玩家被刀锋划伤。',
      combatText: '对方的刀锋划过手臂，玩家被迫退后。'
    };

    render(<CombatArchiveModal state={state} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    const stage = dialog.querySelector('.combat-visual-stage');

    expect(stage).toHaveClass('combat-result-failure');
    expect(stage).toHaveTextContent('失敗');
  });

  it('uses a standard detail modal and keeps the landscape visual stage readable', () => {
    render(<CombatArchiveModal state={withCombatFixtures()} initialCombatId="combat_1" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '战斗详情' });
    expect(dialog).toHaveClass('combat-detail-modal-compact');
    expect(dialog.querySelector('.combat-animation-stage-compact')).not.toBeNull();

    const css = readFileSync('src/styles/global.css', 'utf8');
    const detailRule = css.match(/\.combat-detail-modal-compact\s*\{[^}]+\}/)?.[0] ?? '';
    const compactStageRule = css.match(/\.combat-animation-stage-compact\s*\{[^}]+\}/)?.[0] ?? '';

    expect(detailRule).toContain('width: min(1080px, calc(100vw - 56px))');
    expect(compactStageRule).not.toContain('520px');
    expect(compactStageRule).toContain('width: min(calc(100% - 72px), 960px)');
  });

  it('renders empty state when there are no visible combat records', () => {
    const state = createInitialRuntimeState();
    render(<CombatArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('暂无战斗记录')).toBeInTheDocument();
  });
});
