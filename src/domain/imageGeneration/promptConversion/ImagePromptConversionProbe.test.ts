import { describe, expect, it, vi } from 'vitest';
import type { NarratorClient, NarratorImageInput } from '../../narrator/NarratorClient';
import { ImagePromptConversionProbe } from './ImagePromptConversionProbe';
import { BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS } from './promptPresetLibrary';
import { createProviderPromptRenderInput } from './providerPromptRenderer';
import { DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS } from './prompts';
import type { CharacterAnchorConversionInput, SceneShotPromptInput, TurnScenePlanningInput } from './schemas';
import { CHARACTER_VISUAL_PURPOSES, PromptConversionContractError } from './types';
import { createStoryVisualBlocks, hashStoryText } from './visualProjection';

const VALID_ANCHOR = `【固定外观】
黑色短发，棕色眼睛。
【默认服装】
深色夹克。
【一致性要求】
保持五官和体态一致。
【避免偏移】
避免改变发色。`;

const anchorInput: CharacterAnchorConversionInput = {
  actor: {
    actorId: 'actor_mei',
    publicName: '阿梅',
    gender: 'female',
    publicIdentity: '酒吧侍应',
    visualAgeAnchor: '约二十五岁',
    appearance: '齐肩黑发，圆脸',
    clothing: '白衬衣和黑色长裤',
    equipment: []
  },
  world: { year: 1988, region: '香港', visualStyle: '写实电影感' }
};

function clientWithOutputs(...outputs: unknown[]): { client: NarratorClient; complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn().mockImplementation(async () => outputs.shift());
  return { client: { complete }, complete };
}

async function planningInput(): Promise<TurnScenePlanningInput> {
  const storyText = '雨夜里，阿梅站在路灯下。';
  return {
    sourceTurnId: 'turn_1',
    sourceStoryTextHash: await hashStoryText(storyText),
    mode: 'automatic',
    requestedMaxScenes: 2,
    storyText,
    blocks: await createStoryVisualBlocks('turn_1', storyText),
    frozenContext: {
      timeDescription: '1988 年午夜',
      locationDescription: '香港街角',
      presentActorIds: ['actor_mei']
    },
    actors: [{ actorId: 'actor_mei', anchorText: VALID_ANCHOR }]
  };
}

