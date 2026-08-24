import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile, IndexedDbImageProfileRepository, type ImageApiProfile } from '../../domain/imageGeneration/profile';
import {
  PromptConversionContractError,
  type ImagePromptConversionProbe
} from '../../domain/imageGeneration/promptConversion';
import { IndexedDbVisualRepository } from '../../domain/imageGeneration/visualRepository';
import { TEST_ANCHOR, TEST_PNG_BYTES } from '../../domain/imageGeneration/visualRepository/testFixtures';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import type { StoryEntry } from '../../domain/runtime/types';
import {
  formatStorySceneError,
  hasUnresolvedFailedSceneTask,
  StorySceneTurn
} from './StorySceneTurn';
import { IndexedDbImageGenerationPresetRepository, createImageGenerationPreset } from '../../domain/imageGeneration/generationPresets';

describe('StorySceneTurn', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:scene-test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('keeps the complete scene-image aspect ratio instead of clipping it to the viewport height', () => {
    const css = readFileSync('src/styles/global.css', 'utf8');
    const rule = css.match(/\.story-scene-image img\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('width: 100%');
    expect(rule).toContain('height: auto');
    expect(rule).toContain('object-fit: contain');
    expect(rule).not.toContain('max-height');
  });

  it('plans first, lets the player edit and confirm final prompts, and only then starts image generation', async () => {
    const state = createInitialRuntimeState();
    const actors = {
      ...state.actors,
      player: {
        ...state.actors.player!,
        name: '陈美玲',
        callName: '美玲',
        aliases: ['阿玲']
      }
    };
    const repository = new IndexedDbVisualRepository(`story-scene-ui-${crypto.randomUUID()}`);
    await repository.saveCharacterAnchor({
      anchorId: 'anchor_player',
      saveId: 'save_ui',
      actorId: 'player',
      anchorText: TEST_ANCHOR,
      source: 'user-edited',
      sourceImageIds: [],
      updatedAt: '2026-07-23T03:00:00.000Z'
    });
    await repository.importUserImage({
      saveId: 'save_ui',
      imageId: 'scene_ui_reference',
      blobKey: 'scene_ui_reference_blob',
      blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
      width: 1,
      height: 1,
      createdAt: '2026-07-23T03:00:00.000Z',
      originPurpose: 'turn-scene',
      bindAsCurrent: false
    });
    const profiles = new IndexedDbImageProfileRepository(`story-scene-profile-${crypto.randomUUID()}`);
    const base = createDefaultImageApiProfile('sd-webui', 'profile_scene', '2026-07-23T03:00:00.000Z');
    await profiles.putProfile({
      ...base,
      enabled: true,
      models: [{ modelId: 'scene-model', source: 'manual' }],
      defaultModelId: 'scene-model'
    } as ImageApiProfile);
    const generationPresets = new IndexedDbImageGenerationPresetRepository(`story-scene-presets-${crypto.randomUUID()}`);
    await generationPresets.save(createImageGenerationPreset({
      name: '场景高质量预设', profileId: 'profile_scene', providerType: 'sd-webui',
      variantKey: 'narrative-scene', routingTarget: { kind: 'model', modelId: 'scene-model' },
      targetAspectRatio: '4:3',
      generationParameters: {
        providerType: 'sd-webui', requestedImageCount: 2, width: 1024, height: 768,
        seed: { mode: 'fixed', value: 9527 }, checkpoint: 'scene-model', steps: 28, cfgScale: 6.5
      },
      now: '2026-07-23T07:00:00.000Z'
    }));
    const entry: StoryEntry = {
      turnId: 'turn_3',
      speaker: 'narrator',
      text: '【旁白】雨水沿着霓虹招牌滴落。',
      gameTime: state.time,
      visualContext: {
        timeDescription: '1988年7月23日 23:10',
        locationDescription: '旺角街头',
        weatherDescription: '暴雨',
        presentActorIds: ['player']
      }
    };
    const converter = {
      planTurnScenes: vi.fn(async (input: { blocks: Array<{ blockHash: string }> }) => ({
        shots: [{
          placement: { blockIndex: 0, blockHash: input.blocks[0]!.blockHash },
          order: 0,
          sceneSummary: '玩家站在雨夜霓虹下',
          knownActorIds: ['player'],
          actorVisualStates: [{ actorId: 'player', sceneSpecificAppearance: '湿透的便服外套' }],
          unboundCharacterDescriptions: [],
          locationDescription: '旺角街头',
          actionDescription: '站在霓虹招牌下观察',
          atmosphere: '雨夜、危险',
          composition: '16:9 中景'
        }]
      })),
      generateSceneShotPrompt: vi.fn(async () => ({
        basePositive: '香港雨夜街头，霓虹灯',
        baseNegative: '现代物件',
        participantResolutions: [{
          actorId: 'player',
          fixedIdentityPositive: '固定脸部身份',
          fixedIdentityNegative: '避免改变脸型',
          appearanceSource: 'scene-specific-override',
          resolvedAppearancePositive: '湿透的便服外套',
          resolvedAdditionalPositive: '',
          resolvedAdditionalNegative: ''
        }],
        resolvedOneTimePositive: '',
        resolvedOneTimeNegative: ''
      })),
      renderProviderPrompt: vi.fn(async (input: {
        segments: Array<{ segmentId: string; positive: string; negative: string }>;
      }) => ({
        segments: input.segments.map((segment) => ({
          segmentId: segment.segmentId,
          positive: segment.positive,
          negative: segment.negative
        }))
      }))
    } as unknown as ImagePromptConversionProbe;
    const generate = vi.fn().mockResolvedValue([{
      blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
      width: 1,
      height: 1
    }]);

    const view = render(<StorySceneTurn entry={entry} configuration={{
      saveId: 'save_ui',
      actors,
      worldYear: 1988,
      repository,
      profileRepository: profiles,
      generationPresetRepository: generationPresets,
      createPromptConversion: () => converter,
      createImageExecutor: () => ({ generate })
    }} />);

    fireEvent.click(screen.getByRole('button', { name: '生成场景图' }));
    fireEvent.click(screen.getByRole('button', { name: '规划并预览提示词' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('明确选择本次使用的图片档案');
    expect(converter.planTurnScenes).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('手动场景图图片档案'), { target: { value: 'profile_scene' } });
    const referenceToggle = await screen.findByLabelText(/scene_ui_reference/);
    expect(referenceToggle).toBeEnabled();
    fireEvent.click(referenceToggle);
    fireEvent.click(screen.getByRole('button', { name: '规划并预览提示词' }));
    expect(await screen.findByText('场景 1')).toBeInTheDocument();
    expect(converter.planTurnScenes).toHaveBeenCalledWith(expect.objectContaining({
      actors: [expect.objectContaining({
        actorId: 'player',
        publicName: '陈美玲',
        publicAliases: expect.arrayContaining(['美玲', '阿玲'])
      })]
    }));
    const executionSummary = screen.getByLabelText('场景 1 执行摘要');
    expect(executionSummary).toHaveTextContent('profile_scene / sd-webui');
    expect(executionSummary).toHaveTextContent('模型 scene-model');
    expect(executionSummary).toHaveTextContent('目标画幅4:3');
    expect(executionSummary).toHaveTextContent('负向词传输独立负向字段');
    expect(executionSummary).toHaveTextContent('参考图片scene_ui_reference');
    expect(executionSummary).toHaveTextContent('参考图传输sd-webui-img2img');
    expect(executionSummary).toHaveTextContent('人物装扮来源player：本镜头覆盖（湿透的便服外套）');
    fireEvent.click(screen.getByText('查看本次实际生成参数（不含凭据）'));
    expect(executionSummary).toHaveTextContent('"seed"');
    expect(executionSummary).toHaveTextContent('9527');
    expect(executionSummary).toHaveTextContent('"steps": 28');
    expect(generate).not.toHaveBeenCalled();
    const preview = await repository.loadSnapshot('save_ui');
    expect(Object.values(preview.tasks)[0]?.draft).toMatchObject({
      imageGenerationPresetId: 'image-preset:profile_scene:narrative-scene',
      targetAspectRatio: '4:3',
      generationParameters: { requestedImageCount: 2, width: 1024, height: 768, steps: 28, cfgScale: 6.5 },
      referenceImages: [expect.objectContaining({ imageId: 'scene_ui_reference' })],
      referenceImageTransport: { kind: 'sd-webui-img2img', maxImages: 1, denoisingStrength: 0.55 }
    });

    const positive = screen.getByRole('textbox', { name: '最终正向提示词' });
    fireEvent.change(positive, { target: { value: `${(positive as HTMLTextAreaElement).value}\n玩家修改` } });
    fireEvent.click(screen.getByRole('button', { name: '确认并冻结提示词' }));
    expect(await screen.findByRole('button', { name: '开始生成' }, { timeout: 5_000 })).toBeInTheDocument();
    expect(generate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '开始生成' }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot('save_ui');
      expect(Object.keys(snapshot.assets)).toHaveLength(2);
      expect(snapshot.storySceneDisplayStates.turn_3.activeShotIds).toHaveLength(1);
    });
    expect(await screen.findByAltText('玩家站在雨夜霓虹下')).toHaveAttribute('src', 'blob:scene-test');
    fireEvent.click(screen.getByRole('button', { name: '查看原图' }));
    expect(await screen.findByRole('dialog', { name: '原图预览：玩家站在雨夜霓虹下' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭原图' }));

    const beforeRegeneration = await repository.loadSnapshot('save_ui');
    const oldShotId = beforeRegeneration.storySceneDisplayStates.turn_3.activeShotIds[0]!;
    fireEvent.click(screen.getByRole('button', { name: '重新生成此图' }));
    expect(await screen.findByText('显示操作：单图重生')).toBeInTheDocument();
    expect((screen.getByRole('textbox', { name: '最终正向提示词' }) as HTMLTextAreaElement).value).toContain('香港雨夜街头');
    const confirmRegeneration = screen.getByRole('button', { name: '确认并冻结提示词' });
    await waitFor(() => expect(confirmRegeneration).toBeEnabled());
    fireEvent.click(confirmRegeneration);
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot('save_ui');
      expect(Object.values(snapshot.tasks).some((task) => task.source === 'regenerate' && task.status === 'queued')).toBe(true);
    }, { timeout: 5_000 });
    fireEvent.click(await screen.findByRole('button', { name: '开始生成' }, { timeout: 5_000 }));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot('save_ui');
      const activeShotId = snapshot.storySceneDisplayStates.turn_3.activeShotIds[0];
      expect(activeShotId).not.toBe(oldShotId);
      const regenerationTask = Object.values(snapshot.tasks).find((task) => task.source === 'regenerate');
      expect(regenerationTask?.sourceTaskId).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText('场景图显示方式'), { target: { value: 'replace-group' } });
    fireEvent.click(screen.getByRole('button', { name: '规划并预览提示词' }));
    expect(await screen.findByText('显示操作：整组替换')).toBeInTheDocument();
    expect(generate).toHaveBeenCalledTimes(2);

    view.rerender(<StorySceneTurn entry={{ ...entry, text: '【旁白】回溯后重新生成的另一段正文。' }} configuration={{
      saveId: 'save_ui',
      actors,
      worldYear: 1988,
      repository,
      profileRepository: profiles,
      generationPresetRepository: generationPresets,
      createPromptConversion: () => converter,
      createImageExecutor: () => ({ generate })
    }} />);
    await waitFor(() => expect(screen.queryByAltText('玩家站在雨夜霓虹下')).not.toBeInTheDocument());
  });

  it('disables historical generation when a legacy turn has no frozen visual context', async () => {
    const state = createInitialRuntimeState();
    render(<StorySceneTurn entry={{ ...state.storyLog[0], visualContext: undefined }} configuration={{
      saveId: 'save_legacy',
      actors: state.actors,
      worldYear: 1988,
      repository: new IndexedDbVisualRepository(`story-scene-legacy-${crypto.randomUUID()}`)
    }} />);
    fireEvent.click(screen.getByRole('button', { name: '生成场景图' }));
    expect(screen.getByText(/旧回合缺少冻结视觉上下文/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '规划并预览提示词' })).toBeDisabled();
  });

  it('identifies scene-planning contract failures before the image provider boundary', () => {
    const message = formatStorySceneError(new PromptConversionContractError(
      'invalid-output',
      'turn-scene-plan',
      'turn-scene-plan 返回在一次结构修复后仍不符合契约',
      [
        'shots.0.placement.blockHash: Required',
        'shots.0.knownActorIds: Expected array'
      ],
      2
    ));

    expect(message).toContain('回合正文场景规划未能完成');
    expect(message).toContain('shots.0.placement.blockHash');
    expect(message).toContain('图片供应商尚未调用');
    expect(message).not.toContain('GPT Image');
  });

  it('does not keep warning about a failed task after a retry succeeds', () => {
    expect(hasUnresolvedFailedSceneTask([
      { taskId: 'failed-original', status: 'failed' },
      { taskId: 'successful-retry', sourceTaskId: 'failed-original', status: 'succeeded' }
    ])).toBe(false);

    expect(hasUnresolvedFailedSceneTask([
      { taskId: 'failed-original', status: 'failed' },
      { taskId: 'failed-retry', sourceTaskId: 'failed-original', status: 'failed' }
    ])).toBe(true);
  });
});
