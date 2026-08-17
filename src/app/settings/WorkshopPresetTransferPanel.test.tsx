import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createImageGenerationPreset,
  type ImageGenerationPreset,
  type ImageGenerationPresetRepository
} from '../../domain/imageGeneration/generationPresets';
import {
  createDefaultImagePromptTemplateSettings,
  type ImagePromptTemplateRepository,
  type ImagePromptTemplateSettings
} from '../../domain/imageGeneration/promptConversion';
import type {
  ComfyWorkflowTemplate,
  ImageApiProfile,
  ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import {
  createImageGenerationWorkshopPackage,
  loadImageGenerationWorkshopPackage,
  type WorkshopImportSourceRecord,
  type WorkshopImportSourceRepository
} from '../../domain/workshop';
import { WorkshopPresetTransferPanel } from './WorkshopPresetTransferPanel';

const now = '2026-08-02T00:00:00.000Z';

function profile(profileId: string, modelId: string): Extract<ImageApiProfile, { providerType: 'openai-images' }> {
  return {
    profileId,
    name: `图片档案 ${profileId}`,
    providerType: 'openai-images',
    enabled: true,
    apiBaseUrl: 'https://local.invalid/v1',
    requestTimeoutMs: 60_000,
    downloadTimeoutMs: 60_000,
    models: [{ modelId, displayName: '本地图片模型', source: 'manual' }],
    defaultModelId: modelId,
    config: {
      apiVariant: 'openai-compatible',
      resultTransportPreference: 'auto',
      modelDiscovery: 'standard-models-endpoint'
    },
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
}

function preset(profileId: string, modelId: string): ImageGenerationPreset {
  return createImageGenerationPreset({
    name: '半身人物测试预设',
    profileId,
    providerType: 'openai-images',
    variantKey: 'half-body-medium',
    routingTarget: { kind: 'model', modelId },
    targetAspectRatio: '3:4',
    generationParameters: {
      providerType: 'openai-images',
      requestedImageCount: 1,
      size: { mode: 'dimensions', width: 1024, height: 1536 },
      quality: 'medium',
      outputFormat: 'png',
      background: 'opaque'
    },
    now
  });
}

function profileRepository(profiles: ImageApiProfile[]): ImageProfileRepository {
  return {
    listProfiles: async () => profiles,
    getProfile: async (profileId) => profiles.find((value) => value.profileId === profileId) ?? null,
    putProfile: async () => undefined,
    deleteProfile: async () => undefined,
    listWorkflowTemplates: async () => [] as ComfyWorkflowTemplate[],
    getWorkflowTemplate: async () => null,
    putWorkflowTemplate: async () => undefined,
    deleteWorkflowTemplate: async () => undefined,
    listProfileProbeResults: async () => [],
    putProfileProbeResult: async () => undefined,
    clearProfileProbeResults: async () => undefined
  };
}

function presetRepository(initial: ImageGenerationPreset[] = []): ImageGenerationPresetRepository {
  const values = new Map(initial.map((value) => [value.presetId, value]));
  return {
    get: async (profileId, variantKey) => values.get(`image-preset:${profileId}:${variantKey}`),
    list: async (profileId) => [...values.values()].filter((value) => value.profileId === profileId),
    save: async (value) => { values.set(value.presetId, structuredClone(value)); },
    delete: async (profileId, variantKey) => { values.delete(`image-preset:${profileId}:${variantKey}`); },
    clearProfile: async (profileId) => {
      [...values.values()].filter((value) => value.profileId === profileId)
        .forEach((value) => values.delete(value.presetId));
    }
  };
}

function promptRepository(initial: ImagePromptTemplateSettings): ImagePromptTemplateRepository {
  let settings = structuredClone(initial);
  return {
    load: async () => structuredClone(settings),
    save: async (value) => { settings = structuredClone(value); }
  };
}

function sourceRepository(): WorkshopImportSourceRepository {
  const values = new Map<string, WorkshopImportSourceRecord>();
  return {
    get: async (localPresetId) => values.get(localPresetId),
    listByOriginKey: async (originKey) => [...values.values()].filter((value) => value.originKey === originKey),
    save: async (value) => { values.set(value.localPresetId, structuredClone(value)); },
    delete: async (localPresetId) => { values.delete(localPresetId); },
    clearAll: async () => { values.clear(); }
  };
}

describe('WorkshopPresetTransferPanel', () => {
  it('exports a checked local preset through the player-visible download flow', async () => {
    const user = userEvent.setup();
    const localProfile = profile('source-profile', 'source-model');
    const localPreset = preset(localProfile.profileId, 'source-model');
    const downloadFile = vi.fn();
    render(
      <WorkshopPresetTransferPanel
        profileRepository={profileRepository([localProfile])}
        generationPresetRepository={presetRepository([localPreset])}
        promptTemplateRepository={promptRepository(createDefaultImagePromptTemplateSettings(now))}
        importSourceRepository={sourceRepository()}
        appVersion="1.7.49"
        downloadFile={downloadFile}
      />
    );

    await user.click(await screen.findByRole('checkbox', { name: /半身人物测试预设/ }));
    await user.type(screen.getByLabelText('分享包标题'), '玩家公开预设');
    await user.type(screen.getByLabelText('摘要'), '用于验证本地导出下载。');
    await user.click(screen.getByRole('button', { name: '生成并下载分享包' }));

    await waitFor(() => expect(downloadFile).toHaveBeenCalledOnce());
    const [fileName, contents] = downloadFile.mock.calls[0] as [string, string];
    expect(fileName).toBe('玩家公开预设.sicv2-image-preset.json');
    expect(contents).toContain('sorry-im-a-cop-v2-workshop-package');
    expect(contents).not.toContain('source-profile');
    expect(await screen.findByRole('status')).toHaveTextContent('已导出');
  });

  it('requires explicit local profile and model mapping before importing', async () => {
    const sourceProfile = profile('source-profile', 'source-model');
    const exported = await createImageGenerationWorkshopPackage({
      presets: [preset(sourceProfile.profileId, 'source-model')],
      promptTemplateSettings: createDefaultImagePromptTemplateSettings(now),
      manifest: {
        title: '待导入公开预设',
        summary: '用于验证本地文件导入。',
        contentRating: 'general',
        language: 'zh-CN',
        tags: ['测试'],
        minAppVersion: '1.7.49'
      }
    });
    const targetProfile = profile('target-profile', 'target-model');
    const targetPresets = presetRepository();
    const targetPrompts = createDefaultImagePromptTemplateSettings(now);
    const user = userEvent.setup();
    render(
      <WorkshopPresetTransferPanel
        profileRepository={profileRepository([targetProfile])}
        generationPresetRepository={targetPresets}
        promptTemplateRepository={promptRepository(targetPrompts)}
        importSourceRepository={sourceRepository()}
        appVersion="1.7.49"
      />
    );

    await screen.findByText('当前尚未保存可导出的文生图生成预设。');
    const file = new File([exported.json], 'preset.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => exported.json });
    await user.upload(screen.getByLabelText('选择分享包 JSON'), file);
    await screen.findByText(/分享包已校验/);

    const importButton = screen.getByRole('button', { name: '确认导入本地资料库' });
    expect(importButton).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('半身人物测试预设 本地 API 档案'),
      'target-profile'
    );
    expect(importButton).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText('半身人物测试预设 本地执行目标'),
      'target-model'
    );
    await waitFor(() => expect(importButton).toBeEnabled());
    await user.click(importButton);

    expect(await screen.findByRole('status')).toHaveTextContent('已导入 1 个生成预设');
    await expect(targetPresets.get('target-profile', 'half-body-medium')).resolves.toMatchObject({
      profileId: 'target-profile',
      routingTarget: { kind: 'model', modelId: 'target-model' }
    });
  });

  it('keeps online item and revision provenance after the verified package is imported', async () => {
    const sourceProfile = profile('source-profile', 'source-model');
    const exported = await createImageGenerationWorkshopPackage({
      presets: [preset(sourceProfile.profileId, 'source-model')],
      promptTemplateSettings: createDefaultImagePromptTemplateSettings(now),
      manifest: {
        title: '在线公开预设',
        summary: '用于验证在线下载来源。',
        contentRating: 'general',
        language: 'zh-CN',
        tags: ['在线'],
        minAppVersion: '1.7.49'
      }
    });
    const loadedPackage = await loadImageGenerationWorkshopPackage(exported.json);
    const targetProfile = profile('target-profile', 'target-model');
    const sources = sourceRepository();
    const saveSource = vi.spyOn(sources, 'save');
    const user = userEvent.setup();
    render(
      <WorkshopPresetTransferPanel
        profileRepository={profileRepository([targetProfile])}
        generationPresetRepository={presetRepository()}
        promptTemplateRepository={promptRepository(createDefaultImagePromptTemplateSettings(now))}
        importSourceRepository={sources}
        appVersion="1.7.49"
        initialRemotePackage={{
          loadedPackage,
          sourceMetadata: {
            itemId: 'item_public_1',
            revisionId: 'revision_public_1',
            authorDisplayName: '工坊作者'
          }
        }}
      />
    );

    expect(await screen.findByRole('status')).toHaveTextContent('已下载并校验：在线公开预设');
    await user.selectOptions(screen.getByLabelText('半身人物测试预设 本地 API 档案'), 'target-profile');
    await user.selectOptions(screen.getByLabelText('半身人物测试预设 本地执行目标'), 'target-model');
    await user.click(screen.getByRole('button', { name: '确认导入本地资料库' }));

    await waitFor(() => expect(saveSource).toHaveBeenCalledWith(expect.objectContaining({
      itemId: 'item_public_1',
      revisionId: 'revision_public_1',
      authorDisplayName: '工坊作者'
    })));
  });
});
