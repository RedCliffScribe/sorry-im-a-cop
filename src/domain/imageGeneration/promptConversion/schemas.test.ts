import { describe, expect, it } from 'vitest';
import {
  characterAnchorConversionOutputSchema,
  characterViewPromptSchema,
  parseCharacterAnchorSections,
  sceneParticipantResolutionSchema,
  sceneShotPromptInputSchema,
  turnScenePlanningInputSchema,
  validateCharacterAnchorText
} from './schemas';

const VALID_ANCHOR = `【固定外观】
黑色短发，棕色眼睛。
【默认服装】
深色夹克。
【一致性要求】
保持五官和体态一致。
【避免偏移】
避免改变发色。`;

describe('prompt conversion schemas', () => {
  it('accepts exactly one ordered, non-empty set of character anchor sections', () => {
    expect(validateCharacterAnchorText(VALID_ANCHOR)).toEqual([]);
    expect(characterAnchorConversionOutputSchema.parse({ actorId: 'actor_1', anchorText: VALID_ANCHOR })).toEqual({
      actorId: 'actor_1',
      anchorText: VALID_ANCHOR
    });
    expect(parseCharacterAnchorSections(VALID_ANCHOR)).toEqual({
      fixedAppearance: '黑色短发，棕色眼睛。',
      defaultClothing: '深色夹克。',
      consistencyRequirements: '保持五官和体态一致。',
      driftAvoidance: '避免改变发色。'
    });
  });

  it('normalizes the previous scene appearance output without breaking player custom instructions', () => {
    expect(sceneParticipantResolutionSchema.parse({
      actorId: 'actor_1',
      fixedIdentityPositive: '黑色短发，棕色眼睛',
      sceneSpecificAppearancePositive: '湿透的白衬衣',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    })).toEqual({
      actorId: 'actor_1',
      fixedIdentityPositive: '黑色短发，棕色眼睛',
      fixedIdentityNegative: '',
      resolvedAppearancePositive: '湿透的白衬衣',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    });
  });

  it('accepts the new character appearance source while keeping old player conversion output readable', () => {
    expect(characterViewPromptSchema.parse({
      purpose: 'half-body-medium',
      basePositive: '固定身份与半身构图',
      baseNegative: '避免身份漂移',
      appearanceSource: 'additional-requirement-override',
      resolvedAppearancePositive: '湿透的白衬衣，不穿夹克',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    })).toMatchObject({
      appearanceSource: 'additional-requirement-override',
      resolvedAppearancePositive: '湿透的白衬衣，不穿夹克'
    });

    expect(characterViewPromptSchema.parse({
      purpose: 'half-body-medium',
      basePositive: '旧指令把身份、默认服装与半身构图放在一起',
      baseNegative: '',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    })).toEqual({
      purpose: 'half-body-medium',
      basePositive: '旧指令把身份、默认服装与半身构图放在一起',
      baseNegative: '',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    });
  });

  it.each([
    ['missing', VALID_ANCHOR.replace('【默认服装】\n深色夹克。\n', '')],
    ['duplicate', `${VALID_ANCHOR}\n【固定外观】\n重复内容。`],
    ['empty', VALID_ANCHOR.replace('【默认服装】\n深色夹克。', '【默认服装】')],
    ['extra heading', `${VALID_ANCHOR}\n【额外版本】\n不允许。`]
  ])('rejects %s anchor sections', (_label, anchorText) => {
    expect(characterAnchorConversionOutputSchema.safeParse({ actorId: 'actor_1', anchorText }).success).toBe(false);
  });

  it('rejects duplicate frozen actor IDs before any model call', () => {
    const input = {
      sourceTurnId: 'turn_1',
      sourceStoryTextHash: 'a'.repeat(64),
      mode: 'automatic',
      requestedMaxScenes: 2,
      storyText: '正文',
      blocks: [{ blockIndex: 0, blockHash: 'b'.repeat(64), kind: 'plain', text: '正文' }],
      frozenContext: {
        timeDescription: '午夜',
        locationDescription: '街角',
        presentActorIds: ['actor_1', 'actor_1']
      },
      actors: []
    };
    expect(turnScenePlanningInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts public identity hints for stable scene actor binding without widening the strict schema', () => {
    const base = {
      sourceTurnId: 'turn_1',
      sourceStoryTextHash: 'a'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      storyText: '陈美玲走进报案室。',
      blocks: [{ blockIndex: 0, blockHash: 'b'.repeat(64), kind: 'plain', text: '陈美玲走进报案室。' }],
      frozenContext: {
        timeDescription: '早上',
        locationDescription: '报案室',
        presentActorIds: ['actor_mei']
      },
      actors: [{
        actorId: 'actor_mei',
        publicName: '陈美玲',
        publicAliases: ['美玲', '阿玲'],
        anchorText: VALID_ANCHOR
      }]
    };
    expect(turnScenePlanningInputSchema.parse(base).actors[0]).toMatchObject({
      actorId: 'actor_mei',
      publicName: '陈美玲',
      publicAliases: ['美玲', '阿玲']
    });
    expect(turnScenePlanningInputSchema.safeParse({
      ...base,
      actors: [{ ...base.actors[0], actualIdentitySummary: '秘密线人' }]
    }).success).toBe(false);
  });

  it('allows an anchored candidate that became known after the frozen presence snapshot', () => {
    const result = turnScenePlanningInputSchema.safeParse({
      sourceTurnId: 'turn_1',
      sourceStoryTextHash: 'a'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      storyText: '一个年轻女子走进报案室。',
      blocks: [{ blockIndex: 0, blockHash: 'b'.repeat(64), kind: 'plain', text: '一个年轻女子走进报案室。' }],
      frozenContext: {
        timeDescription: '早上',
        locationDescription: '报案室',
        presentActorIds: ['player']
      },
      actors: [{
        actorId: 'actor_mei',
        publicName: '陈美玲',
        anchorText: VALID_ANCHOR
      }],
      manualInstruction: '保持陈美玲当前服装。'
    });

    expect(result.success).toBe(true);
  });

  it('requires scene prompt participants to exactly match the shot and its temporary appearance', () => {
    const input = {
      shot: {
        placement: { blockIndex: 0, blockHash: 'b'.repeat(64) },
        order: 0,
        sceneSummary: '角色站在雨里',
        knownActorIds: ['actor_1'],
        actorVisualStates: [{ actorId: 'actor_1', sceneSpecificAppearance: '湿透的白衬衣' }],
        unboundCharacterDescriptions: [],
        locationDescription: '雨夜街头',
        actionDescription: '站在路灯下',
        atmosphere: '潮湿',
        composition: '中景'
      },
      participants: [],
      world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
    };
    expect(sceneShotPromptInputSchema.safeParse(input).success).toBe(false);
  });
});