describe('ImagePromptConversionProbe', () => {
  it('keeps image-to-anchor extraction locked unless image input is explicitly declared', () => {
    const client = { complete: vi.fn(), completeWithImages: vi.fn() } as never;
    const textOnly = new ImagePromptConversionProbe(client);
    expect(textOnly.supportsImageInput).toBe(false);
    expect(() => textOnly.assertImageAnchorExtractionAvailable()).toThrow(/未明确声明图片输入能力/);

    const multimodal = new ImagePromptConversionProbe(client, { inputModalities: ['text', 'image'] });
    expect(multimodal.supportsImageInput).toBe(true);
    expect(() => multimodal.assertImageAnchorExtractionAvailable()).not.toThrow();
  });

  it('sends only declared image inputs and previews a validated extracted anchor', async () => {
    const completeWithImages = vi.fn(async (
      _prompt: string,
      _images: readonly NarratorImageInput[]
    ) => ({ actorId: 'actor_mei', anchorText: VALID_ANCHOR }));
    const probe = new ImagePromptConversionProbe({ complete: vi.fn(), completeWithImages }, {
      inputModalities: ['text', 'image']
    });
    const image = { mimeType: 'image/png' as const, dataUrl: 'data:image/png;base64,AA==' };

    await expect(probe.generateCharacterAnchorFromImages({
      actor: anchorInput.actor,
      world: anchorInput.world,
      sourceImages: [{
        imageId: 'image_1',
        mimeType: 'image/png',
        width: 512,
        height: 768,
        contentHash: 'a'.repeat(64)
      }],
      additionalInstruction: '保留红色发夹'
    }, [image])).resolves.toEqual({ actorId: 'actor_mei', anchorText: VALID_ANCHOR });
    expect(completeWithImages).toHaveBeenCalledTimes(1);
    expect(completeWithImages.mock.calls[0][0]).toContain('只分析随请求附带、并由玩家明确选择的图片');
    expect(completeWithImages.mock.calls[0][0]).toContain('最高优先要求');
    expect(completeWithImages.mock.calls[0][1]).toEqual([image]);
  });

  it('rejects image extraction when the actual image MIME does not match the metadata', async () => {
    const completeWithImages = vi.fn();
    const probe = new ImagePromptConversionProbe({ complete: vi.fn(), completeWithImages }, {
      inputModalities: ['text', 'image']
    });
    const error = await probe.generateCharacterAnchorFromImages({
      actor: anchorInput.actor,
      world: anchorInput.world,
      sourceImages: [{ imageId: 'image_1', mimeType: 'image/jpeg', width: 1, height: 1, contentHash: 'a'.repeat(64) }]
    }, [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }]).catch((caught) => caught);

    expect(error).toMatchObject({ code: 'invalid-input', taskKind: 'character-anchor-from-images' });
    expect(completeWithImages).not.toHaveBeenCalled();
  });
  it('repairs one invalid character anchor response and then succeeds', async () => {
    const valid = { actorId: 'actor_mei', anchorText: VALID_ANCHOR };
    const { client, complete } = clientWithOutputs({ actorId: 'wrong', anchorText: VALID_ANCHOR }, valid);
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.generateCharacterAnchor(anchorInput)).resolves.toEqual(valid);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0]).toContain('只修复上一次 character-anchor');
    expect(complete.mock.calls[1][0]).toContain('actorId 与输入角色不一致');
  });

  it('loads the latest task instruction before each conversion call', async () => {
    const valid = { actorId: 'actor_mei', anchorText: VALID_ANCHOR };
    const { client, complete } = clientWithOutputs(valid, valid);
    const instructions = structuredClone(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS);
    const loadConversionInstructions = vi.fn(async () => structuredClone(instructions));
    const probe = new ImagePromptConversionProbe(client, { loadConversionInstructions });

    instructions['character-anchor'] = '第一次玩家自定义人物锚点指令';
    await probe.generateCharacterAnchor(anchorInput);
    instructions['character-anchor'] = '第二次玩家自定义人物锚点指令';
    await probe.generateCharacterAnchor(anchorInput);

    expect(complete.mock.calls[0][0]).toContain('第一次玩家自定义人物锚点指令');
    expect(complete.mock.calls[1][0]).toContain('第二次玩家自定义人物锚点指令');
    expect(loadConversionInstructions).toHaveBeenCalledTimes(2);
  });

  it('blocks the conversion API when managed instructions cannot be loaded', async () => {
    const complete = vi.fn();
    const probe = new ImagePromptConversionProbe({ complete }, {
      loadConversionInstructions: vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'))
    });

    await expect(probe.generateCharacterAnchor(anchorInput)).rejects.toMatchObject({
      code: 'instruction-load-failed',
      taskKind: 'character-anchor',
      attempts: 0
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it('fails explicitly after exactly one unsuccessful structural repair', async () => {
    const invalid = { actorId: 'wrong', anchorText: '缺少固定结构' };
    const { client, complete } = clientWithOutputs(invalid, invalid, { actorId: 'actor_mei', anchorText: VALID_ANCHOR });
    const probe = new ImagePromptConversionProbe(client);

    const error = await probe.generateCharacterAnchor(anchorInput).catch((caught) => caught);
    expect(error).toBeInstanceOf(PromptConversionContractError);
    expect(error).toMatchObject({ code: 'invalid-output', taskKind: 'character-anchor', attempts: 2 });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('rejects extra credential-like input locally without calling the model', async () => {
    const { client, complete } = clientWithOutputs({ actorId: 'actor_mei', anchorText: VALID_ANCHOR });
    const probe = new ImagePromptConversionProbe(client);

    const error = await probe.generateCharacterAnchor({ ...anchorInput, apiKey: 'SECRET_API_KEY' }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'invalid-input', attempts: 0 });
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not start a repair call after cancellation', async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      controller.abort(new DOMException('cancelled', 'AbortError'));
      return { actorId: 'wrong', anchorText: VALID_ANCHOR };
    });
    const probe = new ImagePromptConversionProbe({ complete });

    await expect(probe.generateCharacterAnchor(anchorInput, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('returns all four unique character purposes and keeps additions in resolved fields', async () => {
    const output = {
      actorId: 'actor_mei',
      views: CHARACTER_VISUAL_PURPOSES.map((purpose) => ({
        purpose,
        basePositive: `${purpose} base`,
        baseNegative: '',
        resolvedAdditionalPositive: '红色发夹',
        resolvedAdditionalNegative: ''
      }))
    };
    const { client, complete } = clientWithOutputs(output);
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.generateCharacterViewPrompts({
      actorId: 'actor_mei',
      anchorText: VALID_ANCHOR,
      additionalRequirementText: '保留红色发夹',
      world: anchorInput.world
    })).resolves.toEqual(output);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0]).toContain('knee-up-medium-full');
    expect(complete.mock.calls[0][0]).not.toMatch(/OpenAI|Gemini|NovelAI|ComfyUI|apiKey/);
  });

  it('accepts an automatic scene-planning result with zero shots', async () => {
    const { client, complete } = clientWithOutputs({ shots: [] });
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.planTurnScenes(await planningInput())).resolves.toEqual({ shots: [] });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('locally normalizes deterministic scene-plan envelope mistakes before requesting model repair', async () => {
    const input = {
      ...(await planningInput()),
      mode: 'manual' as const,
      requestedMaxScenes: 1,
      actors: [{
        ...(await planningInput()).actors[0]!,
        publicName: '阿梅',
        publicAliases: ['梅姐']
      }]
    };
    const { client, complete } = clientWithOutputs({
      scenes: [{
        placement: { blockIndex: '0' },
        order: '8',
        summary: '阿梅站在雨夜路灯下',
        characters: '梅姐',
        actorStates: {
          actor_mei: '湿透的深色夹克'
        },
        unboundCharacters: null,
        location: '香港街角',
        action: '抬头观察路灯下的动静',
        mood: '潮湿、紧张',
        camera: '16:9 中景',
        explanation: '这个多余字段不应进入正式场景计划'
      }, {
        summary: '超过玩家上限的第二个镜头'
      }]
    });
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.planTurnScenes(input)).resolves.toEqual({
      shots: [{
        placement: {
          blockIndex: 0,
          blockHash: input.blocks[0]!.blockHash
        },
        order: 0,
        sceneSummary: '阿梅站在雨夜路灯下',
        knownActorIds: ['actor_mei'],
        actorVisualStates: [{
          actorId: 'actor_mei',
          sceneSpecificAppearance: '湿透的深色夹克'
        }],
        unboundCharacterDescriptions: [],
        locationDescription: '香港街角',
        actionDescription: '抬头观察路灯下的动静',
        atmosphere: '潮湿、紧张',
        composition: '16:9 中景'
      }]
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('keeps ambiguous scene placement conflicts behind the strict one-shot repair contract', async () => {
    const storyText = '第一段。\n第二段。';
    const blocks = await createStoryVisualBlocks('turn_conflict', storyText);
    const input: TurnScenePlanningInput = {
      sourceTurnId: 'turn_conflict',
      sourceStoryTextHash: await hashStoryText(storyText),
      mode: 'manual',
      requestedMaxScenes: 1,
      storyText,
      blocks,
      frozenContext: {
        timeDescription: '1988 年午夜',
        locationDescription: '香港街角',
        presentActorIds: []
      },
      actors: []
    };
    const invalid = {
      shots: [{
        placement: {
          blockIndex: blocks[0]!.blockIndex,
          blockHash: blocks[1]!.blockHash
        },
        sceneSummary: '冲突镜头',
        knownActorIds: [],
        actorVisualStates: [],
        unboundCharacterDescriptions: [],
        locationDescription: '香港街角',
        actionDescription: '人物经过',
        atmosphere: '紧张',
        composition: '中景'
      }]
    };
    const { client, complete } = clientWithOutputs(invalid, invalid);
    const probe = new ImagePromptConversionProbe(client);

    const error = await probe.planTurnScenes(input).catch((caught) => caught);
    expect(error).toMatchObject({
      code: 'invalid-output',
      taskKind: 'turn-scene-plan',
      attempts: 2,
      issues: ['镜头 0 的正文块索引或哈希不匹配']
    });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('rejects stale story/block hashes locally without calling the model', async () => {
    const { client, complete } = clientWithOutputs({ shots: [] });
    const probe = new ImagePromptConversionProbe(client);
    const input = await planningInput();

    const error = await probe.planTurnScenes({ ...input, sourceStoryTextHash: 'f'.repeat(64) }).catch((caught) => caught);
    expect(error).toMatchObject({ code: 'invalid-input', attempts: 0 });
    expect(error.issues).toContain('正文整体哈希与当前 storyText 不一致');
    expect(complete).not.toHaveBeenCalled();
  });

  it('accepts scene prompt output only when actor identity, temporary appearance and additions are resolved', async () => {
    const input: SceneShotPromptInput = {
      shot: {
        placement: { blockIndex: 0, blockHash: 'b'.repeat(64) },
        order: 0,
        sceneSummary: '阿梅站在雨里',
        knownActorIds: ['actor_mei'],
        actorVisualStates: [{ actorId: 'actor_mei', sceneSpecificAppearance: '白衬衣被雨淋湿' }],
        unboundCharacterDescriptions: [],
        locationDescription: '雨夜街头',
        actionDescription: '站在路灯下',
        atmosphere: '潮湿紧张',
        composition: '中景'
      },
      participants: [{
        actorId: 'actor_mei',
        anchorText: VALID_ANCHOR,
        persistentAdditionalRequirementText: '始终保留红色发夹',
        sceneSpecificAppearance: '白衬衣被雨淋湿'
      }],
      world: anchorInput.world,
      oneTimeInstruction: '突出路灯逆光'
    };
    const output = {
      basePositive: '雨夜香港街头，中景',
      baseNegative: '',
      participantResolutions: [{
        actorId: 'actor_mei',
        fixedIdentityPositive: '齐肩黑发，圆脸',
        fixedIdentityNegative: '避免改变脸型',
        appearanceSource: 'scene-specific-override',
        resolvedAppearancePositive: '湿透的白衬衣',
        resolvedAdditionalPositive: '红色发夹',
        resolvedAdditionalNegative: ''
      }],
      resolvedOneTimePositive: '路灯逆光',
      resolvedOneTimeNegative: ''
    };
    const { client, complete } = clientWithOutputs(output);
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.generateSceneShotPrompt(input)).resolves.toEqual(output);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('repairs a scene fact prompt that tries to exclude the selected image medium', async () => {
    const input: SceneShotPromptInput = {
      shot: {
        placement: { blockIndex: 0, blockHash: 'b'.repeat(64) },
        order: 0,
        sceneSummary: '阿梅站在雨里',
        knownActorIds: ['actor_mei'],
        actorVisualStates: [],
        unboundCharacterDescriptions: [],
        locationDescription: '雨夜街头',
        actionDescription: '站在路灯下',
        atmosphere: '潮湿紧张',
        composition: '中景'
      },
      participants: [{ actorId: 'actor_mei', anchorText: VALID_ANCHOR }],
      world: anchorInput.world
    };
    const valid = {
      basePositive: '雨夜香港街头，中景',
      baseNegative: '错误年代汽车',
      participantResolutions: [{
        actorId: 'actor_mei',
        fixedIdentityPositive: '齐肩黑发，圆脸',
        fixedIdentityNegative: '避免改变脸型',
        appearanceSource: 'anchor-default',
        resolvedAppearancePositive: '深色夹克',
        resolvedAdditionalPositive: '',
        resolvedAdditionalNegative: ''
      }],
      resolvedOneTimePositive: '',
      resolvedOneTimeNegative: ''
    };
    const { client, complete } = clientWithOutputs(
      { ...valid, baseNegative: '错误年代汽车，三维渲染，插画，动漫' },
      valid
    );
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.generateSceneShotPrompt(input)).resolves.toEqual(valid);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0]).toContain('baseNegative 不得排除图片媒介或画风');
  });

  it('repairs provider formatting only when the model returns the exact frozen segment IDs', async () => {
    const semantic = {
      positive: 'detective\nrainy street',
      negative: 'watermark',
      segments: [
        {
          segmentId: 'subject:character',
          kind: 'subject' as const,
          priority: 50,
          positive: 'detective',
          negative: '',
          required: true
        },
        {
          segmentId: 'quality:global',
          kind: 'quality' as const,
          priority: 10,
          positive: 'rainy street',
          negative: 'watermark',
          required: false
        }
      ]
    };
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS[2]!;
    const input = createProviderPromptRenderInput(semantic, dialect);
    const invalid = {
      segments: [
        { segmentId: 'subject:character', positive: 'detective', negative: '' },
        { segmentId: 'invented:segment', positive: 'invented content', negative: '' }
      ]
    };
    const valid = {
      segments: [
        { segmentId: 'subject:character', positive: 'detective', negative: '' },
        { segmentId: 'quality:global', positive: 'rainy street', negative: 'watermark' }
      ]
    };
    const { client, complete } = clientWithOutputs(invalid, valid);
    const probe = new ImagePromptConversionProbe(client);

    await expect(probe.renderProviderPrompt(input)).resolves.toEqual(valid);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][0]).toContain('新增了未允许的 segmentId invented:segment');
    expect(complete.mock.calls[1][0]).toContain('缺少 segmentId quality:global');
  });
});
