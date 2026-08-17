import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile, type ImageApiProfile } from '../../domain/imageGeneration/profile';
import type { ImageGenerationPresetRepository } from '../../domain/imageGeneration/generationPresets';
import type { VisualAsset, VisualRepository } from '../../domain/imageGeneration/visualRepository';
import { createPersistingTask } from '../../domain/imageGeneration/visualRepository/testFixtures';
import { ImagePromptReusePanel } from './ImagePromptReusePanel';

function currentProfile(): ImageApiProfile {
  return {
    ...createDefaultImageApiProfile('openai-images', 'profile_current', '2026-07-23T00:00:00.000Z'),
    name: '当前有效档案',
    enabled: true,
    models: [{ modelId: 'gpt-image-current', source: 'manual' }],
    defaultModelId: 'gpt-image-current'
  } as ImageApiProfile;
}

function sourceAsset(taskId: string): VisualAsset {
  return {
    imageId: 'image_source', scope: 'save', saveId: 'save_a', source: 'generated',
    originSubject: { type: 'actor', saveId: 'save_a', actorId: 'actor_mei' },
    originPurpose: 'half-body-medium', sourceTaskId: taskId,
    mimeType: 'image/png', width: 768, height: 1024, byteLength: 8,
    contentHash: 'source-hash', blobKey: 'blob_source', createdAt: '2026-07-23T00:00:00.000Z'
  };
}

function dependencies() {
  const profile = currentProfile();
  const repository = {
    saveCharacterBatchWithTasks: vi.fn(),
    saveTask: vi.fn(),
    loadSnapshot: vi.fn()
  } as unknown as VisualRepository;
  return {
    profile,
    repository,
    profileRepository: {
      listProfiles: vi.fn(async () => [profile]),
      listWorkflowTemplates: vi.fn(async () => []),
      getProfile: vi.fn(async (profileId: string) => profileId === profile.profileId ? profile : null),
      getWorkflowTemplate: vi.fn(async () => null)
    } as never,
    credentialRepository: {
      listCredentialSummaries: vi.fn(async () => [])
    } as never,
    generationPresetRepository: {
      get: vi.fn(async () => undefined)
    } as unknown as ImageGenerationPresetRepository
  };
}

describe('ImagePromptReusePanel', () => {
  it('does not silently replace a stale source profile and cancel creates no repository writes', async () => {
    const task = createPersistingTask('task_source');
    const setup = dependencies();
    const onCancel = vi.fn();
    render(
      <ImagePromptReusePanel
        sourceAsset={sourceAsset(task.taskId)}
        sourceTask={task}
        snapshot={{
          schemaVersion: 1, saveId: 'save_a', characterAnchors: {}, scenePlans: {}, tasks: {},
          characterBatches: {}, assets: {}, bindings: {}, storySceneDisplayStates: {}
        }}
        repository={setup.repository}
        actors={{ actor_mei: { actorId: 'actor_mei', name: '阿梅' } as never }}
        profileRepository={setup.profileRepository}
        credentialRepository={setup.credentialRepository}
        generationPresetRepository={setup.generationPresetRepository}
        onComplete={vi.fn()}
        onCancel={onCancel}
        onOpenSettings={vi.fn()}
      />
    );

    expect(await screen.findByText(/原图片档案已停用或不存在/)).toBeInTheDocument();
    expect(screen.getByLabelText('本次图片档案')).toHaveValue('');
    expect(screen.getByRole('button', { name: '生成请求预览' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '取消复用' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(setup.repository.saveCharacterBatchWithTasks).not.toHaveBeenCalled();
    expect(setup.repository.saveTask).not.toHaveBeenCalled();
  });

  it('builds an editable in-memory preview with current routing and still writes nothing', async () => {
    const task = createPersistingTask('task_source');
    const setup = dependencies();
    render(
      <ImagePromptReusePanel
        sourceAsset={sourceAsset(task.taskId)}
        sourceTask={task}
        snapshot={{
          schemaVersion: 1, saveId: 'save_a', characterAnchors: {}, scenePlans: {}, tasks: {},
          characterBatches: {}, assets: {}, bindings: {}, storySceneDisplayStates: {}
        }}
        repository={setup.repository}
        actors={{ actor_mei: { actorId: 'actor_mei', name: '阿梅' } as never }}
        profileRepository={setup.profileRepository}
        credentialRepository={setup.credentialRepository}
        generationPresetRepository={setup.generationPresetRepository}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );

    await screen.findByText(/原图片档案已停用或不存在/);
    fireEvent.change(screen.getByLabelText('本次图片档案'), { target: { value: setup.profile.profileId } });
    fireEvent.click(screen.getByRole('button', { name: '生成请求预览' }));

    expect(await screen.findByDisplayValue('character portrait')).toBeInTheDocument();
    expect(screen.getByDisplayValue('blurry')).toBeInTheDocument();
    expect(screen.getByText(/模型：gpt-image-current/)).toBeInTheDocument();
    expect(screen.getByText('沿用提示词 · 原任务 task_source')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认并开始生成（可能产生费用）' })).toBeEnabled();
    await waitFor(() => expect(setup.generationPresetRepository.get).toHaveBeenCalledWith('profile_current', 'half-body-medium'));
    expect(setup.repository.saveCharacterBatchWithTasks).not.toHaveBeenCalled();
    expect(setup.repository.saveTask).not.toHaveBeenCalled();
  });
});
