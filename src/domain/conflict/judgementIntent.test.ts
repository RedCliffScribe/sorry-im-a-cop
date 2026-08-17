import { describe, expect, it } from 'vitest';
import { normalizeJudgementCheckIntent } from './judgementIntent';

const gameTime = {
  year: 1988,
  month: 9,
  day: 12,
  hour: 21,
  minute: 30
};

function normalize(category: string, combatType?: 'melee' | 'armed' | 'firearm') {
  return normalizeJudgementCheckIntent({
    value: {
      rulesetVersion: 'v1.1-local-d100',
      checkId: 'check_alias',
      title: '别名判定',
      category,
      primaryAttribute: 'thinking',
      difficultyTier: 'standard',
      shortSummary: '用于验证类别别名。',
      factors: []
    },
    turnId: 'turn_0001',
    gameTime,
    fallbackCheckId: 'check_turn_0001_1',
    combatEventPatches: combatType
      ? [
          {
            combatId: 'combat_alias',
            turnId: 'turn_0001',
            gameTime,
            title: '别名对抗',
            type: combatType,
            locationSummary: '测试地点',
            participants: [],
            outcome: 'other',
            intensity: 50,
            combatText: '测试对抗。',
            resultSummary: '测试结果。',
            consequenceSummary: '测试后果。',
            judgementCheckIds: [],
            relatedActorIds: [],
            relatedPlaceIds: [],
            relatedCaseIds: [],
            visibility: 'player_known',
            unread: true,
            createdAt: gameTime
          }
        ]
      : []
  });
}

describe('judgement intent normalization', () => {
  it.each([
    ['shooting', 'firearm'],
    ['gunfight', 'firearm'],
    ['persuasion', 'negotiation'],
    ['social', 'negotiation'],
    ['investigation', 'thinking'],
    ['reasoning', 'thinking'],
    ['notice', 'observation'],
    ['search', 'observation'],
    ['perception', 'observation'],
    ['stamina', 'endurance'],
    ['physical', 'endurance'],
    ['mental', 'will'],
    ['self_control', 'will'],
    ['搜查', 'observation'],
    ['枪战', 'firearm'],
    ['谈判', 'negotiation'],
    ['推理', 'thinking'],
    ['体魄', 'endurance'],
    ['意志', 'will']
  ])('maps category alias %s to %s', (alias, expected) => {
    expect(normalize(alias).intent?.category).toBe(expected);
  });

  it('uses structured combat context for ambiguous combat aliases', () => {
    expect(normalize('combat', 'armed').intent?.category).toBe('armed');
    expect(normalize('fight', 'melee').intent?.category).toBe('melee');
  });

  it('does not guess an ambiguous or unknown category without structured context', () => {
    expect(normalize('combat').missingFields).toContain('category');
    expect(normalize('unmapped_tactic').missingFields).toContain('category');
  });

  it.each(['80', null, 120])(
    'ignores a non-canonical effectiveTarget echo %j while keeping semantic intent',
    (effectiveTarget) => {
      const result = normalizeJudgementCheckIntent({
        value: {
          checkId: 'check_echo',
          title: '目标值恢复',
          category: 'thinking',
          primaryAttribute: 'thinking',
          difficultyTier: 'standard',
          effectiveTarget,
          shortSummary: '本地应重新计算。',
          factors: []
        },
        turnId: 'turn_0001',
        gameTime,
        fallbackCheckId: 'check_turn_0001_1',
        combatEventPatches: []
      });

      expect(result.intent).toBeDefined();
      expect(result.intent?.effectiveTarget).toBe(
        typeof effectiveTarget === 'number' ? effectiveTarget : undefined
      );
    }
  );
});
