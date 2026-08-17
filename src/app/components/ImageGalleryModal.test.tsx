import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VisualRepositorySnapshot } from '../../domain/imageGeneration/visualRepository';
import {
  createVisualBindingId,
  VisualAssetBlobMismatchError,
  type VisualRepository
} from '../../domain/imageGeneration/visualRepository';
import {
  createPersistingTask,
  createSubmittedRequest,
  TEST_ANCHOR
} from '../../domain/imageGeneration/visualRepository/testFixtures';
import { ImageGalleryModal } from './ImageGalleryModal';

function emptySnapshot(saveId = 'save_gallery'): VisualRepositorySnapshot {
  return {
    schemaVersion: 1,
    saveId,
    characterAnchors: {},
    scenePlans: {},
    tasks: {},
    characterBatches: {},
    assets: {},
    bindings: {},
    storySceneDisplayStates: {}
  };
}

function repositoryWith(loadSnapshot: VisualRepository['loadSnapshot'], overrides: Partial<VisualRepository> = {}) {
  return {
    loadSnapshot,
    getStorageSummary: vi.fn(async (saveId: string) => ({
      saveId,
      metadataAssetCount: 0,
      storedBlobCount: 0,
      storedBytes: 0,
      missingBlobCount: 0,
      missingImageIds: [],
      corruptBlobCount: 0,
      corruptImageIds: [],
      orphanBlobCount: 0
    })),
    inspectStorageIntegrity: vi.fn(async () => { throw new Error('not used'); }),
    cleanupStorageIssues: vi.fn(async () => ({ removedBlobCount: 0, removedBytes: 0, affectedImageIds: [] })),
    restoreAssetBlob: vi.fn(async () => { throw new Error('not used'); }),
    getBlob: vi.fn(async () => null),
    getAssetDeletionImpact: vi.fn(async (_saveId: string, imageId: string) => ({ imageId, bindingIds: [] })),
    deleteAsset: vi.fn(async () => undefined),
    importUserImage: vi.fn(async () => { throw new Error('not used'); }),
    bindAsset: vi.fn(async () => undefined),
    unbindAsset: vi.fn(async () => undefined),
    restoreSceneAssetToStory: vi.fn(async () => undefined),
    ...overrides
  } as VisualRepository;
}

