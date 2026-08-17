import { useEffect, useMemo, useState } from 'react';
import {
  CHARACTER_CAMERA_ELEVATION_LABELS,
  CHARACTER_VISUAL_PURPOSE_LABELS,
  CHARACTER_VISUAL_PURPOSES,
  CHARACTER_VIEW_ANGLE_LABELS,
  DEFAULT_CHARACTER_COMPOSITION,
  type CharacterVisualPurpose
} from '../../domain/imageGeneration/promptConversion';
import type { Actor } from '../../domain/runtime/types';
import type {
  ImageGenerationTask,
  SubmittedImageRequestSnapshot,
  VisualAsset,
  VisualBinding,
  VisualRepository,
  VisualRepositorySnapshot,
  VisualStorageSummary
} from '../../domain/imageGeneration/visualRepository';
import { createVisualBindingId } from '../../domain/imageGeneration/visualRepository';
import { VisualAssetImage } from './VisualAssetImage';
import type {
  ImageAutomationRuntimeRepository,
  ImageAutomationTriggerRecord
} from '../../domain/imageGeneration/automationRuntime';
import { createLocalVisualId, readUserImageDimensions } from '../../domain/imageGeneration/userImageImport';
import type {
  ImageCredentialRepository,
  ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import type { ImageGenerationPresetRepository } from '../../domain/imageGeneration/generationPresets';
import type { CharacterImageExecutor } from '../../domain/imageGeneration/characterVisualWorkflow';
import { ImagePromptReusePanel } from './ImagePromptReusePanel';
import { VisualAssetOriginalDialog } from './VisualAssetOriginalDialog';
import { ImageStorageMaintenancePanel } from './ImageStorageMaintenancePanel';

interface ImageGalleryModalProps {
  visualSaveId?: string;
  repository: VisualRepository;
  actors?: Record<string, Actor>;
  actorIdAliases?: Record<string, string>;
  generationEnabled?: boolean;
  automationRuntimeRepository?: Pick<ImageAutomationRuntimeRepository, 'listForSave'>;
  onRetryAutomation?: (triggerId: string) => Promise<void>;
  onCancelAutomation?: (triggerId: string) => void;
  profileRepository?: ImageProfileRepository;
  credentialRepository?: ImageCredentialRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  createImageExecutor?: () => CharacterImageExecutor;
  onRepositoryChanged?: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

type GalleryLoadState =
  | { status: 'loading'; snapshot: null }
  | { status: 'ready'; snapshot: VisualRepositorySnapshot | null }
  | { status: 'failed'; snapshot: null };

const sourceLabels = {
  generated: '文生图生成',
  'user-imported': '玩家导入',
  'preset-pack': '预制素材',
  builtin: '游戏内置'
} as const;

type GalleryFilter = 'all' | 'character' | 'scene' | 'unbound';
type GalleryBindingFilter = 'all' | 'bound' | 'unbound';
type GallerySort = 'newest' | 'oldest';
type GalleryStorageState =
  | { status: 'loading'; summary: null }
  | { status: 'ready'; summary: VisualStorageSummary | null }
  | { status: 'failed'; summary: null };

const UNKNOWN_BACKEND_KEY = '__unknown-backend__';
const GALLERY_PAGE_SIZE = 60;

const purposeLabels: Record<string, string> = {
  ...CHARACTER_VISUAL_PURPOSE_LABELS,
  'turn-scene': '正文场景图',
  'scene-preset': '预制场景图'
};

function assetKind(asset: VisualAsset): 'character' | 'scene' | 'other' {
  if (asset.originSubject?.type === 'actor' || CHARACTER_VISUAL_PURPOSES.includes(asset.originPurpose as CharacterVisualPurpose)) {
    return 'character';
  }
  if (
    asset.originSubject?.type === 'scene-shot' ||
    asset.originSubject?.type === 'story-turn' ||
    asset.originPurpose === 'turn-scene' ||
    asset.originPurpose === 'scene-preset'
  ) {
    return 'scene';
  }
  return 'other';
}

function actorName(actors: Record<string, Actor> | undefined, actorId: string): string {
  return actors?.[actorId]?.name ?? `失效人物引用（${actorId.slice(-12)}）`;
}

function automationSubjectLabel(
  record: ImageAutomationTriggerRecord,
  actors?: Record<string, Actor>
): string {
  if (record.kind === 'character-created') {
    return `人物 · ${actorName(actors, record.subjectId)}`;
  }
  const storyVersion = record.sourceStoryTextHash?.slice(0, 8);
  return `场景回合 · ${record.subjectId}${storyVersion ? ` · 正文版本 ${storyVersion}` : ''}`;
}

function subjectLabel(asset: VisualAsset, actors?: Record<string, Actor>): string {
  const subject = asset.originSubject;
  if (!subject) return '未记录来源主体';
  if (subject.type === 'actor') return `角色：${actorName(actors, subject.actorId)}`;
  if (subject.type === 'story-turn') return `正文回合：${subject.turnId}`;
  return `正文回合：${subject.turnId} · 镜头：${subject.shotId}`;
}

function bindingLabel(binding: VisualBinding, actors?: Record<string, Actor>): string {
  const purpose = purposeLabels[binding.purpose] ?? binding.purpose;
  if (binding.subject.type === 'actor') return `${actorName(actors, binding.subject.actorId)} · ${purpose}`;
  if (binding.subject.type === 'story-turn') return `${binding.subject.turnId} · ${purpose}`;
  return `${binding.subject.turnId} / ${binding.subject.shotId} · ${purpose}`;
}

const negativePromptModeLabels = {
  separate: '独立负向字段',
  'merged-into-positive': '合并进正向提示词',
  unsupported: '当前后端不支持',
  'workflow-controlled': '由 ComfyUI 工作流控制'
} as const;

const transportNegativeResolutionLabels = {
  separate: '正向与负向分字段传输',
  merged: '负向要求已合并进正向字段',
  none: '没有负向传输内容',
  'workflow-controlled': '负向内容由 ComfyUI 工作流控制'
} as const;

function executionTargetLabel(request: SubmittedImageRequestSnapshot): string {
  return request.executionTarget.kind === 'model'
    ? `模型：${request.executionTarget.modelId}`
    : `工作流：${request.executionTarget.workflowTemplateId}（修订 ${request.executionTarget.workflowRevision}）`;
}

function executionTargetKey(request: SubmittedImageRequestSnapshot): string {
  return request.executionTarget.kind === 'model'
    ? `${request.providerType}:model:${request.executionTarget.modelId}`
    : `${request.providerType}:workflow:${request.executionTarget.workflowTemplateId}:${request.executionTarget.workflowRevision}`;
}

function requestForAsset(
  snapshot: VisualRepositorySnapshot | null,
  asset: VisualAsset
): SubmittedImageRequestSnapshot | undefined {
  return (asset.sourceTaskId ? snapshot?.tasks[asset.sourceTaskId]?.submittedRequest : undefined) ?? asset.submittedRequest;
}

function actorIdsForAsset(snapshot: VisualRepositorySnapshot | null, asset: VisualAsset): string[] {
  const actorIds = new Set<string>();
  const subject = asset.originSubject;
  if (subject?.type === 'actor') actorIds.add(subject.actorId);
  if (subject?.type === 'scene-shot') {
    const plan = snapshot?.scenePlans[subject.scenePlanId];
    const shot = plan?.shots.find((item) => item.shotId === subject.shotId);
    shot?.knownActorIds.forEach((actorId) => actorIds.add(actorId));
    shot?.actorVisualStates.forEach((state) => actorIds.add(state.actorId));
  }
  return Array.from(actorIds);
}

function turnIdForAsset(asset: VisualAsset): string | undefined {
  if (asset.originSubject?.type === 'story-turn' || asset.originSubject?.type === 'scene-shot') {
    return asset.originSubject.turnId;
  }
  return undefined;
}

function formatStoredBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function characterCompositionLabel(request: SubmittedImageRequestSnapshot): string {
  const composition = request.characterComposition ?? DEFAULT_CHARACTER_COMPOSITION;
  return `${CHARACTER_VIEW_ANGLE_LABELS[composition.viewAngle]} · ${CHARACTER_CAMERA_ELEVATION_LABELS[composition.cameraElevation]}`;
}

function PromptTraceDetails({ request }: { request: SubmittedImageRequestSnapshot }) {
  const hasSemanticTrace = Boolean(request.semanticPromptSegments?.length);
  const hasFormattedTrace = Boolean(request.formattedPromptSegments?.length);
  const hasTransportTrace = Boolean(request.transportPrompt && request.transportNegativeResolution);
  return (
    <details className="image-gallery-prompt-trace">
      <summary>查看三层提示词快照</summary>
      <p>
        语义段与模型格式段来自确认前的结构化预览；实际传输层记录玩家最终编辑后交给图片后端的内容。
      </p>
      <section>
        <h4>1. 供应商无关语义段</h4>
        {hasSemanticTrace
          ? <pre>{JSON.stringify(request.semanticPromptSegments, null, 2)}</pre>
          : <p>旧资产未保存结构化语义段。</p>}
      </section>
      <section>
        <h4>2. 模型格式转换段</h4>
        {hasFormattedTrace
          ? <pre>{JSON.stringify(request.formattedPromptSegments, null, 2)}</pre>
          : <p>旧资产未保存模型格式转换段。</p>}
      </section>
      <section>
        <h4>3. 实际传输提示词</h4>
        {hasTransportTrace ? (
          <>
            <p>{transportNegativeResolutionLabels[request.transportNegativeResolution!]}</p>
            <h5>正向传输字段</h5>
            <pre>{request.transportPrompt}</pre>
            <h5>负向传输字段</h5>
            <pre>{request.transportNegativePrompt || '无独立负向字段'}</pre>
          </>
        ) : (
          <p>旧资产未保存实际传输快照；上方“最终提示词”仍可查看和复制，但不能据此断言当时的后端字段形态。</p>
        )}
      </section>
    </details>
  );
}

function visibleGenerationParameters(request: SubmittedImageRequestSnapshot): string {
  const { providerType: _providerType, ...parameters } = request.generationParameters;
  return JSON.stringify(parameters, null, 2);
}

function referenceImageIds(task: ImageGenerationTask | undefined): string[] {
  return task?.intent.referenceImageIds ?? [];
}

function anchorSourceImageIds(task: ImageGenerationTask | undefined): string[] {
  return task?.intent.type === 'character-image'
    ? task.intent.anchorSourceImageIds ?? []
    : [];
}

function characterAppearanceSource(task: ImageGenerationTask | undefined): string {
  if (task?.intent.type !== 'character-image') return '不适用';
  if (task.intent.appearanceSource === 'additional-requirement-override') {
    return '额外要求覆盖锚点默认服装';
  }
  if (task.intent.appearanceSource === 'anchor-default') return '锚点默认服装';
  return '旧转换指令：装扮混合在人物基础段';
}

function additionalRequirements(task: ImageGenerationTask | undefined): string[] {
  if (!task) return [];
  if (task.intent.type === 'character-image') {
    return task.intent.additionalRequirementText.trim() ? [task.intent.additionalRequirementText] : [];
  }
  return [
    ...task.intent.participantAnchorSnapshots.map((item) => item.persistentAdditionalRequirementText),
    task.intent.oneTimeInstruction
  ].filter((value): value is string => Boolean(value?.trim()));
}

function sceneAppearanceSources(task: ImageGenerationTask | undefined): string[] {
  if (!task || task.intent.type !== 'scene-image') return [];
  return task.intent.participantAnchorSnapshots.map((participant) => (
    participant.sceneSpecificAppearance?.trim()
      ? `${participant.actorId}：本镜头覆盖（${participant.sceneSpecificAppearance}）`
      : `${participant.actorId}：锚点默认服装`
  ));
}

function downloadExtension(mimeType: VisualAsset['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function ImageGalleryModal({
  visualSaveId,
  repository,
  actors,
  actorIdAliases,
  generationEnabled,
  automationRuntimeRepository,
  onRetryAutomation,
  onCancelAutomation,
  profileRepository,
  credentialRepository,
  generationPresetRepository,
  createImageExecutor,
  onRepositoryChanged,
  onOpenSettings,
  onClose
}: ImageGalleryModalProps) {
  const [loadState, setLoadState] = useState<GalleryLoadState>({ status: 'loading', snapshot: null });
  const [storageState, setStorageState] = useState<GalleryStorageState>({ status: 'loading', summary: null });
  const [entryNotice, setEntryNotice] = useState('');
  const [filter, setFilter] = useState<GalleryFilter>('all');
  const [actorFilter, setActorFilter] = useState('');
  const [turnFilter, setTurnFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [backendFilter, setBackendFilter] = useState('');
  const [bindingFilter, setBindingFilter] = useState<GalleryBindingFilter>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sortOrder, setSortOrder] = useState<GallerySort>('newest');
  const [selectedImageId, setSelectedImageId] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<{ imageId: string; bindingIds: string[] }>();
  const [busy, setBusy] = useState(false);
  const resolvedActors = useMemo(() => {
    if (!actors) return undefined;
    const values = { ...actors };
    const resolveAlias = (actorId: string): string => {
      const visited = new Set<string>();
      let current = actorId;
      while (actorIdAliases?.[current] && !visited.has(current)) {
        visited.add(current);
        current = actorIdAliases[current];
      }
      return current;
    };
    for (const sourceActorId of Object.keys(actorIdAliases ?? {})) {
      const canonical = actors[resolveAlias(sourceActorId)];
      if (canonical) values[sourceActorId] = canonical;
    }
    return values;
  }, [actorIdAliases, actors]);
  const [automationRecords, setAutomationRecords] = useState<ImageAutomationTriggerRecord[]>([]);
  const [importActorId, setImportActorId] = useState('');
  const [importPurpose, setImportPurpose] = useState<CharacterVisualPurpose>('half-body-medium');
  const [importAsCurrent, setImportAsCurrent] = useState(true);
  const [reuseImageId, setReuseImageId] = useState<string>();
  const [originalImageId, setOriginalImageId] = useState<string>();
  const [selectedCharacterPurpose, setSelectedCharacterPurpose] = useState<CharacterVisualPurpose>('half-body-medium');
  const [assetPage, setAssetPage] = useState({ queryKey: '', limit: GALLERY_PAGE_SIZE });
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setEntryNotice('');
    setMaintenanceOpen(false);

    if (!visualSaveId) {
      setLoadState({ status: 'ready', snapshot: null });
      setStorageState({ status: 'ready', summary: null });
      return () => {
        active = false;
      };
    }

    setLoadState({ status: 'loading', snapshot: null });
    setStorageState({ status: 'loading', summary: null });
    void repository.loadSnapshot(visualSaveId).then(
      (snapshot) => {
        if (active) setLoadState({ status: 'ready', snapshot });
      },
      () => {
        if (active) setLoadState({ status: 'failed', snapshot: null });
      }
    );
    void repository.getStorageSummary(visualSaveId).then(
      (summary) => {
        if (active) setStorageState({ status: 'ready', summary });
      },
      () => {
        if (active) setStorageState({ status: 'failed', summary: null });
      }
    );
    if (automationRuntimeRepository) {
      void automationRuntimeRepository.listForSave(visualSaveId).then((records) => {
        if (active) setAutomationRecords(records);
      }, () => {
        if (active) setAutomationRecords([]);
      });
    }

    return () => {
      active = false;
    };
  }, [automationRuntimeRepository, repository, visualSaveId]);

  const assets = useMemo(
    () => (loadState.status === 'ready' && loadState.snapshot ? Object.values(loadState.snapshot.assets) : []),
    [loadState]
  );
  const snapshot = loadState.status === 'ready' ? loadState.snapshot : null;
  const bindings = useMemo(() => snapshot ? Object.values(snapshot.bindings) : [], [snapshot]);
  const actorOptions = useMemo(() => Array.from(new Set(
    assets.flatMap((asset) => actorIdsForAsset(snapshot, asset))
  )).sort((left, right) => actorName(resolvedActors, left).localeCompare(actorName(resolvedActors, right), 'zh-CN')), [assets, resolvedActors, snapshot]);
  const turnOptions = useMemo(() => Array.from(new Set(
    assets.map(turnIdForAsset).filter((value): value is string => Boolean(value))
  )).sort((left, right) => left.localeCompare(right, 'zh-CN')), [assets]);
  const backendOptions = useMemo(() => {
    const options = new Map<string, string>();
    assets.forEach((asset) => {
      const request = requestForAsset(snapshot, asset);
      if (!request) {
        options.set(UNKNOWN_BACKEND_KEY, '未记录后端 / 模型');
        return;
      }
      options.set(executionTargetKey(request), `${request.providerType} · ${executionTargetLabel(request)}`);
    });
    return Array.from(options, ([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
  }, [assets, snapshot]);
  const boundImageIds = useMemo(() => new Set(bindings.map((binding) => binding.imageId)), [bindings]);
  const filteredAssets = useMemo(() => assets.filter((asset) => {
    const isBound = boundImageIds.has(asset.imageId);
    if (filter === 'unbound' && isBound) return false;
    if (filter !== 'all' && filter !== 'unbound' && assetKind(asset) !== filter) return false;
    if (actorFilter && !actorIdsForAsset(snapshot, asset).includes(actorFilter)) return false;
    if (turnFilter && turnIdForAsset(asset) !== turnFilter) return false;
    if (sourceFilter && asset.source !== sourceFilter) return false;
    const request = requestForAsset(snapshot, asset);
    const assetBackendKey = request ? executionTargetKey(request) : UNKNOWN_BACKEND_KEY;
    if (backendFilter && assetBackendKey !== backendFilter) return false;
    if (bindingFilter === 'bound' && !isBound) return false;
    if (bindingFilter === 'unbound' && isBound) return false;
    const createdDate = asset.createdAt.slice(0, 10);
    if (createdFrom && createdDate < createdFrom) return false;
    if (createdTo && createdDate > createdTo) return false;
    return true;
  }).sort((left, right) => {
    const timestampOrder = left.createdAt.localeCompare(right.createdAt);
    if (timestampOrder !== 0) return sortOrder === 'newest' ? -timestampOrder : timestampOrder;
    return left.imageId.localeCompare(right.imageId);
  }), [
    actorFilter,
    assets,
    backendFilter,
    bindingFilter,
    boundImageIds,
    createdFrom,
    createdTo,
    filter,
    snapshot,
    sortOrder,
    sourceFilter,
    turnFilter
  ]);
  const galleryQueryKey = [
    filter,
    actorFilter,
    turnFilter,
    sourceFilter,
    backendFilter,
    bindingFilter,
    createdFrom,
    createdTo,
    sortOrder
  ].join('\u001f');
  const visibleAssetLimit = assetPage.queryKey === galleryQueryKey
    ? assetPage.limit
    : GALLERY_PAGE_SIZE;
  const visibleAssets = filteredAssets.slice(0, visibleAssetLimit);
  const storageSummary = storageState.status === 'ready' ? storageState.summary : null;
  const missingImageIds = useMemo(
    () => new Set(storageSummary?.missingImageIds ?? []),
    [storageSummary]
  );
  const corruptImageIds = useMemo(
    () => new Set(storageSummary?.corruptImageIds ?? []),
    [storageSummary]
  );
  const hasDetailedFilters = Boolean(
    actorFilter ||
    turnFilter ||
    sourceFilter ||
    backendFilter ||
    bindingFilter !== 'all' ||
    createdFrom ||
    createdTo
  );
  const selectedAsset = selectedImageId ? snapshot?.assets[selectedImageId] : undefined;
  const selectedBindings = selectedAsset
    ? bindings.filter((binding) => binding.imageId === selectedAsset.imageId)
    : [];
  const selectedTask = selectedAsset?.sourceTaskId ? snapshot?.tasks[selectedAsset.sourceTaskId] : undefined;
  const selectedRequest = selectedTask?.submittedRequest ?? selectedAsset?.submittedRequest;
  const selectedCharacterBindingId = selectedAsset && visualSaveId && selectedAsset.originSubject?.type === 'actor'
    ? createVisualBindingId(
      visualSaveId,
      selectedAsset.originSubject,
      selectedCharacterPurpose
    )
    : undefined;
  const selectedCharacterBinding = selectedCharacterBindingId
    ? bindings.find((binding) => binding.bindingId === selectedCharacterBindingId)
    : undefined;
  const selectedSceneSubject = selectedAsset?.originSubject?.type === 'scene-shot'
    ? selectedAsset.originSubject
    : undefined;
  const selectedSceneBindingId = selectedAsset && visualSaveId && selectedSceneSubject
    ? createVisualBindingId(visualSaveId, selectedSceneSubject, 'turn-scene', selectedSceneSubject.shotId)
    : undefined;
  const selectedSceneBinding = selectedSceneBindingId
    ? bindings.find((binding) => binding.bindingId === selectedSceneBindingId)
    : undefined;
  const selectedSceneIsVisible = Boolean(
    selectedSceneSubject &&
    snapshot?.storySceneDisplayStates[selectedSceneSubject.turnId]?.activeShotIds.includes(selectedSceneSubject.shotId)
  );
  const taskCount =
    loadState.status === 'ready' && loadState.snapshot ? Object.keys(loadState.snapshot.tasks).length : 0;
  const bindingCount =
    loadState.status === 'ready' && loadState.snapshot ? Object.keys(loadState.snapshot.bindings).length : 0;

  const openSettings = () => {
    onClose();
    onOpenSettings();
  };

  async function reload(preferredImageId?: string) {
    if (!visualSaveId) return;
    const [next, nextStorage] = await Promise.all([
      repository.loadSnapshot(visualSaveId),
      repository.getStorageSummary(visualSaveId).then(
        (summary) => ({ status: 'ready' as const, summary }),
        () => ({ status: 'failed' as const, summary: null })
      )
    ]);
    setLoadState({ status: 'ready', snapshot: next });
    setStorageState(nextStorage);
    setSelectedImageId(preferredImageId && next.assets[preferredImageId] ? preferredImageId : undefined);
    if (automationRuntimeRepository) setAutomationRecords(await automationRuntimeRepository.listForSave(visualSaveId));
  }

  async function handleMaintenanceChanged(preferredImageId?: string) {
    await reload(preferredImageId);
    onRepositoryChanged?.();
  }

  async function retryAutomation(triggerId: string) {
    if (!onRetryAutomation || busy) return;
    setBusy(true);
    setEntryNotice('正在重新检查自动任务条件；只有硬门通过后才会提交。');
    try {
      await onRetryAutomation(triggerId);
      await reload();
      setEntryNotice('自动任务重试已结束，请查看下方状态和新生成图片。');
    } catch {
      setEntryNotice('自动任务重试失败；正文和已有图片未改动。');
    } finally {
      setBusy(false);
    }
  }

  async function requestDelete(imageId: string) {
    if (!visualSaveId || busy) return;
    const asset = snapshot?.assets[imageId];
    if (asset?.source === 'builtin') {
      setEntryNotice('游戏内置图片属于只读美术，不能删除或替换。');
      return;
    }
    setBusy(true);
    setEntryNotice('');
    try {
      const impact = await repository.getAssetDeletionImpact(visualSaveId, imageId);
      setPendingDelete(impact);
    } catch {
      setEntryNotice('无法读取删除影响；图片没有被改动。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!visualSaveId || !pendingDelete || busy) return;
    setBusy(true);
    setEntryNotice('');
    try {
      await repository.deleteAsset(visualSaveId, pendingDelete.imageId, pendingDelete.bindingIds.length > 0);
      const removedBindings = pendingDelete.bindingIds.length;
      setPendingDelete(undefined);
      await reload();
      onRepositoryChanged?.();
      setEntryNotice(removedBindings
        ? `图片已删除，并解除 ${removedBindings} 处绑定；正文、人物志和对话头像已按各自回退规则刷新。`
        : '未绑定图片已删除。');
    } catch {
      setEntryNotice('删除失败；图片与绑定没有被部分改动。');
    } finally {
      setBusy(false);
    }
  }

  async function importCharacterImage(file: File) {
    if (!visualSaveId || !importActorId || busy) return;
    setBusy(true);
    setEntryNotice('正在校验并导入本地图片。');
    try {
      const dimensions = await readUserImageDimensions(file);
      const now = new Date().toISOString();
      const subject = { type: 'actor' as const, saveId: visualSaveId, actorId: importActorId };
      const result = await repository.importUserImage({
        saveId: visualSaveId,
        imageId: createLocalVisualId('image'),
        blobKey: createLocalVisualId('blob'),
        blob: file,
        ...dimensions,
        createdAt: now,
        originSubject: subject,
        originPurpose: importPurpose,
        bindAsCurrent: importAsCurrent
      });
      await reload(result.asset.imageId);
      onRepositoryChanged?.();
      setEntryNotice(result.created
        ? `图片已导入${result.binding ? '并设为当前角色图' : '为角色历史候选图'}。`
        : `检测到相同内容，未重复写入${result.binding ? '，并已更新当前绑定' : ''}。`);
    } catch (error) {
      setEntryNotice(error instanceof Error ? error.message : '本地图片导入失败。');
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelectedImage() {
    if (!selectedAsset || busy || typeof URL.createObjectURL !== 'function') return;
    setBusy(true);
    setEntryNotice('');
    try {
      const blob = await repository.getBlob(selectedAsset.blobKey);
      if (!blob) throw new Error('图片文件不存在。');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedAsset.imageId}.${downloadExtension(selectedAsset.mimeType)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setEntryNotice('图片已开始下载；原资产与绑定没有改动。');
    } catch (error) {
      setEntryNotice(error instanceof Error ? error.message : '图片下载失败。');
    } finally {
      setBusy(false);
    }
  }

  async function copySelectedPrompt() {
    if (!selectedRequest || busy) return;
    setBusy(true);
    setEntryNotice('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不允许写入剪贴板。');
      await navigator.clipboard.writeText([
        `【最终正向提示词】\n${selectedRequest.positivePrompt}`,
        `【最终负向提示词】\n${selectedRequest.negativePrompt || '未单独传输负向词'}`
      ].join('\n\n'));
      setEntryNotice('已复制这张图片实际提交的最终提示词。');
    } catch (error) {
      setEntryNotice(error instanceof Error ? error.message : '复制提示词失败。');
    } finally {
      setBusy(false);
    }
  }

  async function bindSelectedCharacterAsCurrent() {
    if (
      !selectedAsset || !visualSaveId || selectedAsset.originSubject?.type !== 'actor' ||
      !selectedCharacterBindingId || busy
    ) return;
    setBusy(true);
    setEntryNotice('');
    try {
      await repository.bindAsset({
        bindingId: selectedCharacterBindingId,
        saveId: visualSaveId,
        subject: selectedAsset.originSubject,
        purpose: selectedCharacterPurpose,
        imageId: selectedAsset.imageId,
        updatedAt: new Date().toISOString()
      });
      await reload(selectedAsset.imageId);
      onRepositoryChanged?.();
      setEntryNotice(`已把这张候选图设为${CHARACTER_VISUAL_PURPOSE_LABELS[selectedCharacterPurpose]}；原图片资产仍保留。`);
    } catch {
      setEntryNotice('更新当前图片失败；原绑定没有被部分改动。');
    } finally {
      setBusy(false);
    }
  }

  async function restoreSelectedSceneToStory() {
    if (!visualSaveId || !selectedAsset || selectedAsset.originSubject?.type !== 'scene-shot' || busy) return;
    setBusy(true);
    setEntryNotice('');
    try {
      await repository.restoreSceneAssetToStory(
        visualSaveId,
        selectedAsset.imageId,
        new Date().toISOString()
      );
      await reload(selectedAsset.imageId);
      onRepositoryChanged?.();
      setEntryNotice(selectedSceneIsVisible
        ? '已换用这张历史图片；正文中的同一镜头已刷新，原图片资产仍保留。'
        : '已恢复这张历史场景图及其原始镜头到正文；没有修改正文文字。');
    } catch {
      setEntryNotice('恢复场景图失败；原绑定和正文显示没有被部分改动。');
    } finally {
      setBusy(false);
    }
  }

  async function unbindSelectedCurrent(bindingId: string, kind: 'character' | 'scene') {
    if (!visualSaveId || !selectedAsset || busy) return;
    setBusy(true);
    setEntryNotice('');
    try {
      await repository.unbindAsset(visualSaveId, bindingId);
      await reload(selectedAsset.imageId);
      onRepositoryChanged?.();
      setEntryNotice(kind === 'scene'
        ? '已从正文移除该镜头的当前绑定；正文文字和图片资产仍保留，可再次恢复。'
        : `已解除${CHARACTER_VISUAL_PURPOSE_LABELS[selectedCharacterPurpose]}绑定；图片仍保留在图册中。`);
    } catch {
      setEntryNotice('解除绑定失败；图片、绑定和正文显示没有被部分改动。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="character-archive-backdrop image-gallery-backdrop" role="presentation">
      <section
        className="image-gallery-modal feature-modal-frame"
        role="dialog"
        aria-modal="true"
        aria-label="图片管理"
      >
        <header className="image-gallery-header">
          <div>
            <p className="image-gallery-eyebrow">视觉资料 · 当前存档</p>
            <h2>图片管理</h2>
            <p>统一查看角色图、正文场景图、未绑定候选图和玩家导入图。</p>
          </div>
          <button type="button" className="image-gallery-close" aria-label="关闭图片管理" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="image-gallery-summary" aria-label="图片资料状态">
          <span>元数据资产 <strong>{storageSummary?.metadataAssetCount ?? assets.length}</strong></span>
          <span>本地文件 <strong>{storageState.status === 'loading'
            ? '读取中'
            : storageState.status === 'failed'
              ? '不可用'
              : storageSummary?.storedBlobCount ?? 0}</strong></span>
          <span>实际占用 <strong>{storageState.status === 'ready' && storageSummary
            ? formatStoredBytes(storageSummary.storedBytes)
            : storageState.status === 'loading' ? '读取中' : '不可用'}</strong></span>
          <span data-storage-warning={Boolean(
            storageSummary?.missingBlobCount ||
            storageSummary?.corruptBlobCount ||
            storageSummary?.orphanBlobCount
          )}>
            完整性 <strong>{storageState.status === 'ready' && storageSummary
              ? `缺失 ${storageSummary.missingBlobCount} / 损坏 ${storageSummary.corruptBlobCount} / 游离 ${storageSummary.orphanBlobCount}`
              : storageState.status === 'loading' ? '读取中' : '不可用'}</strong>
          </span>
          <span>绑定 <strong>{bindingCount}</strong></span>
          <span>任务 <strong>{taskCount}</strong></span>
          <span data-enabled={generationEnabled === undefined ? 'unknown' : generationEnabled}>
            {generationEnabled === undefined ? '视觉仓库独立' : generationEnabled ? '文生图已开启' : '文生图未开启'}
          </span>
        </div>

        <div className="image-gallery-body">
          {visualSaveId && loadState.status === 'ready' && loadState.snapshot ? (
            <>
              <div className="image-gallery-storage-entry">
                <div>
                  <strong>存储维护</strong>
                  <span>深度检查、精确恢复缺图，并在确认后清理损坏或游离文件。</span>
                </div>
                <button type="button" aria-expanded={maintenanceOpen} onClick={() => setMaintenanceOpen((current) => !current)}>
                  {maintenanceOpen ? '收起存储维护' : '打开存储维护'}
                </button>
              </div>
              {maintenanceOpen ? (
                <ImageStorageMaintenancePanel
                  saveId={visualSaveId}
                  repository={repository}
                  snapshot={loadState.snapshot}
                  summary={storageSummary}
                  onReport={(report) => setStorageState({ status: 'ready', summary: report.summary })}
                  onChanged={handleMaintenanceChanged}
                  onSelectAsset={(imageId) => {
                    const asset = loadState.snapshot?.assets[imageId];
                    setSelectedImageId(imageId);
                    setPendingDelete(undefined);
                    setReuseImageId(undefined);
                    setSelectedCharacterPurpose(
                      asset && CHARACTER_VISUAL_PURPOSES.includes(asset.originPurpose as CharacterVisualPurpose)
                        ? asset.originPurpose as CharacterVisualPurpose
                        : 'half-body-medium'
                    );
                    setMaintenanceOpen(false);
                  }}
                  onNotice={setEntryNotice}
                  onClose={() => setMaintenanceOpen(false)}
                />
              ) : null}
            </>
          ) : null}
          <section className="image-gallery-import" aria-label="导入本地角色图片">
            <h3>导入本地角色图</h3>
            <div>
              <label>目标角色
                <select value={importActorId} onChange={(event) => setImportActorId(event.target.value)}>
                  <option value="">请选择角色</option>
                  {Object.values(actors ?? {}).map((actor) => <option key={actor.actorId} value={actor.actorId}>{actor.name}</option>)}
                </select>
              </label>
              <label>图片用途
                <select value={importPurpose} onChange={(event) => setImportPurpose(event.target.value as CharacterVisualPurpose)}>
                  {CHARACTER_VISUAL_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</option>)}
                </select>
              </label>
              <label><input type="checkbox" checked={importAsCurrent} onChange={(event) => setImportAsCurrent(event.target.checked)} /> 导入后设为当前图片</label>
              <label className="character-visual-file-button">
                选择图片
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy || !visualSaveId || !importActorId} onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void importCharacterImage(file);
                }} />
              </label>
            </div>
            <p className="muted">图片只存入当前存档的独立视觉仓库；相同内容不会重复占用空间。</p>
          </section>
          {loadState.status === 'loading' ? (
            <p className="image-gallery-load-state" role="status">正在读取当前存档的视觉资料…</p>
          ) : null}

          {loadState.status === 'failed' ? (
            <div className="image-gallery-error" role="alert">
              <strong>视觉资料读取失败</strong>
              <p>没有改动存档、图片或绑定。请关闭后重试。</p>
            </div>
          ) : null}

          {automationRecords.length ? (
            <section className="image-gallery-assets" aria-label="自动图片任务状态">
              <div className="image-gallery-assets-heading"><div><p className="image-gallery-eyebrow">AUTOMATION STATUS</p><h3>自动任务</h3></div><p>每个新人物或正文回合只登记一次；失败重试仍受真实生成证据硬门约束。</p></div>
              <div className="image-settings-evidence-list">
                {automationRecords.map((record) => (
                  <article key={record.triggerId}>
                    <strong>{automationSubjectLabel(record, resolvedActors)}</strong>
                    <span>{record.status} · {record.taskIds.length} 个任务</span>
                    <p>{record.safeMessage}</p>
                    {['planning', 'queued', 'running'].includes(record.status) ? <button type="button" disabled={busy} onClick={() => {
                      onCancelAutomation?.(record.triggerId);
                      setEntryNotice('已请求取消自动任务；远端若不支持取消，迟到结果只会隔离保存。');
                    }}>取消</button> : null}
                    {['blocked', 'failed', 'cancelled'].includes(record.status) ? <button type="button" disabled={busy || !onRetryAutomation} onClick={() => void retryAutomation(record.triggerId)}>重新检查并重试</button> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {loadState.status === 'ready' && assets.length === 0 ? (
            <section className="image-gallery-empty" aria-labelledby="image-gallery-empty-title">
              <div className="image-gallery-empty-mark" aria-hidden="true">▧</div>
              <p className="image-gallery-eyebrow">EMPTY ARCHIVE</p>
              <h3 id="image-gallery-empty-title">当前存档还没有图片</h3>
              <p>
                图册入口不会因文生图关闭或图片 API 未配置而消失。空状态不会自动测试连接、转换提示词或生成图片。
              </p>
              <div className="image-gallery-empty-actions">
                <button type="button" onClick={openSettings}>前往文生图设置</button>
              </div>
              <small>生成人物图或正文场景图后会显示在这里；未来的玩家预制包导入不会写入游戏本体美术目录。</small>
            </section>
          ) : null}

          {loadState.status === 'ready' && assets.length > 0 ? (
            <section className="image-gallery-assets" aria-label="视觉资产列表">
              <div className="image-gallery-assets-heading">
                <div>
                  <p className="image-gallery-eyebrow">REPOSITORY PREVIEW</p>
                  <h3>仓库记录</h3>
                </div>
                <p>图片与游戏本体美术分开保存；删除已绑定图片前会显示影响并要求再次确认。</p>
              </div>
              <div className="image-gallery-filters" role="group" aria-label="筛选图片">
                {([
                  ['all', `全部 ${assets.length}`],
                  ['character', `人物 ${assets.filter((asset) => assetKind(asset) === 'character').length}`],
                  ['scene', `场景 ${assets.filter((asset) => assetKind(asset) === 'scene').length}`],
                  ['unbound', `未绑定 ${assets.filter((asset) => !bindings.some((binding) => binding.imageId === asset.imageId)).length}`]
                ] as Array<[GalleryFilter, string]>).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => {
                    setFilter(value);
                    if (value === 'unbound') setBindingFilter('all');
                  }}>{label}</button>
                ))}
              </div>
              <div className="image-gallery-filter-panel" aria-label="详细筛选">
                <label>角色
                  <select aria-label="筛选角色" value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
                    <option value="">全部角色</option>
                    {actorOptions.map((actorId) => (
                      <option key={actorId} value={actorId}>{actorName(resolvedActors, actorId)}</option>
                    ))}
                  </select>
                </label>
                <label>正文回合
                  <select aria-label="筛选正文回合" value={turnFilter} onChange={(event) => setTurnFilter(event.target.value)}>
                    <option value="">全部回合</option>
                    {turnOptions.map((turnId) => <option key={turnId} value={turnId}>{turnId}</option>)}
                  </select>
                </label>
                <label>图片来源
                  <select aria-label="筛选图片来源" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                    <option value="">全部来源</option>
                    {Object.entries(sourceLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <label>后端 / 模型
                  <select aria-label="筛选后端与模型" value={backendFilter} onChange={(event) => setBackendFilter(event.target.value)}>
                    <option value="">全部后端与模型</option>
                    {backendOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label>绑定状态
                  <select aria-label="筛选绑定状态" value={bindingFilter} onChange={(event) => {
                    const value = event.target.value as GalleryBindingFilter;
                    setBindingFilter(value);
                    if (value !== 'all' && filter === 'unbound') setFilter('all');
                  }}>
                    <option value="all">全部状态</option>
                    <option value="bound">已绑定</option>
                    <option value="unbound">未绑定</option>
                  </select>
                </label>
                <label>开始日期
                  <input aria-label="筛选开始日期" type="date" value={createdFrom} max={createdTo || undefined} onChange={(event) => setCreatedFrom(event.target.value)} />
                </label>
                <label>结束日期
                  <input aria-label="筛选结束日期" type="date" value={createdTo} min={createdFrom || undefined} onChange={(event) => setCreatedTo(event.target.value)} />
                </label>
                <label>时间排序
                  <select aria-label="图片时间排序" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as GallerySort)}>
                    <option value="newest">最新在前</option>
                    <option value="oldest">最早在前</option>
                  </select>
                </label>
                <button type="button" disabled={!hasDetailedFilters} onClick={() => {
                  setActorFilter('');
                  setTurnFilter('');
                  setSourceFilter('');
                  setBackendFilter('');
                  setBindingFilter('all');
                  setCreatedFrom('');
                  setCreatedTo('');
                }}>清除详细筛选</button>
              </div>
              <p className="image-gallery-filter-result" role="status">
                显示 {visibleAssets.length} / {assets.length} 张
                {filteredAssets.length !== assets.length ? `；筛选命中 ${filteredAssets.length} 张` : ''}
                ；角色筛选也会匹配 SceneShot 中已记录的参与人物。
              </p>
              {filteredAssets.length ? (
                <>
                  <div className="image-gallery-grid">
                    {visibleAssets.map((asset) => {
                      const assetBindings = bindings.filter((binding) => binding.imageId === asset.imageId);
                      return (
                        <article key={asset.imageId} className="image-gallery-card" data-selected={selectedImageId === asset.imageId}>
                          <button type="button" className="image-gallery-card-preview" onClick={() => {
                            setSelectedImageId(asset.imageId);
                            setPendingDelete(undefined);
                            setReuseImageId(undefined);
                            setSelectedCharacterPurpose(
                              CHARACTER_VISUAL_PURPOSES.includes(asset.originPurpose as CharacterVisualPurpose)
                                ? asset.originPurpose as CharacterVisualPurpose
                                : 'half-body-medium'
                            );
                          }} aria-label={`查看图片详情：${subjectLabel(asset, resolvedActors)}`}>
                            <VisualAssetImage
                              repository={repository}
                              asset={asset}
                              alt={subjectLabel(asset, resolvedActors)}
                              unavailableReason={
                                missingImageIds.has(asset.imageId)
                                  ? 'missing'
                                  : corruptImageIds.has(asset.imageId) ? 'corrupt' : undefined
                              }
                            />
                          </button>
                          <div className="image-gallery-card-copy">
                            <strong>{assetKind(asset) === 'character' ? '人物图' : assetKind(asset) === 'scene' ? '场景图' : '其他图片'}</strong>
                            <span>{purposeLabels[asset.originPurpose ?? ''] ?? '未指定用途'} · {asset.width} × {asset.height}</span>
                            <small>{subjectLabel(asset, resolvedActors)}</small>
                            <small>{assetBindings.length ? `绑定 ${assetBindings.length} 处` : '未绑定候选'}</small>
                            {missingImageIds.has(asset.imageId) ? (
                              <small className="image-gallery-file-missing">仅元数据 · 本地文件缺失</small>
                            ) : corruptImageIds.has(asset.imageId) ? (
                              <small className="image-gallery-file-missing">仅元数据 · 本地文件损坏</small>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                  {visibleAssets.length < filteredAssets.length ? (
                    <button
                      type="button"
                      className="image-gallery-load-more"
                      onClick={() => setAssetPage({
                        queryKey: galleryQueryKey,
                        limit: visibleAssets.length + GALLERY_PAGE_SIZE
                      })}
                    >
                      继续加载（剩余 {filteredAssets.length - visibleAssets.length} 张）
                    </button>
                  ) : null}
                </>
              ) : <p className="image-gallery-filter-empty">此筛选下没有图片。</p>}
            </section>
          ) : null}

          {selectedAsset ? (
            <aside className="image-gallery-detail" aria-label="图片详情">
              <div className="image-gallery-detail-heading">
                <div>
                  <p className="image-gallery-eyebrow">IMAGE DETAIL</p>
                  <h3>{purposeLabels[selectedAsset.originPurpose ?? ''] ?? '图片详情'}</h3>
                </div>
                <button type="button" onClick={() => {
                  setSelectedImageId(undefined);
                  setPendingDelete(undefined);
                  setReuseImageId(undefined);
                }}>收起详情</button>
              </div>
              <div className="image-gallery-detail-layout">
                <div className="image-gallery-detail-preview">
                  <button
                    type="button"
                    className="image-gallery-original-trigger"
                    aria-label={`查看原图：${subjectLabel(selectedAsset, resolvedActors)}`}
                    disabled={missingImageIds.has(selectedAsset.imageId) || corruptImageIds.has(selectedAsset.imageId)}
                    onClick={() => setOriginalImageId(selectedAsset.imageId)}
                  >
                    <VisualAssetImage
                      repository={repository}
                      asset={selectedAsset}
                      alt={subjectLabel(selectedAsset, resolvedActors)}
                      unavailableReason={
                        missingImageIds.has(selectedAsset.imageId)
                          ? 'missing'
                          : corruptImageIds.has(selectedAsset.imageId) ? 'corrupt' : undefined
                      }
                    />
                  </button>
                </div>
                <dl>
                  <div><dt>来源</dt><dd>{sourceLabels[selectedAsset.source]}</dd></div>
                  <div><dt>主体</dt><dd>{subjectLabel(selectedAsset, resolvedActors)}</dd></div>
                  <div><dt>尺寸</dt><dd>{selectedAsset.width} × {selectedAsset.height} · {Math.ceil(selectedAsset.byteLength / 1024)} KB</dd></div>
                  <div><dt>创建时间</dt><dd>{new Date(selectedAsset.createdAt).toLocaleString()}</dd></div>
                  <div><dt>本地文件</dt><dd>{missingImageIds.has(selectedAsset.imageId)
                    ? '缺失；当前只保留元数据'
                    : corruptImageIds.has(selectedAsset.imageId)
                      ? '损坏或与元数据不一致；当前只保留元数据'
                    : storageState.status === 'failed'
                      ? '完整性读取失败'
                      : storageState.status === 'loading'
                        ? '正在核对'
                        : '已保存'}</dd></div>
                  <div><dt>图片 ID</dt><dd><code>{selectedAsset.imageId}</code></dd></div>
                  <div><dt>当前绑定</dt><dd>{selectedBindings.length
                    ? <ul>{selectedBindings.map((binding) => <li key={binding.bindingId}>{bindingLabel(binding, resolvedActors)}</li>)}</ul>
                    : '未绑定候选图'}</dd></div>
                  {selectedRequest ? (
                    <>
                      <div><dt>生成后端</dt><dd>{selectedRequest.providerType} · {executionTargetLabel(selectedRequest)}</dd></div>
                      <div><dt>请求画幅</dt><dd>{selectedRequest.targetAspectRatio}</dd></div>
                      {selectedAsset.originSubject?.type === 'actor' ? (
                        <div><dt>人物构图</dt><dd>{characterCompositionLabel(selectedRequest)}</dd></div>
                      ) : null}
                      <div><dt>模型提示词格式</dt><dd>{selectedRequest.promptDialectPresetId}</dd></div>
                      <div><dt>负向词传输</dt><dd>{negativePromptModeLabels[selectedRequest.negativePromptMode]}</dd></div>
                      <div><dt>传输兼容性</dt><dd>{selectedRequest.transportCompatibility === 'compatible' ? '已验证可执行' : '旧请求未记录'}</dd></div>
                      <div><dt>玩家最终编辑</dt><dd>{selectedRequest.userEdited ? '是' : '否'}</dd></div>
                      <div><dt>请求指纹</dt><dd><code>{selectedRequest.requestFingerprint}</code></dd></div>
                      <div><dt>锚点来源图片</dt><dd>{anchorSourceImageIds(selectedTask).length
                        ? `${anchorSourceImageIds(selectedTask).join('、')}（仅锚点来源，未自动发送）`
                        : '无'}</dd></div>
                      <div><dt>实际生成参考图</dt><dd>{referenceImageIds(selectedTask).join('、') || '无'}</dd></div>
                      <div><dt>本次额外要求</dt><dd>{additionalRequirements(selectedTask).join('；') || '无'}</dd></div>
                      <div><dt>人物装扮来源</dt><dd>{sceneAppearanceSources(selectedTask).join('；') ||
                        (selectedTask?.intent.type === 'scene-image'
                          ? '无稳定角色'
                          : characterAppearanceSource(selectedTask))}</dd></div>
                      <div><dt>任务状态</dt><dd>{selectedTask
                        ? `${selectedTask.status}${selectedTask.error?.message ? ` · ${selectedTask.error.message}` : ''}`
                        : '资产保留了请求快照，原任务不可用'}</dd></div>
                      <div><dt>最终正向词</dt><dd className="image-gallery-prompt">{selectedRequest.positivePrompt}</dd></div>
                      <div><dt>最终负向词</dt><dd className="image-gallery-prompt">{selectedRequest.negativePrompt || '未单独传输负向词'}</dd></div>
                      <div><dt>实际生成参数</dt><dd><details><summary>查看脱敏参数</summary><pre className="image-gallery-request-parameters">{visibleGenerationParameters(selectedRequest)}</pre></details></dd></div>
                    </>
                  ) : null}
                </dl>
              </div>
              {selectedRequest ? <PromptTraceDetails request={selectedRequest} /> : null}
              <div className="image-gallery-detail-actions" aria-label="图片操作">
                <button
                  type="button"
                  disabled={busy || missingImageIds.has(selectedAsset.imageId) || corruptImageIds.has(selectedAsset.imageId)}
                  onClick={() => setOriginalImageId(selectedAsset.imageId)}
                >查看原图</button>
                <button
                  type="button"
                  disabled={busy || missingImageIds.has(selectedAsset.imageId) || corruptImageIds.has(selectedAsset.imageId)}
                  onClick={() => void downloadSelectedImage()}
                >下载图片</button>
                <button type="button" disabled={busy || !selectedRequest} onClick={() => void copySelectedPrompt()}>复制最终提示词</button>
                <button
                  type="button"
                  disabled={busy || selectedAsset.source !== 'generated' || !selectedTask?.submittedRequest}
                  onClick={() => setReuseImageId(selectedAsset.imageId)}
                >沿用此提示词再次生成</button>
              </div>
              {selectedAsset.originSubject?.type === 'actor' && selectedCharacterBindingId ? (
                <div className="image-gallery-binding-control" aria-label="人物图片绑定">
                  <label>
                    设为角色用途
                    <select
                      value={selectedCharacterPurpose}
                      onChange={(event) => setSelectedCharacterPurpose(event.target.value as CharacterVisualPurpose)}
                    >
                      {CHARACTER_VISUAL_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</option>
                      ))}
                    </select>
                  </label>
                  {selectedCharacterBinding?.imageId === selectedAsset.imageId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void unbindSelectedCurrent(selectedCharacterBindingId, 'character')}
                    >解除该用途绑定</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void bindSelectedCharacterAsCurrent()}>
                      设为该用途当前图
                    </button>
                  )}
                </div>
              ) : null}
              {selectedSceneSubject && selectedSceneBindingId ? (
                <div className="image-gallery-binding-control" aria-label="场景图片绑定">
                  <span>{selectedSceneIsVisible ? '该 SceneShot 正在正文显示。' : '该 SceneShot 当前不在正文显示集合中。'}</span>
                  {selectedSceneIsVisible && selectedSceneBinding?.imageId === selectedAsset.imageId ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void unbindSelectedCurrent(selectedSceneBindingId, 'scene')}
                    >从正文移除此镜头</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void restoreSelectedSceneToStory()}>
                      {selectedSceneIsVisible ? '换用这张历史图片' : '恢复此镜头到正文'}
                    </button>
                  )}
                </div>
              ) : null}
              {selectedAsset.source === 'generated' && selectedRequest && !selectedTask?.submittedRequest ? (
                <p className="image-prompt-reuse-unavailable">资产仍保留最终提示词，但原任务意图已经缺失，不能安全重建主体和绑定。可先复制提示词，再从人物或正文界面手动生成。</p>
              ) : null}
              {reuseImageId === selectedAsset.imageId && selectedTask?.submittedRequest && snapshot ? (
                <ImagePromptReusePanel
                  sourceAsset={selectedAsset}
                  sourceTask={selectedTask}
                  snapshot={snapshot}
                  repository={repository}
                  actors={resolvedActors}
                  profileRepository={profileRepository}
                  credentialRepository={credentialRepository}
                  generationPresetRepository={generationPresetRepository}
                  createImageExecutor={createImageExecutor}
                  onOpenSettings={openSettings}
                  onCancel={() => {
                    setReuseImageId(undefined);
                    setEntryNotice('已取消复用；没有创建任务、资产或新绑定。');
                  }}
                  onComplete={(imageId, message) => {
                    void reload(imageId).then(() => {
                      setReuseImageId(undefined);
                      setEntryNotice(message);
                      onRepositoryChanged?.();
                    });
                  }}
                />
              ) : null}
              <div className="image-gallery-delete-zone">
                {!pendingDelete || pendingDelete.imageId !== selectedAsset.imageId ? (
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy || selectedAsset.source === 'builtin'}
                    title={selectedAsset.source === 'builtin' ? '游戏内置图片属于只读美术' : undefined}
                    onClick={() => void requestDelete(selectedAsset.imageId)}
                  >{selectedAsset.source === 'builtin' ? '游戏内置图片只读' : '删除这张图片'}</button>
                ) : (
                  <div className="image-gallery-delete-confirm" role="alert">
                    <strong>{pendingDelete.bindingIds.length
                      ? `这张图片正在 ${pendingDelete.bindingIds.length} 处使用。`
                      : '这张图片当前没有绑定。'}</strong>
                    <p>{pendingDelete.bindingIds.length
                      ? '确认后会原子解除全部绑定并删除图片文件；正文不会被删除。'
                      : '确认后会删除图片文件，此操作无法撤销。'}</p>
                    {pendingDelete.bindingIds.length ? (
                      <ul>
                        {pendingDelete.bindingIds.map((bindingId) => {
                          const binding = bindings.find((item) => item.bindingId === bindingId);
                          return <li key={bindingId}>{binding ? bindingLabel(binding, resolvedActors) : bindingId}</li>;
                        })}
                      </ul>
                    ) : null}
                    <div>
                      <button type="button" className="danger-button" disabled={busy} onClick={() => void confirmDelete()}>{pendingDelete.bindingIds.length ? '解除绑定并确认删除' : '确认删除'}</button>
                      <button type="button" disabled={busy} onClick={() => setPendingDelete(undefined)}>取消</button>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          ) : null}
          {entryNotice ? <p className="image-gallery-entry-notice" role="status">{entryNotice}</p> : null}
        </div>

        <footer className="image-gallery-footer">
          <span>正式视觉仓库与游戏本体美术资产相互隔离。</span>
          <span>{visualSaveId ? `资料分区：${visualSaveId}` : '尚未建立存档分区，按空图册显示。'}</span>
        </footer>
      </section>
      {originalImageId &&
      snapshot?.assets[originalImageId] &&
      !missingImageIds.has(originalImageId) &&
      !corruptImageIds.has(originalImageId) ? (
        <VisualAssetOriginalDialog
          repository={repository}
          asset={snapshot.assets[originalImageId]}
          alt={subjectLabel(snapshot.assets[originalImageId], resolvedActors)}
          onClose={() => setOriginalImageId(undefined)}
        />
      ) : null}
    </div>
  );
}
