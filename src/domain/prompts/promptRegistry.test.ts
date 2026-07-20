import { describe, expect, it } from 'vitest';
import { createPromptTemplates, resolvePromptText, type PromptTemplateId } from './promptRegistry';

describe('promptRegistry', () => {
  it('registers every player-editable static runtime prompt', () => {
    const ids = createPromptTemplates().map((template) => template.id);
    const expectedIds: PromptTemplateId[] = [
      'opening.gamePositioning',
      'turn.coreRules',
      'narrative.styleAndDisplay',
      'relationship.adultStyleGuide',
      'npc.simulation',
      'news.generation',
      'memory.compression',
      'repair.actorPatch',
      'repair.caseIntake',
      'repair.identityMerge',
      'repair.assetLifecycle',
      'repair.incidentOrigin',
      'repair.location',
      'repair.playerClothing',
      'repair.playerVitals',
      'repair.relationshipThread',
      'repair.deferredEvent',
      'repair.turnSummary'
    ];

    expect(ids).toEqual(expect.arrayContaining(expectedIds));
    expect(new Set(ids).size).toBe(ids.length);
    expect(createPromptTemplates().every((template) => template.defaultText.trim().length > 0)).toBe(true);
  });

  it('resolves an override without storing runtime context in settings', () => {
    expect(
      resolvePromptText('news.generation', {
        overrides: { 'news.generation': 'CUSTOM_NEWS_STATIC_RULES' }
      })
    ).toBe('CUSTOM_NEWS_STATIC_RULES');
  });

  it('keeps the adult relationship guide gated, sequential, character-specific, and direct', () => {
    const guide = resolvePromptText('relationship.adultStyleGuide', undefined);

    expect(guide).toContain('参与者均已确认成年、自愿参与');
    expect(guide).toContain('普通或暧昧场景完全忽略本指南');
    expect(guide).toContain('当前动作 → 接触部位与身体位置 → 方向、力度和节奏');
    expect(guide).toContain('双方生理、语言和情绪反馈 → 下一动作或调整');
    expect(guide).toContain('从已有的 RECENT_STORY_PROJECTION 或当前场景中确认最后一个确切姿势');
    expect(guide).toContain('玩家输入与近期行动近似时');
    expect(guide).toContain('慢节奏不是同义反复');
    expect(guide).toContain('不代写玩家未输入的心理、台词、决定、承诺或新的主动动作');
    expect(guide).toContain('不允许所有角色套用相同呻吟、相同高潮和相同服从反应');
    expect(guide).toContain('不得只换姓名套用同一段结构');
    expect(guide).toContain('强度来自方向、幅度、速度、停顿、身体反馈和现实后果');
    expect(guide).toContain('动作路径、主导感官、人物表达或现实后果至少两项');
    expect(guide).toContain('警署、街面、酒店、住宅等地点的隐私、撞破、证据、舆论和现实风险');
    expect(guide).toContain('禁止模板化高潮和强行收束');
    expect(guide).toContain('输出前静默逐句复核成人段落');
  });
});
