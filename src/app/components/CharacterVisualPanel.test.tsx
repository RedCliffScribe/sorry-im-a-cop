import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile, type ImageCredentialRepository, type ImageProfileRepository } from '../../domain/imageGeneration/profile';
import { CHARACTER_VISUAL_PURPOSES, type ImagePromptConversionProbe } from '../../domain/imageGeneration/promptConversion';
import { IndexedDbVisualRepository } from '../../domain/imageGeneration/visualRepository';
import { TEST_PNG_BYTES } from '../../domain/imageGeneration/visualRepository/testFixtures';
import { createActorDefaults } from '../../domain/runtime/actorFactory';
import { CharacterVisualPanel } from './CharacterVisualPanel';
import { IndexedDbImageGenerationPresetRepository, createImageGenerationPreset } from '../../domain/imageGeneration/generationPresets';

const DB_NAME = 'character-visual-panel-test';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await deleteDatabase(DB_NAME);
});

describe('CharacterVisualPanel', () => {
  it('imports a local role image, previews image-extracted anchor text, and only overwrites the anchor after confirmation', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const actor = createActorDefaults({
      actorId: 'npc_import',
      name: '阿琳',
      gender: 'female',
      currentIdentity: 'civilian',
      appearance: '黑色短发。',
      clothing: '浅色外套。'
    });
    const extractedAnchor = '【固定外观】黑色短发，圆脸。\n【默认服装】浅色外套。\n【一致性要求】保持五官与年龄观感一致。\n【避免偏移】避免改变发色与脸型。';
    const converter = {
      assertImageAnchorExtractionAvailable: vi.fn(),
      generateCharacterAnchorFromImages: vi.fn().mockResolvedValue({
        actorId: actor.actorId,
        anchorText: extractedAnchor
      }),
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
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));

    render(
      <CharacterVisualPanel
        actor={actor}
        visualSaveId="save_visual"
        worldYear={1988}
        repository={repository}
        createPromptConversion={() => converter}
      />
    );

    await screen.findByLabelText('角色文生图锚点');
    const file = new File([TEST_PNG_BYTES.slice().buffer], 'alin.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('导入本地角色图'), { target: { files: [file] } });
    await waitFor(async () => {
      const snapshot = await repository.loadSnapshot('save_visual');
      expect(Object.values(snapshot.assets)).toHaveLength(1);
      expect(Object.values(snapshot.assets)[0]).toMatchObject({ source: 'user-imported', originPurpose: 'half-body-medium' });
      expect(Object.values(snapshot.bindings)[0]?.imageId).toBe(Object.values(snapshot.assets)[0]?.imageId);
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看原图' }));
    expect(await screen.findByRole('dialog', { name: '原图预览：阿琳 人物原图' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭原图' }));

    fireEvent.change(screen.getByLabelText('绑定图片用途'), { target: { value: 'avatar-close-up' } });
    fireEvent.click(screen.getByRole('button', { name: '设为当前' }));
    await waitFor(async () => {
      expect(Object.values((await repository.loadSnapshot('save_visual')).bindings)).toHaveLength(2);
    });
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    const deleteImpact = await screen.findByRole('alert');
    expect(within(deleteImpact).getByText('将同时解除 2 处绑定：')).toBeInTheDocument();
    expect(within(deleteImpact).getByText('头像特写（CU）')).toBeInTheDocument();
    expect(within(deleteImpact).getByText('半身像（MS）')).toBeInTheDocument();
    fireEvent.click(within(deleteImpact).getByRole('button', { name: '取消' }));
    expect(Object.values((await repository.loadSnapshot('save_visual')).assets)).toHaveLength(1);

    fireEvent.click(await screen.findByLabelText('作为锚点提取来源'));
    fireEvent.click(screen.getByRole('button', { name: '从已选图片提取锚点' }));
    await waitFor(() => expect(screen.getByLabelText('角色文生图锚点')).toHaveValue(extractedAnchor));
    expect(converter.assertImageAnchorExtractionAvailable).toHaveBeenCalled();
    expect(converter.generateCharacterAnchorFromImages).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ actorId: actor.actorId }),
        sourceImages: [expect.objectContaining({ mimeType: 'image/png', width: 1, height: 1 })]
      }),
      [expect.objectContaining({ mimeType: 'image/png', dataUrl: expect.stringMatching(/^data:image\/png;base64,/) })]
    );
    expect(Object.values((await repository.loadSnapshot('save_visual')).characterAnchors)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '保存并覆盖当前锚点' }));
    await waitFor(async () => {
      const anchor = Object.values((await repository.loadSnapshot('save_visual')).characterAnchors)[0];
      expect(anchor).toMatchObject({ source: 'image-extraction-api', anchorText: extractedAnchor });
      expect(anchor.sourceImageIds).toHaveLength(1);
    });
    vi.unstubAllGlobals();
  });

  it('saves one anchor, previews editable final prompts and freezes only after confirmation', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const actor = createActorDefaults({
      actorId: 'npc_visual',
      name: '林美琪',
      gender: 'female',
      currentIdentity: 'civilian',
      appearance: '黑色长发，棕色眼睛。',
      clothing: '米色风衣。'
    });
    await repository.importUserImage({
      saveId: 'save_visual',
      imageId: 'image_ui_reference',
      blobKey: 'blob_ui_reference',
      blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
      width: 1,
      height: 1,
      createdAt: '2026-07-23T00:00:00.000Z',
      originSubject: { type: 'actor', saveId: 'save_visual', actorId: actor.actorId },
      originPurpose: 'half-body-medium',
      bindAsCurrent: false
    });
    const profile = {
      ...createDefaultImageApiProfile('openai-images', 'profile_visual', '2026-07-23T00:00:00.000Z'),
      enabled: true,
      models: [{ modelId: 'gpt-image-test', source: 'manual' as const }],
      defaultModelId: 'gpt-image-test'
    };
    const profileRepository: ImageProfileRepository = {
      listProfiles: vi.fn().mockResolvedValue([profile]),
      getProfile: vi.fn().mockResolvedValue(profile), putProfile: vi.fn(), deleteProfile: vi.fn(),
      listWorkflowTemplates: vi.fn().mockResolvedValue([]), getWorkflowTemplate: vi.fn(),
      putWorkflowTemplate: vi.fn(), deleteWorkflowTemplate: vi.fn(),
      listProfileProbeResults: vi.fn(), putProfileProbeResult: vi.fn(), clearProfileProbeResults: vi.fn()
    };
    const credentialRepository: ImageCredentialRepository = {
      listCredentialSummaries: vi.fn().mockResolvedValue([]),
      getCredentialSummary: vi.fn(), resolveCredential: vi.fn(), putCredential: vi.fn(), deleteCredential: vi.fn()
    };
    const converter = {
      generateCharacterViewPrompts: vi.fn().mockResolvedValue({
        actorId: actor.actorId,
        views: CHARACTER_VISUAL_PURPOSES.map((purpose) => ({
          purpose,
          basePositive: `positive ${purpose}`,
          baseNegative: `negative ${purpose}`,
          appearanceSource: 'anchor-default',
          resolvedAppearancePositive: '米色风衣',
          resolvedAdditionalPositive: 'red hair ribbon',
          resolvedAdditionalNegative: ''
        }))
      }),
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
    const generationPresetRepository = new IndexedDbImageGenerationPresetRepository(`character-generation-presets-${crypto.randomUUID()}`);
    await generationPresetRepository.save(createImageGenerationPreset({
      name: '头像高质量预设', profileId: profile.profileId, providerType: profile.providerType,
      variantKey: 'avatar-close-up', routingTarget: { kind: 'model', modelId: 'gpt-image-test' },
      targetAspectRatio: '4:3',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 2,
        size: { mode: 'dimensions', width: 1536, height: 1024 }, quality: 'high',
        outputFormat: 'webp', outputCompression: 80, background: 'opaque'
      },
      now: '2026-07-23T07:00:00.000Z'
    }));

    render(
      <CharacterVisualPanel
        actor={actor}
        visualSaveId="save_visual"
        worldYear={1988}
        repository={repository}
        createPromptConversion={() => converter}
        profileRepository={profileRepository}
        credentialRepository={credentialRepository}
        generationPresetRepository={generationPresetRepository}
        createImageExecutor={() => ({
          generate: vi.fn().mockResolvedValue([{
            blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
            width: 1,
            height: 1
          }])
        })}
      />
    );

    const anchorField = await screen.findByLabelText('角色文生图锚点');
    await waitFor(() => expect((anchorField as HTMLTextAreaElement).value).toContain('【固定外观】'));
    expect(screen.getByLabelText('头像特写（CU）')).toBeChecked();
    expect(screen.getByLabelText('半身像（MS）')).toBeChecked();
    expect(screen.getByLabelText('膝上立绘（MFS）')).not.toBeChecked();
    expect(screen.getByLabelText('全身立绘（FS）')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('角色额外文生图要求'), { target: { value: '始终保留红色发带' } });
    fireEvent.click(screen.getByLabelText(/作为长期字段保存/));
    fireEvent.click(screen.getByRole('button', { name: '生成并预览提示词' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('明确选择本次使用的图片档案');
    expect(converter.generateCharacterViewPrompts).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('手动人物图图片档案'), { target: { value: profile.profileId } });
    const referenceToggle = await screen.findByLabelText(/image_ui_reference/);
    expect(referenceToggle).toBeEnabled();
    fireEvent.click(referenceToggle);
    fireEvent.click(screen.getByRole('button', { name: '生成并预览提示词' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('存在未保存的角色锚点修改');
    expect(converter.generateCharacterViewPrompts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存并覆盖当前锚点' }));
    expect(await screen.findByText(/来源：玩家编辑/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全选四景别' }));
    fireEvent.change(screen.getByLabelText('膝上立绘（MFS）人物朝向'), {
      target: { value: 'three-quarter-right' }
    });
    fireEvent.change(screen.getByLabelText('膝上立绘（MFS）镜头高度'), {
      target: { value: 'slight-low' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成并预览提示词' }));

    const positiveFields = await screen.findAllByLabelText('最终正向提示词');
    expect(positiveFields).toHaveLength(4);
    expect((positiveFields[0] as HTMLTextAreaElement).value).toContain('red hair ribbon');
    expect(screen.getByText('头像特写（CU） · 4:3')).toBeInTheDocument();
    expect(screen.getByText('半身像（MS） · 3:4')).toBeInTheDocument();
    expect(screen.getByText('膝上立绘（MFS） · 2:3')).toBeInTheDocument();
    expect(screen.getByText('全身立绘（FS） · 9:16')).toBeInTheDocument();
    expect(screen.getByText('右前方四分之三视角 · 轻微仰视')).toBeInTheDocument();
    expect(screen.getAllByText('模型：gpt-image-test')).toHaveLength(4);
    expect(screen.getAllByText('合并进正向提示词')).toHaveLength(4);
    expect(screen.getAllByText('锚点默认服装')).toHaveLength(4);
    expect(screen.getAllByText('实际生成参考图')).toHaveLength(4);
    expect(screen.getAllByText('image_ui_reference')).toHaveLength(4);
    expect(screen.getAllByText('openai-image-edit')).toHaveLength(4);
    fireEvent.change(positiveFields[0], { target: { value: '玩家确认的最终头像提示词' } });

    let snapshot = await repository.loadSnapshot('save_visual');
    expect(Object.values(snapshot.tasks).every((task) => task.status === 'awaiting-confirmation')).toBe(true);
    expect(Object.values(snapshot.characterAnchors)[0].persistentAdditionalRequirementText).toBe('始终保留红色发带');
    const previewAvatar = Object.values(snapshot.tasks).find(
      (task) => task.intent.type === 'character-image' && task.intent.purpose === 'avatar-close-up'
    );
    expect(previewAvatar?.draft).toMatchObject({
      imageGenerationPresetId: `image-preset:${profile.profileId}:avatar-close-up`,
      targetAspectRatio: '4:3',
      generationParameters: { quality: 'high', outputCompression: 80, requestedImageCount: 2 },
      referenceImages: [expect.objectContaining({ imageId: 'image_ui_reference' })],
      referenceImageTransport: { kind: 'openai-image-edit', maxImages: 16 }
    });
    const previewKneeUp = Object.values(snapshot.tasks).find(
      (task) => task.intent.type === 'character-image' && task.intent.purpose === 'knee-up-medium-full'
    );
    expect(previewKneeUp?.draft).toMatchObject({
      characterComposition: { viewAngle: 'three-quarter-right', cameraElevation: 'slight-low' },
      semanticPromptSegments: expect.arrayContaining([
        expect.objectContaining({ segmentId: 'composition:character-camera', priority: 75 })
      ])
    });

    fireEvent.click(screen.getByRole('button', { name: '确认并冻结请求' }));
    await waitFor(async () => {
      snapshot = await repository.loadSnapshot('save_visual');
      expect(Object.values(snapshot.tasks).every((task) => task.status === 'queued')).toBe(true);
    });
    const avatarTask = Object.values(snapshot.tasks).find(
      (task) => task.intent.type === 'character-image' && task.intent.purpose === 'avatar-close-up'
    );
    expect(avatarTask?.submittedRequest).toMatchObject({
      positivePrompt: '玩家确认的最终头像提示词',
      userEdited: true
    });
    expect(await screen.findByRole('status')).toHaveTextContent('本次操作本身没有调用图片供应商');

    fireEvent.click(screen.getByRole('button', { name: '开始生成（可能计费或占用显存）' }));
    await waitFor(async () => {
      const executed = await repository.loadSnapshot('save_visual');
      expect(Object.values(executed.tasks).every((task) => task.status === 'succeeded')).toBe(true);
      expect(Object.values(executed.assets)).toHaveLength(5);
      expect(Object.values(executed.bindings)).toHaveLength(4);
    });

    fireEvent.click(screen.getByLabelText(/作为长期字段保存/));
    fireEvent.change(screen.getByLabelText('角色额外文生图要求'), { target: { value: '只用于下一次' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并覆盖当前锚点' }));
    await waitFor(async () => {
      expect(Object.values((await repository.loadSnapshot('save_visual')).characterAnchors)[0]
        .persistentAdditionalRequirementText).toBe('始终保留红色发带');
    });
    const deletePersistentButton = screen.getByRole('button', { name: '删除长期要求' });
    await waitFor(() => expect(deletePersistentButton).toBeEnabled());
    fireEvent.click(deletePersistentButton);
    await waitFor(async () => {
      expect(Object.values((await repository.loadSnapshot('save_visual')).characterAnchors)[0]
        .persistentAdditionalRequirementText).toBeUndefined();
    });
  });

  it('shows ComfyUI workflow selection and blocks conversion until the workflow is explicit', async () => {
    const repository = new IndexedDbVisualRepository(DB_NAME);
    const actor = createActorDefaults({
      actorId: 'npc_comfy',
      name: '阿晴',
      currentIdentity: 'civilian',
      appearance: '黑色长发。'
    });
    const profile = {
      ...createDefaultImageApiProfile('comfyui-workflow', 'profile_comfy', '2026-07-23T00:00:00.000Z'),
      enabled: true
    };
    const workflow = {
      workflowTemplateId: 'workflow_portrait',
      name: '人物立绘工作流',
      apiWorkflow: {},
      workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      outputNodeIds: ['2'],
      revision: 3,
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const profileRepository: ImageProfileRepository = {
      listProfiles: vi.fn().mockResolvedValue([profile]),
      getProfile: vi.fn().mockResolvedValue(profile), putProfile: vi.fn(), deleteProfile: vi.fn(),
      listWorkflowTemplates: vi.fn().mockResolvedValue([workflow]),
      getWorkflowTemplate: vi.fn().mockResolvedValue(workflow),
      putWorkflowTemplate: vi.fn(), deleteWorkflowTemplate: vi.fn(),
      listProfileProbeResults: vi.fn(), putProfileProbeResult: vi.fn(), clearProfileProbeResults: vi.fn()
    };
    const credentialRepository: ImageCredentialRepository = {
      listCredentialSummaries: vi.fn().mockResolvedValue([]),
      getCredentialSummary: vi.fn(), resolveCredential: vi.fn(), putCredential: vi.fn(), deleteCredential: vi.fn()
    };
    const converter = { generateCharacterViewPrompts: vi.fn() } as unknown as ImagePromptConversionProbe;

    render(<CharacterVisualPanel
      actor={actor}
      visualSaveId="save_visual"
      worldYear={1988}
      repository={repository}
      createPromptConversion={() => converter}
      profileRepository={profileRepository}
      credentialRepository={credentialRepository}
    />);

    await screen.findByLabelText('角色文生图锚点');
    fireEvent.click(screen.getByRole('button', { name: '保存并覆盖当前锚点' }));
    fireEvent.change(screen.getByLabelText('手动人物图图片档案'), { target: { value: profile.profileId } });
    expect(await screen.findByLabelText('手动人物图 ComfyUI API 工作流')).toHaveDisplayValue('请明确选择');
    fireEvent.click(screen.getByRole('button', { name: '生成并预览提示词' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('明确选择 API 工作流');
    expect(converter.generateCharacterViewPrompts).not.toHaveBeenCalled();
  });
});
