import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS,
  buildCharacterPromptBatchPrompt,
  buildSceneShotPrompt,
  buildTurnScenePlanningPrompt
} from './prompts';

const VALID_ANCHOR = `【固定外观】
黑色短发，棕色眼睛。
【默认服装】
深色夹克。
【一致性要求】
保持五官和体态一致。
【避免偏移】
避免改变发色。`;

describe('prompt conversion prompts', () => {
  it('keeps scene facts separate from style media and preserves institutional roles during rendering', () => {
    expect(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS['scene-shot-prompt'])
      .toContain('图片媒介与画风由后续独立风格段负责');
    expect(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS['scene-shot-prompt'])
      .toContain('不要写空泛的画风黑名单');
    expect(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS['provider-prompt-render'])
      .toContain('“报案人”应译为 reporting person 或 complainant');
    expect(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS['provider-prompt-render'])
      .toContain('style 段的正向媒介与画风要求是本次渲染的权威约束');
  });

  it('gives the planner public identity hints and requires stable actor binding', () => {
    const prompt = buildTurnScenePlanningPrompt({
      sourceTurnId: 'turn_1',
      sourceStoryTextHash: 'a'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      storyText: '陈美玲走进报案室。',
      blocks: [{
        blockIndex: 0,
        blockHash: 'b'.repeat(64),
        kind: 'plain',
        text: '陈美玲走进报案室。'
      }],
      frozenContext: {
        timeDescription: '早上',
        locationDescription: '报案室',
        presentActorIds: ['actor_mei']
      },
      actors: [{
        actorId: 'actor_mei',
        publicName: '陈美玲',
        publicAliases: ['美玲'],
        anchorText: VALID_ANCHOR
      }]
    });

    expect(prompt).toContain('"publicName": "陈美玲"');
    expect(prompt).toContain('"publicAliases": [');
    expect(prompt).toContain('"美玲"');
    expect(prompt).toContain('必须绑定到该稳定 actorId');
    expect(prompt).toContain('只有确实无法识别或纯背景的人物');
  });

  it('projects structured anchor sections and an explicit scene appearance override contract', () => {
    const prompt = buildSceneShotPrompt({
      shot: {
        placement: { blockIndex: 0, blockHash: 'b'.repeat(64) },
        order: 0,
        sceneSummary: '陈美玲站在雨里',
        knownActorIds: ['actor_mei'],
        actorVisualStates: [{ actorId: 'actor_mei', sceneSpecificAppearance: '脱下夹克，只穿湿透的白衬衣' }],
        unboundCharacterDescriptions: [],
        locationDescription: '雨夜街头',
        actionDescription: '站在路灯下',
        atmosphere: '潮湿紧张',
        composition: '中景'
      },
      participants: [{
        actorId: 'actor_mei',
        anchorText: VALID_ANCHOR,
        sceneSpecificAppearance: '脱下夹克，只穿湿透的白衬衣'
      }],
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    });

    expect(prompt).toContain('"anchorSections": {');
    expect(prompt).toContain('"fixedAppearance": "黑色短发，棕色眼睛。"');
    expect(prompt).toContain('"defaultClothing": "深色夹克。"');
    expect(prompt).toContain('fixedIdentityPositive 只能转换 fixedAppearance');
    expect(prompt).toContain('不得再加入 defaultClothing');
    expect(prompt).toContain('"appearanceSource":"anchor-default 或 scene-specific-override"');
  });

  it('projects structured anchor sections and keeps character default clothing out of fixed identity', () => {
    const prompt = buildCharacterPromptBatchPrompt({
      actorId: 'actor_mei',
      anchorText: VALID_ANCHOR,
      additionalRequirementText: '本次穿湿透的白衬衣，不穿夹克',
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    });

    expect(prompt).toContain('"anchorSections": {');
    expect(prompt).toContain('"defaultClothing": "深色夹克。"');
    expect(prompt).toContain('basePositive 只转换 fixedAppearance');
    expect(prompt).toContain('appearanceSource 必须为 additional-requirement-override');
    expect(prompt).toContain('不得再加入 defaultClothing');
  });
});
