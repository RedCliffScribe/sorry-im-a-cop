import { describe, expect, it } from 'vitest';
import {
  createOriginalNarrativeStyleAndDisplayGuide,
  createPromptTemplates,
  resolvePromptText,
  type PromptTemplateId
} from './promptRegistry';

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
      'repair.actorProfileEnrichment',
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
    expect(guide).toContain('先确认当前阶段：试探/前戏、进行中、接近高潮、高潮或事后照料');
    expect(guide).toContain('不得一次跨越多个阶段');
    expect(guide).toContain('最后一个确切姿势、衣着状态、接触位置、动作阶段');
    expect(guide).toContain('每一拍只推进一至两件真正发生变化的事');
    expect(guide).toContain('不来自同义反复、全身扫描或器官清单');
    expect(guide).toContain('不代写玩家输入之外的心理、决定、承诺、感官体验、愉悦程度、身体反应');
    expect(guide).toContain('玩家明确输入的说话内容是否可以润色为主角对白');
    expect(guide).toContain('不要用“玩家手掌下传来、耳边听见、闻到、感觉到”等句式');
    expect(guide).toContain('高潮、射精、同意、撤回');
    expect(guide).toContain('只换姓名套用同一段结构');
    expect(guide).toContain('强度来自方向、幅度、速度、停顿、身体反馈和现实后果');
    expect(guide).toContain('警署、街面、酒店、住宅等地点的隐私、撞破、证据、舆论和现实风险');
    expect(guide).toContain('禁止模板化高潮和强行收束');
    expect(guide).toContain('不得自动把亲密行为升级为好感、服从、恋爱');
    expect(guide).toContain('输出前静默复核：阶段没有跳跃');
  });

  it('uses effective story beats instead of a fixed prose template', () => {
    const guide = resolvePromptText('narrative.styleAndDisplay', undefined, 'long');

    expect(guide).toContain('每句话应至少承担动作、有效信息、人物回应、关系变化、风险、限制或后果中的一项');
    expect(guide).toContain('常规回合 narrativeText 目标 900-1400 个中文字符且不得少于 900 个中文字符');
    expect(guide).toContain('围绕同一现场纵向展开有效内容');
    expect(guide).toContain('只选择一至两个与当前行动真正相关的现场细节');
    expect(guide).toContain('不要轮流罗列多种感官');
    expect(guide).toContain('不要为了凑篇幅新造路人、同事、电话、传呼、案件、物品或远场钩子');
    expect(guide).toContain('不规定“场景铺垫、行动承接、人物反馈、局面变化”的固定顺序');
    expect(guide).toContain('允许合作、议价、拖延、回避、拒绝、误解、隐瞒、转交、离场或没有反应');
    expect(guide).toContain('RECENT_STORY_PROJECTION 只用于保持事实、空间、未完成动作和确切对白的连续性');
    expect(guide).toContain('是否允许模型补全玩家对白，由不可编辑的“正文演绎风格”硬规则决定');
    expect(guide).not.toContain('不要代写玩家没有输入的对白');
    expect(guide).not.toContain('每个常规回合至少');
    expect(guide).not.toContain('显示块顺序建议');
    expect(guide).not.toContain('必须同时有现场锚点');
  });

  it('keeps the original 1.0 scene structure while retaining the current length contract', () => {
    const guide = createOriginalNarrativeStyleAndDisplayGuide('long');

    expect(guide).toContain('正文风格与显示格式（1.0 原始版）');
    expect(guide).toContain('先立住场面');
    expect(guide).toContain('再承接玩家行动');
    expect(guide).toContain('开场场面 -> 行动承接 -> NPC/环境反馈 -> 局面变化或可互动点');
    expect(guide).toContain('常规回合 narrativeText 目标 900-1400 个中文字符且不得少于 900 个中文字符');
    expect(guide).toContain('酒馆预设可以继续调整措辞、节奏、修辞和对白口味');
    expect(guide).toContain('不得覆盖正文篇幅、玩家决定权、事实可见性与结构化写回规则');
  });

  it('lets NPCs stay uninvolved or uninformed when the facts do not reach them', () => {
    const guide = resolvePromptText('npc.simulation', undefined);

    expect(guide).toContain('无关人物不必回应');
    expect(guide).toContain('远场人物可以继续留在远场');
    expect(guide).toContain('不得为了让人物露面而强造电话、传呼、新闻、巧遇或同步知情');
    expect(guide).toContain('合作、议价、拖延、回避、拒绝、误解、隐瞒、转交、离开或没有反应');
    expect(guide).toContain('不得共享全知视角');
  });
});
