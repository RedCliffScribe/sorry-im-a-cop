import { describe, expect, it } from 'vitest';
import type {
  CharacterPromptBatchInput,
  CharacterPromptBatchOutput,
  SceneShotPlanDraft,
  SceneShotPromptInput,
  SceneShotPromptOutput,
  TurnScenePlanningInput
} from './schemas';
import {
  validateCharacterPromptBatchOutput,
  validateSceneShotPromptOutput,
  validateTurnScenePlanningOutput
} from './validation';

const VALID_ANCHOR = `【固定外观】
黑色短发，棕色眼睛。
【默认服装】
深色夹克。
【一致性要求】
保持五官和体态一致。
【避免偏移】
避免改变发色。`;

function planningInput(requestedMaxScenes = 2): TurnScenePlanningInput {
  return {
    sourceTurnId: 'turn_1',
    sourceStoryTextHash: 'story-hash',
    mode: 'automatic',
    requestedMaxScenes,
    storyText: '雨夜里，阿梅站在路灯下。',
    blocks: [{ blockIndex: 0, blockHash: 'block-hash', kind: 'plain', text: '雨夜里，阿梅站在路灯下。' }],
    frozenContext: {
      timeDescription: '1988 年午夜',
      locationDescription: '香港街角',
      presentActorIds: ['actor_mei']
    },
    actors: [{ actorId: 'actor_mei', anchorText: VALID_ANCHOR }]
  };
}

function shot(overrides: Partial<SceneShotPlanDraft> = {}): SceneShotPlanDraft {
  return {
    placement: { blockIndex: 0, blockHash: 'block-hash' },
    order: 0,
    sceneSummary: '阿梅站在雨里',
    knownActorIds: ['actor_mei'],
    actorVisualStates: [{ actorId: 'actor_mei', sceneSpecificAppearance: '白衬衣被雨淋湿' }],
    unboundCharacterDescriptions: [],
    locationDescription: '雨夜街头',
    actionDescription: '站在路灯下',
    atmosphere: '潮湿紧张',
    composition: '中景',
    ...overrides
  };
}