describe('ImageGalleryModal', () => {
  it('loads the independent repository and exposes a non-generating empty state', async () => {
    const loadSnapshot = vi.fn(async () => emptySnapshot());
    render(
      <ImageGalleryModal
        visualSaveId="save_gallery"
        repository={repositoryWith(loadSnapshot)}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByRole('heading', { name: '当前存档还没有图片' })).toBeInTheDocument();
    expect(loadSnapshot).toHaveBeenCalledWith('save_gallery');
    expect(screen.getByText(/空状态不会自动测试连接、转换提示词或生成图片/)).toBeInTheDocument();
    expect(screen.getByText('视觉仓库独立')).toBeInTheDocument();

    expect(screen.getByText(/未来的玩家预制包导入不会写入游戏本体美术目录/)).toBeInTheDocument();
  });

  it('closes before routing to settings and can close back to the current game context', async () => {
    const onClose = vi.fn();
    const onOpenSettings = vi.fn();
    render(
      <ImageGalleryModal
        repository={repositoryWith(vi.fn())}
        onOpenSettings={onOpenSettings}
        onClose={onClose}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: '前往文生图设置' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('reports repository failure without replacing it with a false empty state', async () => {
    render(
      <ImageGalleryModal
        visualSaveId="save_broken"
        repository={repositoryWith(vi.fn(async () => Promise.reject(new Error('broken'))))}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('视觉资料读取失败'));
    expect(screen.queryByRole('heading', { name: '当前存档还没有图片' })).not.toBeInTheDocument();
  });

  it('combines actor, turn, source, backend, binding and date filters while reporting actual local storage', async () => {
    const populated = emptySnapshot();
    const actorSubject = { type: 'actor' as const, saveId: populated.saveId, actorId: 'npc_1' };
    const sceneSubject = {
      type: 'scene-shot' as const,
      saveId: populated.saveId,
      turnId: 'turn_scene',
      scenePlanId: 'plan_scene',
      shotId: 'shot_scene'
    };
    populated.scenePlans.plan_scene = {
      planId: 'plan_scene',
      saveId: populated.saveId,
      sourceTurnId: 'turn_scene',
      sourceStoryTextHash: 'a'.repeat(64),
      mode: 'manual',
      requestedMaxScenes: 1,
      shots: [{
        shotId: 'shot_scene',
        placement: { blockIndex: 0, blockHash: 'b'.repeat(64) },
        order: 0,
        sceneSummary: '两人在雨夜街头交谈',
        knownActorIds: ['npc_1', 'npc_2'],
        actorVisualStates: [],
        unboundCharacterDescriptions: [],
        locationDescription: '雨夜街头',
        actionDescription: '交谈',
        atmosphere: '紧张',
        composition: '中景'
      }],
      createdAt: '2026-07-22T00:00:00.000Z'
    };
    populated.assets.image_actor = {
      imageId: 'image_actor',
      scope: 'save',
      saveId: populated.saveId,
      source: 'generated',
      originSubject: actorSubject,
      originPurpose: 'half-body-medium',
      mimeType: 'image/png',
      width: 768,
      height: 1024,
      byteLength: 1024,
      contentHash: 'actor-hash',
      blobKey: 'blob_actor',
      createdAt: '2026-07-21T08:00:00.000Z',
      submittedRequest: createSubmittedRequest('intent_actor')
    };
    populated.assets.image_scene = {
      imageId: 'image_scene',
      scope: 'save',
      saveId: populated.saveId,
      source: 'user-imported',
      originSubject: sceneSubject,
      originPurpose: 'turn-scene',
      mimeType: 'image/png',
      width: 1024,
      height: 768,
      byteLength: 512,
      contentHash: 'scene-hash',
      blobKey: 'blob_scene',
      createdAt: '2026-07-22T08:00:00.000Z'
    };
    populated.assets.image_metadata_only = {
      imageId: 'image_metadata_only',
      scope: 'save',
      saveId: populated.saveId,
      source: 'preset-pack',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      byteLength: 256,
      contentHash: 'metadata-hash',
      blobKey: 'blob_missing',
      createdAt: '2026-07-23T08:00:00.000Z'
    };
    for (const [subject, purpose, imageId, variantKey] of [
      [actorSubject, 'half-body-medium', 'image_actor', undefined],
      [sceneSubject, 'turn-scene', 'image_scene', 'shot_scene']
    ] as const) {
      const bindingId = createVisualBindingId(populated.saveId, subject, purpose, variantKey);
      populated.bindings[bindingId] = {
        bindingId,
        saveId: populated.saveId,
        subject,
        purpose,
        variantKey,
        imageId,
        updatedAt: '2026-07-23T09:00:00.000Z'
      };
    }
    const repository = repositoryWith(vi.fn(async () => populated), {
      getStorageSummary: vi.fn(async () => ({
        saveId: populated.saveId,
        metadataAssetCount: 3,
        storedBlobCount: 2,
        storedBytes: 1536,
        missingBlobCount: 1,
        missingImageIds: ['image_metadata_only'],
        corruptBlobCount: 0,
        corruptImageIds: [],
        orphanBlobCount: 0
      }))
    });
    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repository}
        actors={{
          npc_1: { actorId: 'npc_1', name: '陈强' } as never,
          npc_2: { actorId: 'npc_2', name: '阿梅' } as never
        }}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const summary = await screen.findByLabelText('图片资料状态');
    expect(summary).toHaveTextContent('元数据资产 3');
    expect(summary).toHaveTextContent('本地文件 2');
    expect(summary).toHaveTextContent('实际占用 1.50 KB');
    expect(summary).toHaveTextContent('缺失 1 / 损坏 0 / 游离 0');
    expect(screen.getByText('仅元数据 · 本地文件缺失')).toBeInTheDocument();
    expect(screen.getByText(/显示 3 \/ 3 张/)).toBeInTheDocument();

    const detailButtons = () => screen.getAllByRole('button', { name: /^查看图片详情：/ });
    expect(detailButtons()[0]).toHaveAccessibleName('查看图片详情：未记录来源主体');
    fireEvent.change(screen.getByLabelText('图片时间排序'), { target: { value: 'oldest' } });
    expect(detailButtons()[0]).toHaveAccessibleName('查看图片详情：角色：陈强');

    fireEvent.change(screen.getByLabelText('筛选角色'), { target: { value: 'npc_2' } });
    expect(screen.getByText(/显示 1 \/ 3 张/)).toBeInTheDocument();
    expect(detailButtons()[0]).toHaveAccessibleName('查看图片详情：正文回合：turn_scene · 镜头：shot_scene');
    fireEvent.change(screen.getByLabelText('筛选正文回合'), { target: { value: 'turn_scene' } });
    fireEvent.change(screen.getByLabelText('筛选图片来源'), { target: { value: 'user-imported' } });
    expect(screen.getByText(/显示 1 \/ 3 张/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清除详细筛选' }));
    fireEvent.change(screen.getByLabelText('筛选后端与模型'), {
      target: { value: 'openai-images:model:gpt-image-test' }
    });
    expect(detailButtons()).toHaveLength(1);
    expect(detailButtons()[0]).toHaveAccessibleName('查看图片详情：角色：陈强');
    fireEvent.change(screen.getByLabelText('筛选后端与模型'), { target: { value: '__unknown-backend__' } });
    expect(detailButtons()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '清除详细筛选' }));
    fireEvent.change(screen.getByLabelText('筛选绑定状态'), { target: { value: 'unbound' } });
    expect(detailButtons()).toHaveLength(1);
    expect(detailButtons()[0]).toHaveAccessibleName('查看图片详情：未记录来源主体');

    fireEvent.click(screen.getByRole('button', { name: '清除详细筛选' }));
    fireEvent.change(screen.getByLabelText('筛选开始日期'), { target: { value: '2026-07-23' } });
    expect(detailButtons()).toHaveLength(1);
  });

  it('loads a large gallery in bounded pages instead of requesting every Blob at once', async () => {
    const populated = emptySnapshot();
    for (let index = 0; index < 125; index += 1) {
      const imageId = `image_${index.toString().padStart(3, '0')}`;
      populated.assets[imageId] = {
        imageId,
        scope: 'save',
        saveId: populated.saveId,
        source: 'user-imported',
        mimeType: 'image/png',
        width: 512,
        height: 512,
        byteLength: 4,
        contentHash: `hash_${index}`,
        blobKey: `blob_${imageId}`,
        createdAt: `2026-07-23T08:${(index % 60).toString().padStart(2, '0')}:00.000Z`
      };
    }
    const getBlob = vi.fn(async () => null);
    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repositoryWith(vi.fn(async () => populated), { getBlob })}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^查看图片详情：/ })).toHaveLength(60));
    await waitFor(() => expect(getBlob).toHaveBeenCalledTimes(60));
    expect(screen.getByText(/显示 60 \/ 125 张/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '继续加载（剩余 65 张）' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^查看图片详情：/ })).toHaveLength(120));
    expect(getBlob).toHaveBeenCalledTimes(120);

    fireEvent.click(screen.getByRole('button', { name: '继续加载（剩余 5 张）' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^查看图片详情：/ })).toHaveLength(125));
    expect(getBlob).toHaveBeenCalledTimes(125);
    expect(screen.queryByRole('button', { name: /^继续加载/ })).not.toBeInTheDocument();
  });

  it('distinguishes a corrupt local file from a metadata-only missing file', async () => {
    const populated = emptySnapshot();
    populated.assets.image_corrupt = {
      imageId: 'image_corrupt',
      scope: 'save',
      saveId: populated.saveId,
      source: 'user-imported',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      byteLength: 4,
      contentHash: 'corrupt-hash',
      blobKey: 'blob_corrupt',
      createdAt: '2026-07-23T08:00:00.000Z'
    };
    const repository = repositoryWith(vi.fn(async () => populated), {
      getBlob: vi.fn(async () => Promise.reject(new Error('corrupt'))),
      getStorageSummary: vi.fn(async () => ({
        saveId: populated.saveId,
        metadataAssetCount: 1,
        storedBlobCount: 1,
        storedBytes: 0,
        missingBlobCount: 0,
        missingImageIds: [],
        corruptBlobCount: 1,
        corruptImageIds: ['image_corrupt'],
        orphanBlobCount: 0
      }))
    });
    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repository}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('仅元数据 · 本地文件损坏')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '未记录来源主体（图片损坏）' })).toHaveTextContent('图片损坏');
    expect(repository.getBlob).not.toHaveBeenCalled();
    expect(screen.getByLabelText('图片资料状态')).toHaveTextContent('缺失 0 / 损坏 1 / 游离 0');
    fireEvent.click(screen.getByRole('button', { name: '查看图片详情：未记录来源主体' }));
    expect(screen.getByText('损坏或与元数据不一致；当前只保留元数据')).toBeInTheDocument();
  });

  it('keeps storage maintenance manual and requires a second confirmation before orphan cleanup', async () => {
    const populated = emptySnapshot();
    populated.assets.image_missing = {
      imageId: 'image_missing',
      scope: 'save',
      saveId: populated.saveId,
      source: 'generated',
      mimeType: 'image/png',
      width: 768,
      height: 1024,
      byteLength: 8,
      contentHash: 'a'.repeat(64),
      blobKey: 'blob_missing',
      createdAt: '2026-07-23T08:00:00.000Z'
    };
    const summary = {
      saveId: populated.saveId,
      metadataAssetCount: 1,
      storedBlobCount: 1,
      storedBytes: 4,
      missingBlobCount: 1,
      missingImageIds: ['image_missing'],
      corruptBlobCount: 0,
      corruptImageIds: [],
      orphanBlobCount: 1
    };
    const report = {
      summary,
      checkedAt: '2026-07-24T12:00:00.000Z',
      deepCheckedBlobCount: 0,
      issues: [{
        kind: 'missing' as const,
        reason: 'blob-missing' as const,
        imageId: 'image_missing',
        blobKey: 'blob_missing',
        byteLength: 0
      }, {
        kind: 'orphan' as const,
        reason: 'unreferenced-blob' as const,
        imageId: 'image_orphan',
        blobKey: 'blob_orphan',
        byteLength: 4
      }]
    };
    const inspectStorageIntegrity = vi.fn(async (_saveId, options) => {
      options?.onProgress?.({ checkedBlobCount: 0, totalBlobCount: 0 });
      return report;
    }) as VisualRepository['inspectStorageIntegrity'];
    const cleanupStorageIssues = vi.fn(async () => ({
      removedBlobCount: 1,
      removedBytes: 4,
      affectedImageIds: ['image_orphan']
    }));
    const repository = repositoryWith(vi.fn(async () => populated), {
      getStorageSummary: vi.fn(async () => summary),
      inspectStorageIntegrity,
      cleanupStorageIssues
    });
    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repository}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const openButton = await screen.findByRole('button', { name: '打开存储维护' });
    expect(inspectStorageIntegrity).not.toHaveBeenCalled();
    fireEvent.click(openButton);
    const maintenance = screen.getByLabelText('图片存储维护');
    expect(within(maintenance).getByText(/metadata-only 存档/)).toBeInTheDocument();
    expect(inspectStorageIntegrity).not.toHaveBeenCalled();

    fireEvent.click(within(maintenance).getByRole('button', { name: '深度检查本地图片' }));
    expect(await within(maintenance).findByText('缺图与损坏文件恢复')).toBeInTheDocument();
    expect(inspectStorageIntegrity).toHaveBeenCalledWith(populated.saveId, expect.objectContaining({
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function)
    }));
    expect(cleanupStorageIssues).not.toHaveBeenCalled();

    fireEvent.click(within(maintenance).getByRole('button', { name: '预览清理游离文件' }));
    expect(within(maintenance).getByText('确认只删除本次检查列出的游离文件？')).toBeInTheDocument();
    expect(cleanupStorageIssues).not.toHaveBeenCalled();
    fireEvent.click(within(maintenance).getByRole('button', { name: '确认清理游离文件' }));
    await waitFor(() => expect(cleanupStorageIssues).toHaveBeenCalledWith(
      populated.saveId,
      [expect.objectContaining({ blobKey: 'blob_orphan', kind: 'orphan' })]
    ));
  });

  it('never overwrites a mismatched recovery file and requires explicit import as a new asset', async () => {
    const populated = emptySnapshot();
    const sourceAsset = {
      imageId: 'image_missing_actor',
      scope: 'save' as const,
      saveId: populated.saveId,
      source: 'generated' as const,
      originSubject: {
        type: 'actor' as const,
        saveId: populated.saveId,
        actorId: 'actor_mei'
      },
      originPurpose: 'half-body-medium' as const,
      mimeType: 'image/png' as const,
      width: 768,
      height: 1024,
      byteLength: 8,
      contentHash: 'a'.repeat(64),
      blobKey: 'blob_missing_actor',
      createdAt: '2026-07-23T08:00:00.000Z'
    };
    populated.assets[sourceAsset.imageId] = sourceAsset;
    const summary = {
      saveId: populated.saveId,
      metadataAssetCount: 1,
      storedBlobCount: 0,
      storedBytes: 0,
      missingBlobCount: 1,
      missingImageIds: [sourceAsset.imageId],
      corruptBlobCount: 0,
      corruptImageIds: [],
      orphanBlobCount: 0
    };
    const report = {
      summary,
      checkedAt: '2026-07-24T12:00:00.000Z',
      deepCheckedBlobCount: 0,
      issues: [{
        kind: 'missing' as const,
        reason: 'blob-missing' as const,
        imageId: sourceAsset.imageId,
        blobKey: sourceAsset.blobKey,
        byteLength: 0
      }]
    };
    const restoreAssetBlob = vi.fn(async () => {
      throw new VisualAssetBlobMismatchError(
        sourceAsset.imageId,
        sourceAsset,
        { ...sourceAsset, byteLength: 9, contentHash: 'b'.repeat(64) }
      );
    });
    const importedAsset = {
      ...sourceAsset,
      imageId: 'image_new_import',
      blobKey: 'blob_new_import',
      source: 'user-imported' as const,
      byteLength: 9,
      contentHash: 'b'.repeat(64)
    };
    const importUserImage = vi.fn(async () => ({
      asset: importedAsset,
      created: true
    }));
    const repository = repositoryWith(vi.fn(async () => populated), {
      getStorageSummary: vi.fn(async () => summary),
      inspectStorageIntegrity: vi.fn(async () => report),
      restoreAssetBlob,
      importUserImage
    });
    const previousCreateImageBitmap = globalThis.createImageBitmap;
    globalThis.createImageBitmap = vi.fn(async () => ({
      width: 768,
      height: 1024,
      close: vi.fn()
    })) as unknown as typeof createImageBitmap;

    try {
      render(
        <ImageGalleryModal
          visualSaveId={populated.saveId}
          repository={repository}
          onOpenSettings={vi.fn()}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(await screen.findByRole('button', { name: '打开存储维护' }));
      const maintenance = screen.getByLabelText('图片存储维护');
      fireEvent.click(within(maintenance).getByRole('button', { name: '深度检查本地图片' }));
      await within(maintenance).findByText('缺图与损坏文件恢复');
      const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], 'replacement.png', {
        type: 'image/png'
      });
      const fileInput = within(maintenance).getByLabelText('选择原文件恢复');
      expect(fileInput).toBeInstanceOf(HTMLInputElement);
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(await within(maintenance).findByText('所选文件不是原图片')).toBeInTheDocument();
      expect(importUserImage).not.toHaveBeenCalled();
      fireEvent.click(within(maintenance).getByRole('button', { name: '仅作为未绑定新图导入' }));
      await waitFor(() => expect(importUserImage).toHaveBeenCalledWith(expect.objectContaining({
        saveId: populated.saveId,
        originSubject: sourceAsset.originSubject,
        originPurpose: sourceAsset.originPurpose,
        bindAsCurrent: false
      })));
      await screen.findByText('不一致文件已作为未绑定新图片导入；原资产元数据与绑定未改动。');
      expect(restoreAssetBlob).toHaveBeenCalledWith(
        populated.saveId,
        sourceAsset.imageId,
        expect.objectContaining({ blob: file, width: 768, height: 1024 })
      );
    } finally {
      globalThis.createImageBitmap = previousCreateImageBitmap;
    }
  });

  it('shows traceable automatic task status and exposes cancel and gated retry actions', async () => {
    const records = [{
      triggerId: 'trigger_running', saveId: 'save_gallery', kind: 'character-created' as const,
      subjectId: 'npc_1', status: 'running' as const, profileId: 'profile_1',
      executionFingerprints: [], taskIds: ['task_1'], retryCount: 0, maxRetries: 0,
      safeMessage: '正在生成人物图。', createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    }, {
      triggerId: 'trigger_blocked', saveId: 'save_gallery', kind: 'story-turn-completed' as const,
      subjectId: 'turn_1', status: 'blocked' as const,
      sourceStoryTextHash: 'a'.repeat(64),
      executionFingerprints: [], taskIds: [], retryCount: 0, maxRetries: 1,
      blockerCode: 'runtime-evidence-missing', safeMessage: '缺少精确真实证据。',
      createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    }, {
      triggerId: 'trigger_succeeded', saveId: 'save_gallery', kind: 'story-turn-completed' as const,
      subjectId: 'turn_1', status: 'succeeded' as const,
      sourceStoryTextHash: 'b'.repeat(64),
      executionFingerprints: [], taskIds: ['task_2'], retryCount: 0, maxRetries: 0,
      safeMessage: '自动场景图已生成。', createdAt: '2026-07-23T00:01:00.000Z', updatedAt: '2026-07-23T00:01:00.000Z'
    }];
    const listForSave = vi.fn(async () => records);
    const onCancelAutomation = vi.fn();
    const onRetryAutomation = vi.fn(async () => undefined);
    render(
      <ImageGalleryModal
        visualSaveId="save_gallery"
        repository={repositoryWith(vi.fn(async () => emptySnapshot()))}
        actors={{ npc_1: { actorId: 'npc_1', name: '阿梅' } as never }}
        automationRuntimeRepository={{ listForSave }}
        onCancelAutomation={onCancelAutomation}
        onRetryAutomation={onRetryAutomation}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByRole('heading', { name: '自动任务' })).toBeInTheDocument();
    expect(screen.getByText('人物 · 阿梅')).toBeInTheDocument();
    expect(screen.getByText('场景回合 · turn_1 · 正文版本 aaaaaaaa')).toBeInTheDocument();
    expect(screen.getByText('场景回合 · turn_1 · 正文版本 bbbbbbbb')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancelAutomation).toHaveBeenCalledWith('trigger_running');
    fireEvent.click(screen.getByRole('button', { name: '重新检查并重试' }));
    await waitFor(() => expect(onRetryAutomation).toHaveBeenCalledWith('trigger_blocked'));
  });

  it('resolves legacy visual actor bindings through the authoritative actor alias map', async () => {
    const populated = emptySnapshot();
    populated.assets.image_legacy_avatar = {
      imageId: 'image_legacy_avatar',
      scope: 'save',
      saveId: populated.saveId,
      source: 'user-imported',
      originSubject: { type: 'actor', saveId: populated.saveId, actorId: 'npc_temporary' },
      originPurpose: 'avatar-close-up',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      byteLength: 5,
      contentHash: 'legacy-hash',
      blobKey: 'blob_legacy_avatar',
      createdAt: '2026-07-23T00:00:00.000Z'
    };
    const bindingId = createVisualBindingId(
      populated.saveId,
      { type: 'actor', saveId: populated.saveId, actorId: 'npc_temporary' },
      'avatar-close-up'
    );
    populated.bindings[bindingId] = {
      bindingId,
      saveId: populated.saveId,
      subject: { type: 'actor', saveId: populated.saveId, actorId: 'npc_temporary' },
      purpose: 'avatar-close-up',
      imageId: 'image_legacy_avatar',
      updatedAt: '2026-07-23T00:00:00.000Z'
    };

    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repositoryWith(vi.fn(async () => populated), {
          getBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' }))
        })}
        actors={{ npc_canonical: { actorId: 'npc_canonical', name: '何文展' } as never }}
        actorIdAliases={{ npc_temporary: 'npc_canonical' }}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: '查看图片详情：角色：何文展' })).toBeInTheDocument();
    expect(screen.queryByText('npc_temporary')).not.toBeInTheDocument();
  });

  it('shows whether a generated scene used anchor-default clothing or a scene-specific override', async () => {
    const populated = emptySnapshot();
    const task = createPersistingTask('task_scene');
    task.saveId = populated.saveId;
    task.intent = {
      type: 'scene-image',
      intentId: task.intent.intentId,
      saveId: populated.saveId,
      turnId: 'turn_scene',
      scenePlanId: 'plan_scene',
      shotId: 'shot_scene',
      participantAnchorSnapshots: [{
        actorId: 'npc_1',
        anchorText: TEST_ANCHOR,
        sceneSpecificAppearance: '脱下夹克，只穿湿透的白衬衣'
      }],
      oneTimeInstruction: '',
      referenceImageIds: [],
      createdAt: task.intent.createdAt
    };
    populated.tasks[task.taskId] = task;
    populated.assets.image_scene = {
      imageId: 'image_scene',
      scope: 'save',
      saveId: populated.saveId,
      source: 'generated',
      originSubject: {
        type: 'scene-shot',
        saveId: populated.saveId,
        turnId: 'turn_scene',
        scenePlanId: 'plan_scene',
        shotId: 'shot_scene'
      },
      originPurpose: 'turn-scene',
      mimeType: 'image/png',
      width: 1024,
      height: 576,
      byteLength: 4,
      contentHash: 'scene-hash',
      blobKey: 'blob_scene',
      sourceTaskId: task.taskId,
      submittedRequest: task.submittedRequest,
      createdAt: '2026-07-23T08:00:00.000Z'
    };

    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repositoryWith(vi.fn(async () => populated))}
        actors={{ npc_1: { actorId: 'npc_1', name: '陈美玲' } as never }}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', {
      name: '查看图片详情：正文回合：turn_scene · 镜头：shot_scene'
    }));
    expect(screen.getByRole('complementary', { name: '图片详情' }))
      .toHaveTextContent('人物装扮来源npc_1：本镜头覆盖（脱下夹克，只穿湿透的白衬衣）');
  });

  it('audits, copies, downloads, rebinds, unbinds, and only then deletes an image with explicit confirmation', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:gallery-download') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const populated = emptySnapshot();
    const task = createPersistingTask('task_avatar', 'avatar-close-up');
    task.saveId = populated.saveId;
    task.intent.saveId = populated.saveId;
    if (task.intent.type !== 'character-image') throw new Error('人物夹具类型错误');
    task.intent.appearanceSource = 'additional-requirement-override';
    task.intent.anchorSourceImageIds = ['image_anchor_source'];
    task.intent.referenceImageIds = [];
    task.submittedRequest = {
      ...task.submittedRequest!,
      characterComposition: { viewAngle: 'three-quarter-right', cameraElevation: 'slight-low' },
      semanticPromptSegments: [{
        segmentId: 'subject:character',
        kind: 'subject',
        priority: 50,
        positive: 'semantic character portrait',
        negative: 'semantic blur',
        required: true
      }],
      formattedPromptSegments: [{
        segmentId: 'subject:character',
        positive: 'formatted character portrait',
        negative: 'formatted blur'
      }],
      transportPrompt: 'transport character portrait',
      transportNegativePrompt: 'transport blur',
      transportNegativeResolution: 'separate',
      userEdited: true
    };
    populated.tasks[task.taskId] = task;
    populated.assets.image_avatar = {
      imageId: 'image_avatar',
      scope: 'save',
      saveId: populated.saveId,
      source: 'generated',
      originSubject: { type: 'actor', saveId: populated.saveId, actorId: 'npc_1' },
      originPurpose: 'avatar-close-up',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      byteLength: 4,
      contentHash: 'hash',
      blobKey: 'blob_avatar',
      sourceTaskId: task.taskId,
      submittedRequest: task.submittedRequest,
      createdAt: '2026-07-23T00:00:00.000Z'
    };
    const bindingId = createVisualBindingId(
      populated.saveId,
      { type: 'actor', saveId: populated.saveId, actorId: 'npc_1' },
      'avatar-close-up'
    );
    populated.bindings[bindingId] = {
      bindingId,
      saveId: populated.saveId,
      subject: { type: 'actor', saveId: populated.saveId, actorId: 'npc_1' },
      purpose: 'avatar-close-up',
      imageId: 'image_avatar',
      updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const unbound = structuredClone(populated);
    unbound.bindings = {};
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce(populated)
      .mockResolvedValueOnce(unbound)
      .mockResolvedValueOnce(populated)
      .mockResolvedValueOnce(emptySnapshot());
    const deleteAsset = vi.fn(async () => undefined);
    const bindAsset = vi.fn(async () => undefined);
    const unbindAsset = vi.fn(async () => undefined);
    const onRepositoryChanged = vi.fn();
    const repository = repositoryWith(loadSnapshot, {
      getBlob: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
      getAssetDeletionImpact: vi.fn(async () => ({ imageId: 'image_avatar', bindingIds: [bindingId] })),
      deleteAsset,
      bindAsset,
      unbindAsset
    });
    render(
      <ImageGalleryModal
        visualSaveId="save_gallery"
        repository={repository}
        actors={{ npc_1: { actorId: 'npc_1', name: '陈强' } as never }}
        onRepositoryChanged={onRepositoryChanged}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: '查看图片详情：角色：陈强' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '人物 1' }));
    fireEvent.click(screen.getByRole('button', { name: '查看图片详情：角色：陈强' }));
    expect(screen.getByText('陈强 · 头像特写（CU）')).toBeInTheDocument();
    expect(within(screen.getByRole('complementary', { name: '图片详情' }))
      .getByText('openai-images · 模型：gpt-image-test')).toBeInTheDocument();
    expect(screen.getByText('3:4')).toBeInTheDocument();
    expect(screen.getByText('右前方四分之三视角 · 轻微仰视')).toBeInTheDocument();
    expect(screen.getByText('builtin-dialect-general-en')).toBeInTheDocument();
    expect(screen.getByText('独立负向字段')).toBeInTheDocument();
    expect(screen.getByText('是')).toBeInTheDocument();
    expect(screen.getByText('image_anchor_source（仅锚点来源，未自动发送）')).toBeInTheDocument();
    expect(screen.getByText('额外要求覆盖锚点默认服装')).toBeInTheDocument();
    expect(screen.getByText('character portrait')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看三层提示词快照'));
    expect(screen.getByText(/semantic character portrait/)).toBeInTheDocument();
    expect(screen.getByText(/formatted character portrait/)).toBeInTheDocument();
    expect(screen.getByText('transport character portrait')).toBeInTheDocument();
    expect(screen.getByText('正向与负向分字段传输')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看脱敏参数'));
    expect(screen.getByText(/"quality": "medium"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '复制最终提示词' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('【最终正向提示词】')));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('character portrait'));
    fireEvent.click(screen.getByRole('button', { name: '下载图片' }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: '查看原图' }));
    expect(await screen.findByRole('dialog', { name: '原图预览：角色：陈强' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭原图' }));

    fireEvent.click(screen.getByRole('button', { name: '解除该用途绑定' }));
    await waitFor(() => expect(unbindAsset).toHaveBeenCalledWith('save_gallery', bindingId));
    expect(await screen.findByRole('button', { name: '设为该用途当前图' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '设为该用途当前图' }));
    await waitFor(() => expect(bindAsset).toHaveBeenCalledWith(expect.objectContaining({
      saveId: 'save_gallery',
      imageId: 'image_avatar',
      purpose: 'avatar-close-up'
    })));
    expect(await screen.findByRole('button', { name: '解除该用途绑定' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除这张图片' }));
    expect(await screen.findByText('这张图片正在 1 处使用。')).toBeInTheDocument();
    expect(screen.getAllByText('陈强 · 头像特写（CU）')).toHaveLength(2);
    expect(deleteAsset).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '解除绑定并确认删除' }));
    await waitFor(() => expect(deleteAsset).toHaveBeenCalledWith('save_gallery', 'image_avatar', true));
    expect(onRepositoryChanged).toHaveBeenCalledTimes(3);
  });

  it('removes and restores a historical SceneShot through the same gallery without deleting story text', async () => {
    const populated = emptySnapshot();
    const subject = {
      type: 'scene-shot' as const,
      saveId: populated.saveId,
      turnId: 'turn_scene',
      scenePlanId: 'plan_scene',
      shotId: 'shot_rain'
    };
    populated.assets.image_scene = {
      imageId: 'image_scene',
      scope: 'save',
      saveId: populated.saveId,
      source: 'user-imported',
      originSubject: subject,
      originPurpose: 'turn-scene',
      mimeType: 'image/png',
      width: 1024,
      height: 768,
      byteLength: 4,
      contentHash: 'scene-hash',
      blobKey: 'blob_scene',
      createdAt: '2026-07-23T00:00:00.000Z'
    };
    const bindingId = createVisualBindingId(populated.saveId, subject, 'turn-scene', subject.shotId);
    populated.bindings[bindingId] = {
      bindingId,
      saveId: populated.saveId,
      subject,
      purpose: 'turn-scene',
      variantKey: subject.shotId,
      imageId: 'image_scene',
      updatedAt: '2026-07-23T00:00:00.000Z'
    };
    populated.storySceneDisplayStates.turn_scene = {
      saveId: populated.saveId,
      turnId: 'turn_scene',
      activeShotIds: ['shot_rain'],
      updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const inactive = structuredClone(populated);
    inactive.bindings = {};
    inactive.storySceneDisplayStates.turn_scene.activeShotIds = [];
    const loadSnapshot = vi.fn()
      .mockResolvedValueOnce(populated)
      .mockResolvedValueOnce(inactive)
      .mockResolvedValueOnce(populated);
    const unbindAsset = vi.fn(async () => undefined);
    const restoreSceneAssetToStory = vi.fn(async () => undefined);
    const onRepositoryChanged = vi.fn();
    render(
      <ImageGalleryModal
        visualSaveId={populated.saveId}
        repository={repositoryWith(loadSnapshot, {
          getBlob: vi.fn(async () => new Blob(['scene'], { type: 'image/png' })),
          getAssetDeletionImpact: vi.fn(async () => ({ imageId: 'image_scene', bindingIds: [bindingId] })),
          unbindAsset,
          restoreSceneAssetToStory
        })}
        onRepositoryChanged={onRepositoryChanged}
        onOpenSettings={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', {
      name: '查看图片详情：正文回合：turn_scene · 镜头：shot_rain'
    }));
    expect(screen.getByText('该 SceneShot 正在正文显示。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '从正文移除此镜头' }));
    await waitFor(() => expect(unbindAsset).toHaveBeenCalledWith(populated.saveId, bindingId));
    expect(await screen.findByText('该 SceneShot 当前不在正文显示集合中。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '恢复此镜头到正文' }));
    await waitFor(() => expect(restoreSceneAssetToStory).toHaveBeenCalledWith(
      populated.saveId,
      'image_scene',
      expect.any(String)
    ));
    expect(await screen.findByText('该 SceneShot 正在正文显示。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除这张图片' }));
    const deleteImpact = await screen.findByRole('alert');
    expect(within(deleteImpact).getByText('turn_scene / shot_rain · 正文场景图')).toBeInTheDocument();
    expect(within(deleteImpact).getByText(/正文不会被删除/)).toBeInTheDocument();
    fireEvent.click(within(deleteImpact).getByRole('button', { name: '取消' }));
    expect(onRepositoryChanged).toHaveBeenCalledTimes(2);
  });
});