describe('prompt conversion domain validation', () => {
  it('accepts zero planned scenes', () => {
    expect(validateTurnScenePlanningOutput(planningInput(), { shots: [] })).toEqual([]);
  });

  it('rejects over-limit shots, broken order, invalid block bindings and unknown actor IDs', () => {
    const issues = validateTurnScenePlanningOutput(planningInput(1), {
      shots: [
        shot({
          placement: { blockIndex: 0, blockHash: 'wrong-hash' },
          order: 1,
          knownActorIds: ['actor_unknown'],
          actorVisualStates: []
        }),
        shot({ order: 1, actorVisualStates: [] })
      ]
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('超过本回合上限'),
      expect.stringContaining('从 0 连续排列'),
      expect.stringContaining('正文块索引或哈希不匹配'),
      expect.stringContaining('未允许的 actorId actor_unknown'),
      expect.stringContaining('order 1 重复')
    ]));
  });

  it('requires all four unique character purposes and resolved high-priority additions', () => {
    const input: CharacterPromptBatchInput = {
      actorId: 'actor_mei',
      anchorText: VALID_ANCHOR,
      additionalRequirementText: '保留红色发夹',
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    };
    const repeatedView = {
      purpose: 'avatar-close-up' as const,
      basePositive: '人物头像',
      baseNegative: '',
      appearanceSource: 'anchor-default' as const,
      resolvedAppearancePositive: '深色夹克',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    };
    const output: CharacterPromptBatchOutput = {
      actorId: 'wrong_actor',
      views: [repeatedView, repeatedView, repeatedView, repeatedView]
    };

    const issues = validateCharacterPromptBatchOutput(input, output);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining('actorId'),
      expect.stringContaining('half-body-medium'),
      expect.stringContaining('人物图片用途重复'),
      expect.stringContaining('未解析额外要求')
    ]));
  });

  it('accepts an outfit-only additional override and rejects invented additions without player input', () => {
    const purposes = [
      'avatar-close-up',
      'half-body-medium',
      'knee-up-medium-full',
      'full-body'
    ] as const;
    const input: CharacterPromptBatchInput = {
      actorId: 'actor_mei',
      anchorText: VALID_ANCHOR,
      additionalRequirementText: '本次穿湿透的白衬衣，不穿夹克',
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    };
    const output: CharacterPromptBatchOutput = {
      actorId: 'actor_mei',
      views: purposes.map((purpose) => ({
        purpose,
        basePositive: `固定身份与 ${purpose} 构图`,
        baseNegative: '避免身份漂移',
        appearanceSource: 'additional-requirement-override',
        resolvedAppearancePositive: '湿透的白衬衣，不穿夹克',
        resolvedAdditionalPositive: '',
        resolvedAdditionalNegative: ''
      }))
    };
    expect(validateCharacterPromptBatchOutput(input, output)).toEqual([]);

    const withoutAdditional = { ...input, additionalRequirementText: undefined };
    expect(validateCharacterPromptBatchOutput(withoutAdditional, output)).toEqual(expect.arrayContaining([
      expect.stringContaining('不得声明当前装扮覆盖')
    ]));
  });

  it('requires scene appearance, persistent additions and one-time additions to be resolved', () => {
    const input: SceneShotPromptInput = {
      shot: shot(),
      participants: [{
        actorId: 'actor_mei',
        anchorText: VALID_ANCHOR,
        persistentAdditionalRequirementText: '始终保留红色发夹',
        sceneSpecificAppearance: '白衬衣被雨淋湿'
      }],
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' },
      oneTimeInstruction: '镜头突出路灯逆光'
    };
    const output: SceneShotPromptOutput = {
      basePositive: '雨夜街头',
      baseNegative: '',
      participantResolutions: [{
        actorId: 'actor_mei',
        fixedIdentityPositive: '黑色短发，棕色眼睛',
        fixedIdentityNegative: '',
        appearanceSource: 'anchor-default',
        resolvedAppearancePositive: '',
        resolvedAdditionalPositive: '',
        resolvedAdditionalNegative: ''
      }],
      resolvedOneTimePositive: '',
      resolvedOneTimeNegative: ''
    };

    expect(validateSceneShotPromptOutput(input, output)).toEqual(expect.arrayContaining([
      expect.stringContaining('当前装扮'),
      expect.stringContaining('装扮来源应为 scene-specific-override'),
      expect.stringContaining('长期额外要求'),
      expect.stringContaining('本次额外要求')
    ]));
  });

  it('rejects medium and art-style exclusions from the scene fact layer', () => {
    const input: SceneShotPromptInput = {
      shot: shot(),
      participants: [{
        actorId: 'actor_mei',
        anchorText: VALID_ANCHOR,
        sceneSpecificAppearance: '白衬衣被雨淋湿'
      }],
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    };
    const output: SceneShotPromptOutput = {
      basePositive: '雨夜香港街头，阿梅站在路灯下',
      baseNegative: '错误年代汽车，三维渲染，插画，动漫',
      participantResolutions: [{
        actorId: 'actor_mei',
        fixedIdentityPositive: '黑色短发，棕色眼睛',
        fixedIdentityNegative: '避免改变发色',
        appearanceSource: 'scene-specific-override',
        resolvedAppearancePositive: '湿透的白衬衣',
        resolvedAdditionalPositive: '',
        resolvedAdditionalNegative: ''
      }],
      resolvedOneTimePositive: '',
      resolvedOneTimeNegative: ''
    };

    expect(validateSceneShotPromptOutput(input, output)).toEqual([
      expect.stringContaining('baseNegative 不得排除图片媒介或画风（三维渲染、插画、动漫）')
    ]);
  });
});
