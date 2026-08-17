import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBuiltInCharacterDraftExecutionConfig,
  createFailedCharacterBatchRetryDraft,
  createManualCharacterBatchDraft,
  confirmManualCharacterBatch,
  executeConfirmedCharacterBatch,
  type CharacterImageExecutor,
  type CharacterDraftExecutionConfig,
  type CharacterPromptEdit,
  type ManualCharacterBatchDraft
} from '../../domain/imageGeneration/characterVisualWorkflow';
import { CharacterImageRuntimeExecutor } from '../../domain/imageGeneration/characterImageRuntimeExecutor';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import {
  ImagePromptConversionProbe,
  IndexedDbImagePromptTemplateRepository,
  CHARACTER_CAMERA_ELEVATIONS,
  CHARACTER_CAMERA_ELEVATION_LABELS,
  CHARACTER_VISUAL_PURPOSES,
  CHARACTER_VISUAL_PURPOSE_LABELS,
  CHARACTER_VIEW_ANGLES,
  CHARACTER_VIEW_ANGLE_LABELS,
  compileFormattedProviderPrompt,
  createProviderPromptRenderInput,
  DEFAULT_CHARACTER_COMPOSITION,
  projectActorForVisualConversion,
  resolveSelectedImageStyleModifiers,
  resolveActualTransportPrompts,
  validateCharacterAnchorText,
  type CharacterComposition,
  type CharacterVisualPurpose,
  type ImagePromptTemplateRepository
} from '../../domain/imageGeneration/promptConversion';
import {
  getImageProviderLabel,
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  listManualImageRoutingOptions,
  resolveManualImageRouting,
  type ComfyWorkflowTemplate,
  type ImageApiProfile,
  type ImageCredentialRepository,
  type ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import {
  createVisualBindingId,
  type CharacterVisualAnchor,
  type VisualAsset,
  type VisualBinding,
  type VisualRepository,
  type VisualRepositorySnapshot
} from '../../domain/imageGeneration/visualRepository';
import type { Actor } from '../../domain/runtime/types';
import {
  createLocalVisualId,
  loadAnchorSourceImages,
  readUserImageDimensions
} from '../../domain/imageGeneration/userImageImport';
import {
  IndexedDbImageGenerationPresetRepository,
  type ImageGenerationPresetRepository
} from '../../domain/imageGeneration/generationPresets';
import {
  resolveReferenceImageCapability,
  snapshotReferenceAssets
} from '../../domain/imageGeneration/referenceImageTransport';
import {
  IndexedDbPngStyleRepository,
  type PngStyleRepository
} from '../../domain/imageGeneration/pngStyle';
import { VisualAssetOriginalDialog } from './VisualAssetOriginalDialog';

const VIEW_FALLBACK_ORDER: CharacterVisualPurpose[] = [
  'half-body-medium',
  'knee-up-medium-full',
  'avatar-close-up',
  'full-body'
];

function createDefaultCompositionMap(): Record<CharacterVisualPurpose, CharacterComposition> {
  return Object.fromEntries(CHARACTER_VISUAL_PURPOSES.map((purpose) => [
    purpose,
    { ...DEFAULT_CHARACTER_COMPOSITION }
  ])) as Record<CharacterVisualPurpose, CharacterComposition>;
}

function compositionLabel(composition: CharacterComposition | undefined): string {
  const resolved = composition ?? DEFAULT_CHARACTER_COMPOSITION;
  return `${CHARACTER_VIEW_ANGLE_LABELS[resolved.viewAngle]} · ${CHARACTER_CAMERA_ELEVATION_LABELS[resolved.cameraElevation]}`;
}

const anchorSourceLabels: Record<CharacterVisualAnchor['source'], string> = {
  'actor-profile-api': '人物资料转换 API',
  'image-extraction-api': '图片提取 API',
  'user-edited': '玩家编辑'
};

const negativePromptModeLabels = {
  separate: '独立负向字段',
  'merged-into-positive': '合并进正向提示词',
  unsupported: '当前后端不支持',
  'workflow-controlled': '由 ComfyUI 工作流控制'
} as const;

function executionTargetLabel(task: ManualCharacterBatchDraft['tasks'][number]): string {
  const target = task.draft?.executionTarget;
  if (!target) return '未确定';
  return target.kind === 'model'
    ? `模型：${target.modelId}`
    : `工作流：${target.workflowTemplateId}（修订 ${target.workflowRevision}）`;
}

function executionParametersLabel(task: ManualCharacterBatchDraft['tasks'][number]): string {
  const parameters = task.draft?.generationParameters;
  if (!parameters) return '未确定';
  const { providerType: _providerType, ...visibleParameters } = parameters;
  return JSON.stringify(visibleParameters, null, 2);
}

function characterAppearanceSourceLabel(task: ManualCharacterBatchDraft['tasks'][number]): string {
  if (task.intent.type !== 'character-image') return '不适用';
  if (task.intent.appearanceSource === 'additional-requirement-override') {
    return '额外要求覆盖锚点默认服装';
  }
  if (task.intent.appearanceSource === 'anchor-default') return '锚点默认服装';
  return '旧转换指令：装扮混合在人物基础段';
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    return error.issues.map((issue) => {
      if (typeof issue === 'string') return issue;
      if (!issue || typeof issue !== 'object') return String(issue);
      const path = 'path' in issue && Array.isArray(issue.path) ? issue.path.join('.') : '';
      const message = 'message' in issue ? String(issue.message) : JSON.stringify(issue);
      return path ? `${path}：${message}` : message;
    }).join('；');
  }
  return error instanceof Error ? error.message : '操作失败。';
}

function createAnchorScaffold(actor: Actor): string {
  const fixedAppearance = [actor.visualAgeAnchor, actor.appearance, actor.femaleProfile?.appearanceDescription]
    .map((value) => value?.trim()).filter(Boolean).join('；') || '外貌尚未设定，等待玩家补充';
  const clothing = [actor.clothing, actor.femaleProfile?.clothingStyle]
    .map((value) => value?.trim()).filter(Boolean).join('；') || '默认服装尚未设定，等待玩家补充';
  return `【固定外观】${fixedAppearance}\n【默认服装】${clothing}\n【一致性要求】保持 ${actor.name} 的五官、发型、体型与年龄观感一致\n【避免偏移】避免擅自改变固定身份特征；场景临时服装与状态应覆盖默认服装`;
}

function findActorAnchor(snapshot: VisualRepositorySnapshot, actorId: string): CharacterVisualAnchor | undefined {
  return Object.values(snapshot.characterAnchors).find((anchor) => anchor.actorId === actorId);
}

function actorBindings(snapshot: VisualRepositorySnapshot, actorId: string): VisualBinding[] {
  return Object.values(snapshot.bindings).filter(
    (binding) => binding.subject.type === 'actor' && binding.subject.actorId === actorId
  );
}

function actorAssets(snapshot: VisualRepositorySnapshot, actorId: string): VisualAsset[] {
  const boundIds = new Set(actorBindings(snapshot, actorId).map((binding) => binding.imageId));
  return Object.values(snapshot.assets)
    .filter((asset) => boundIds.has(asset.imageId) || (
      asset.originSubject?.type === 'actor' && asset.originSubject.actorId === actorId
    ))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function useBlobUrl(repository: Pick<VisualRepository, 'getBlob'>, blobKey?: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let nextUrl: string | undefined;
    if (!blobKey || typeof URL.createObjectURL !== 'function') {
      setUrl(undefined);
      return () => { active = false; };
    }
    void repository.getBlob(blobKey).then((blob) => {
      if (!active || !blob) return;
      nextUrl = URL.createObjectURL(blob);
      setUrl(nextUrl);
    });
    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [blobKey, repository]);
  return url;
}

function AssetImage({ repository, asset, alt }: {
  repository: Pick<VisualRepository, 'getBlob'>;
  asset?: VisualAsset;
  alt: string;
}) {
  const url = useBlobUrl(repository, asset?.blobKey);
  return url ? <img src={url} alt={alt} /> : <span aria-hidden="true">无图</span>;
}

export function CharacterVisualThumbnail({
  repository,
  visualSaveId,
  actorId,
  actorName,
  refreshKey = 0,
  purposeOrder = VIEW_FALLBACK_ORDER,
  emptyLabel = '无图'
}: {
  repository: Pick<VisualRepository, 'loadSnapshot' | 'getBlob'>;
  visualSaveId: string;
  actorId: string;
  actorName: string;
  refreshKey?: number;
  purposeOrder?: readonly CharacterVisualPurpose[];
  emptyLabel?: string;
}) {
  const [asset, setAsset] = useState<VisualAsset>();
  useEffect(() => {
    let active = true;
    void repository.loadSnapshot(visualSaveId).then((snapshot) => {
      if (!active) return;
      const bindings = actorBindings(snapshot, actorId);
      const binding = purposeOrder
        .map((purpose) => bindings.find((item) => item.purpose === purpose))
        .find(Boolean);
      setAsset(binding ? snapshot.assets[binding.imageId] : undefined);
    }, () => active && setAsset(undefined));
    return () => { active = false; };
  }, [actorId, purposeOrder, refreshKey, repository, visualSaveId]);
  return asset
    ? <AssetImage repository={repository} asset={asset} alt={`${actorName} 当前人物图`} />
    : <span aria-hidden="true">{emptyLabel}</span>;
}

interface CharacterVisualPanelProps {
  actor: Actor;
  visualSaveId: string;
  worldYear: number;
  repository: VisualRepository;
  createPromptConversion?: () => ImagePromptConversionProbe | null;
  profileRepository?: ImageProfileRepository;
  credentialRepository?: ImageCredentialRepository;
  onOpenSettings?: () => void;
  onRepositoryChanged?: () => void;
  createImageExecutor?: () => CharacterImageExecutor;
  promptTemplateRepository?: ImagePromptTemplateRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  pngStyleRepository?: PngStyleRepository;
}

export function CharacterVisualPanel({
  actor,
  visualSaveId,
  worldYear,
  repository,
  createPromptConversion,
  profileRepository,
  credentialRepository,
  onOpenSettings,
  onRepositoryChanged,
  createImageExecutor,
  promptTemplateRepository,
  generationPresetRepository,
  pngStyleRepository
}: CharacterVisualPanelProps) {
  const profiles = useMemo(() => profileRepository ?? new IndexedDbImageProfileRepository(), [profileRepository]);
  const credentials = useMemo(
    () => credentialRepository ?? new IndexedDbImageCredentialRepository(),
    [credentialRepository]
  );
  const [snapshot, setSnapshot] = useState<VisualRepositorySnapshot>();
  const [anchorText, setAnchorText] = useState('');
  const [anchorSource, setAnchorSource] = useState<CharacterVisualAnchor['source']>('user-edited');
  const [anchorSourceImageIds, setAnchorSourceImageIds] = useState<string[]>([]);
  const [additionalRequirement, setAdditionalRequirement] = useState('');
  const [persistAdditional, setPersistAdditional] = useState(false);
  const [selectedPurposes, setSelectedPurposes] = useState<CharacterVisualPurpose[]>([...CHARACTER_VISUAL_PURPOSES]);
  const [compositions, setCompositions] = useState<Record<CharacterVisualPurpose, CharacterComposition>>(
    createDefaultCompositionMap
  );
  const [draft, setDraft] = useState<ManualCharacterBatchDraft>();
  const [promptEdits, setPromptEdits] = useState<CharacterPromptEdit[]>([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ imageId: string; bindingIds: string[] }>();
  const [originalAssetId, setOriginalAssetId] = useState<string>();
  const [executing, setExecuting] = useState(false);
  const [executionStages, setExecutionStages] = useState<Record<string, string>>({});
  const [selectedAnchorSourceIds, setSelectedAnchorSourceIds] = useState<string[]>([]);
  const [selectedReferenceImageIds, setSelectedReferenceImageIds] = useState<string[]>([]);
  const [importPurpose, setImportPurpose] = useState<CharacterVisualPurpose>('half-body-medium');
  const [importAsCurrent, setImportAsCurrent] = useState(true);
  const [manualProfiles, setManualProfiles] = useState<ImageApiProfile[]>([]);
  const [manualWorkflows, setManualWorkflows] = useState<ComfyWorkflowTemplate[]>([]);
  const [manualProfileId, setManualProfileId] = useState('');
  const [manualWorkflowId, setManualWorkflowId] = useState('');
  const [manualRoutingError, setManualRoutingError] = useState('');
  const executionControllerRef = useRef<AbortController | null>(null);
  const verificationStore = useMemo(() => new IndexedDbImageProbeStore(), []);
  const promptTemplates = useMemo(
    () => promptTemplateRepository ?? new IndexedDbImagePromptTemplateRepository(),
    [promptTemplateRepository]
  );
  const generationPresets = useMemo(
    () => generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository(),
    [generationPresetRepository]
  );
  const pngStyles = useMemo(
    () => pngStyleRepository ?? new IndexedDbPngStyleRepository(),
    [pngStyleRepository]
  );
  const imageExecutor = useMemo(() => createImageExecutor?.() ?? new CharacterImageRuntimeExecutor({
    profiles,
    credentials,
    verificationStore,
    visualRepository: repository,
    pageUrl: () => typeof window === 'undefined' ? undefined : window.location.href
  }), [createImageExecutor, credentials, profiles, repository, verificationStore]);

  const reload = useCallback(async () => {
    const loaded = await repository.loadSnapshot(visualSaveId);
    setSnapshot(loaded);
    return loaded;
  }, [repository, visualSaveId]);

  useEffect(() => {
    let active = true;
    setDraft(undefined);
    setPromptEdits([]);
    setCompositions(createDefaultCompositionMap());
    setNotice('');
    setError('');
    void repository.loadSnapshot(visualSaveId).then((loaded) => {
      if (!active) return;
      setSnapshot(loaded);
      const anchor = findActorAnchor(loaded, actor.actorId);
      setAnchorText(anchor?.anchorText ?? createAnchorScaffold(actor));
      setAnchorSource(anchor?.source ?? 'user-edited');
      setAnchorSourceImageIds(anchor?.sourceImageIds ?? []);
      setSelectedAnchorSourceIds([]);
      setSelectedReferenceImageIds([]);
      setAdditionalRequirement(anchor?.persistentAdditionalRequirementText ?? '');
      setPersistAdditional(Boolean(anchor?.persistentAdditionalRequirementText));
      const currentPurposes = actorBindings(loaded, actor.actorId)
        .map((binding) => binding.purpose)
        .filter((purpose): purpose is CharacterVisualPurpose =>
          CHARACTER_VISUAL_PURPOSES.includes(purpose as CharacterVisualPurpose)
        );
      setSelectedPurposes(currentPurposes.length
        ? CHARACTER_VISUAL_PURPOSES.filter((purpose) => currentPurposes.includes(purpose))
        : ['avatar-close-up', 'half-body-medium']);
    }, (caught) => active && setError(errorMessage(caught)));
    return () => { active = false; };
  }, [actor, repository, visualSaveId]);

  useEffect(() => {
    let active = true;
    void listManualImageRoutingOptions(profiles).then((options) => {
      if (!active) return;
      setManualProfiles(options.profiles);
      setManualWorkflows(options.workflows);
      setManualProfileId((current) => options.profiles.some((profile) => profile.profileId === current) ? current : '');
      setManualWorkflowId((current) => options.workflows.some((workflow) => workflow.workflowTemplateId === current) ? current : '');
      setManualRoutingError('');
    }, (caught) => active && setManualRoutingError(errorMessage(caught)));
    return () => { active = false; };
  }, [profiles]);

  const currentAnchor = snapshot ? findActorAnchor(snapshot, actor.actorId) : undefined;
  const bindings = snapshot ? actorBindings(snapshot, actor.actorId) : [];
  const assets = snapshot ? actorAssets(snapshot, actor.actorId) : [];
  const selectedManualProfile = manualProfiles.find((profile) => profile.profileId === manualProfileId);
  const selectedManualWorkflow = manualWorkflows.find(
    (workflow) => workflow.workflowTemplateId === manualWorkflowId
  );
  const referenceCandidates = assets.filter((asset) => (
    asset.source !== 'builtin' && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)
  ));
  const referenceCapability = resolveReferenceImageCapability({
    profile: selectedManualProfile,
    workflow: selectedManualWorkflow
  });
  const manualRoutingLocked = busy || executing || Boolean(draft?.tasks.some((task) =>
    ['awaiting-confirmation', 'queued', 'submitting', 'remote-pending', 'downloading', 'persisting'].includes(task.status)
  ));

  const persistAnchor = async (
    source = anchorSource,
    options: { clearPersistentRequirement?: boolean } = {}
  ): Promise<CharacterVisualAnchor> => {
    const issues = validateCharacterAnchorText(anchorText);
    if (issues.length) throw new Error(issues.join('；'));
    const anchor: CharacterVisualAnchor = {
      anchorId: currentAnchor?.anchorId ?? `character-anchor:${actor.actorId}`,
      saveId: visualSaveId,
      actorId: actor.actorId,
      anchorText: anchorText.trim(),
      persistentAdditionalRequirementText: options.clearPersistentRequirement
        ? undefined
        : persistAdditional && additionalRequirement.trim()
          ? additionalRequirement.trim()
          : currentAnchor?.persistentAdditionalRequirementText,
      source,
      sourceImageIds: source === 'image-extraction-api' ? anchorSourceImageIds : [],
      updatedAt: new Date().toISOString()
    };
    await repository.saveCharacterAnchor(anchor);
    await reload();
    onRepositoryChanged?.();
    return anchor;
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try { await operation(); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  };

  const generateAnchor = () => run(async () => {
    const converter = createPromptConversion?.();
    if (!converter) throw new Error('提示词转换 API 尚未配置，仍可直接编辑并保存本地锚点草稿。');
    const result = await converter.generateCharacterAnchor({
      actor: projectActorForVisualConversion(actor),
      world: { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' },
      existingAnchorText: currentAnchor?.anchorText
    });
    setAnchorText(result.anchorText);
    setAnchorSource('actor-profile-api');
    setAnchorSourceImageIds([]);
    setNotice('转换结果已写入编辑框；保存前仍可修改，尚未调用图片供应商。');
  });

  const saveAnchor = () => run(async () => {
    await persistAnchor(anchorSource);
    setNotice('当前唯一锚点已覆盖保存；历史图片不会随锚点变化。');
  });

  const extractAnchorFromSelectedImages = () => run(async () => {
    const converter = createPromptConversion?.();
    if (!converter) throw new Error('提示词转换 API 尚未配置。');
    converter.assertImageAnchorExtractionAvailable();
    const selectedAssets = selectedAnchorSourceIds.map((imageId) => snapshot?.assets[imageId]).filter(
      (asset): asset is VisualAsset => Boolean(asset)
    );
    const images = await loadAnchorSourceImages(selectedAssets, (blobKey) => repository.getBlob(blobKey));
    const result = await converter.generateCharacterAnchorFromImages({
      actor: projectActorForVisualConversion(actor),
      world: { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' },
      sourceImages: selectedAssets.map((asset) => ({
        imageId: asset.imageId,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        contentHash: asset.contentHash
      })),
      existingAnchorText: currentAnchor?.anchorText,
      additionalInstruction: additionalRequirement.trim() || undefined
    }, images);
    setAnchorText(result.anchorText);
    setAnchorSource('image-extraction-api');
    setAnchorSourceImageIds(selectedAssets.map((asset) => asset.imageId));
    setDraft(undefined);
    setNotice('图片提取结果已进入锚点编辑框；来源图片未修改，点击保存前不会覆盖当前锚点。');
  });

  const importCharacterImage = (file: File) => run(async () => {
    const dimensions = await readUserImageDimensions(file);
    const now = new Date().toISOString();
    const subject = { type: 'actor' as const, saveId: visualSaveId, actorId: actor.actorId };
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
    await reload();
    onRepositoryChanged?.();
    setNotice(result.created
      ? `本地图片已导入${result.binding ? `并设为${CHARACTER_VISUAL_PURPOSE_LABELS[importPurpose]}` : '为历史候选图'}。`
      : `检测到相同内容，未重复占用存储${result.binding ? '，并已更新当前绑定' : ''}。`);
  });

  const clearPersistentRequirement = () => run(async () => {
    if (!currentAnchor?.persistentAdditionalRequirementText) return;
    await persistAnchor('user-edited', { clearPersistentRequirement: true });
    setPersistAdditional(false);
    setNotice('已明确删除该角色的长期额外要求；当前输入框内容仍可作为一次性要求使用。');
  });

  const preparePrompts = () => run(async () => {
    if (!selectedPurposes.length) throw new Error('至少选择一种人物图。');
    const routing = await resolveManualImageRouting({
      profileRepository: profiles,
      credentialRepository: credentials,
      profileId: manualProfileId,
      workflowTemplateId: manualWorkflowId || undefined
    });
    const converter = createPromptConversion?.();
    if (!converter) throw new Error('提示词转换 API 尚未配置。请先在设置中配置辅助生成路由。');
    const execution = Object.fromEntries(await Promise.all(CHARACTER_VISUAL_PURPOSES.map(async (purpose) => [
      purpose,
      await createBuiltInCharacterDraftExecutionConfig({
        profile: routing.profile,
        purpose,
        credential: routing.credential,
        workflow: routing.workflow,
        preset: await generationPresets.get(routing.profile.profileId, purpose)
      })
    ]))) as Record<CharacterVisualPurpose, CharacterDraftExecutionConfig>;
    const selectedReferenceAssets = selectedReferenceImageIds.map((imageId) => {
      const asset = snapshot?.assets[imageId];
      if (!asset) throw new Error(`参考图 ${imageId} 已不存在，请重新选择。`);
      return asset;
    });
    const referenceCapabilities = Object.fromEntries(selectedPurposes.map((purpose) => [
      purpose,
      resolveReferenceImageCapability({
        profile: routing.profile,
        workflow: routing.workflow,
        generationParameters: execution[purpose].generationParameters
      })
    ])) as Record<CharacterVisualPurpose, ReturnType<typeof resolveReferenceImageCapability>>;
    const referenceImages = snapshotReferenceAssets(
      selectedReferenceAssets,
      referenceCapabilities[selectedPurposes[0]]
    );
    for (const purpose of selectedPurposes) {
      snapshotReferenceAssets(selectedReferenceAssets, referenceCapabilities[purpose]);
    }
    if (!currentAnchor || currentAnchor.anchorText !== anchorText.trim()) {
      throw new Error('存在未保存的角色锚点修改。请先“保存并覆盖当前锚点”，再生成提示词。');
    }
    if (
      persistAdditional &&
      (currentAnchor.persistentAdditionalRequirementText ?? '') !== additionalRequirement.trim()
    ) {
      throw new Error('长期额外要求尚未保存。请先保存视觉设定，再生成提示词。');
    }
    const savedAnchor = currentAnchor;
    const converted = await converter.generateCharacterViewPrompts({
      actorId: actor.actorId,
      anchorText: savedAnchor.anchorText,
      additionalRequirementText: additionalRequirement.trim() || undefined,
      world: { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' }
    });
    const [templateSettings, pngStyleSettings] = await Promise.all([
      promptTemplates.load(),
      pngStyles.load()
    ]);
    const nextDraft = await createManualCharacterBatchDraft({
      repository,
      anchor: savedAnchor,
      views: converted.views.filter((view) => selectedPurposes.includes(view.purpose)),
      purposes: selectedPurposes,
      compositions,
      additionalRequirementText: additionalRequirement,
      additionalRequirementMode: additionalRequirement.trim()
        ? (persistAdditional ? 'persistent' : 'one-time') : 'none',
      execution,
      referenceImages,
      referenceImageTransport: referenceImages.length
        ? Object.fromEntries(selectedPurposes.map((purpose) => [
          purpose,
          referenceCapabilities[purpose].transport
        ]))
        : { kind: 'none' },
      modifiers: templateSettings.modifiers,
      styleModifiers: resolveSelectedImageStyleModifiers(
        templateSettings.stylePresets,
        templateSettings.styleSelection,
        'character'
      ),
      pngStyleSettings,
      renderPrompt: async ({ semanticPrompt, execution }) => {
        const dialect = templateSettings.dialectPresets.find(
          (preset) => preset.dialectPresetId === execution.promptDialectPresetId
        );
        if (!dialect) throw new Error(`生成预设引用了不存在的模型提示词格式：${execution.promptDialectPresetId}`);
        const output = await converter.renderProviderPrompt(
          createProviderPromptRenderInput(semanticPrompt, dialect)
        );
        return compileFormattedProviderPrompt(semanticPrompt, dialect, output);
      }
    });
    setDraft(nextDraft);
    setPromptEdits(nextDraft.tasks.map((task) => ({
      purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium',
      positivePrompt: task.draft?.positivePrompt ?? '',
      negativePrompt: task.draft?.negativePrompt ?? ''
    })));
    setNotice('最终提示词已生成。请逐项检查和修改；当前没有调用图片供应商。');
  });

  const confirmPrompts = () => run(async () => {
    if (!draft) throw new Error('还没有可确认的提示词草稿。');
    const confirmed = await confirmManualCharacterBatch({ repository, draft, edits: promptEdits });
    setDraft(confirmed);
    await reload();
    onRepositoryChanged?.();
    setNotice('已冻结玩家确认过的请求并加入生成队列；本次操作本身没有调用图片供应商。');
  });

  const executeBatch = async () => {
    if (!draft || !draft.tasks.every((task) => task.status === 'queued')) {
      setError('当前没有已确认、可开始执行的图片批次。');
      return;
    }
    const controller = new AbortController();
    executionControllerRef.current = controller;
    setExecuting(true);
    setError('');
    setNotice('正在执行已冻结请求；可以取消，已成功景别会立即保存并绑定。');
    setExecutionStages({});
    try {
      const batch = await executeConfirmedCharacterBatch({
        repository,
        confirmed: draft,
        executor: imageExecutor,
        signal: controller.signal,
        onTaskStage: (taskId, stage) => setExecutionStages((current) => ({ ...current, [taskId]: stage }))
      });
      const loaded = await reload();
      setDraft({ batch, tasks: batch.taskIds.map((taskId) => loaded.tasks[taskId]).filter(Boolean) });
      onRepositoryChanged?.();
      setNotice(batch.status === 'succeeded'
        ? '本批次全部完成；各景别首张结果已绑定，其余结果保留为候选图。'
        : '本批次已结束；成功景别已保存，失败或取消景别保留原有绑定。');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      if (executionControllerRef.current === controller) executionControllerRef.current = null;
      setExecuting(false);
    }
  };

  const retryFailedPurposes = () => run(async () => {
    if (!draft || !snapshot) throw new Error('当前没有可重试的批次。');
    const nextDraft = await createFailedCharacterBatchRetryDraft({
      repository,
      previousBatch: draft.batch,
      tasksById: snapshot.tasks
    });
    setDraft(nextDraft);
    setPromptEdits(nextDraft.tasks.map((task) => ({
      purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium',
      positivePrompt: task.draft?.positivePrompt ?? '',
      negativePrompt: task.draft?.negativePrompt ?? ''
    })));
    await reload();
    setNotice('只为失败景别创建了新任务；提示词与参数已重新展示，确认后才会再次提交。');
  });

  const bind = (asset: VisualAsset, purpose: CharacterVisualPurpose) => run(async () => {
    const subject = { type: 'actor' as const, saveId: visualSaveId, actorId: actor.actorId };
    await repository.bindAsset({
      bindingId: createVisualBindingId(visualSaveId, subject, purpose),
      saveId: visualSaveId,
      subject,
      purpose,
      imageId: asset.imageId,
      updatedAt: new Date().toISOString()
    });
    await reload();
    onRepositoryChanged?.();
    setNotice(`已将图片设为${CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}。`);
  });

  const requestDelete = (asset: VisualAsset) => run(async () => {
    if (asset.source === 'builtin') throw new Error('游戏内置图片属于只读美术，不能删除。');
    setPendingDelete(undefined);
    setPendingDelete(await repository.getAssetDeletionImpact(visualSaveId, asset.imageId));
  });

  const removeAsset = (asset: VisualAsset) => run(async () => {
    if (!pendingDelete || pendingDelete.imageId !== asset.imageId) {
      throw new Error('删除影响已经变化，请重新检查。');
    }
    await repository.deleteAsset(visualSaveId, asset.imageId, pendingDelete.bindingIds.length > 0);
    setPendingDelete(undefined);
    setOriginalAssetId((current) => current === asset.imageId ? undefined : current);
    await reload();
    onRepositoryChanged?.();
    setNotice(pendingDelete.bindingIds.length
      ? `图片已删除，并解除 ${pendingDelete.bindingIds.length} 处人物绑定；人物志与对话头像已按既有回退顺序刷新。`
      : '未绑定图片已从视觉仓库删除。');
  });

  return (
    <div className="character-visual-panel">
      <section className="character-visual-anchor-card">
        <div className="character-visual-section-heading">
          <div>
            <p>CHARACTER ANCHOR</p>
            <h4>当前唯一角色锚点</h4>
          </div>
          <div className="character-visual-actions">
            <button type="button" disabled={busy} onClick={generateAnchor}>从人物资料转换</button>
            <button type="button" disabled={busy || selectedAnchorSourceIds.length === 0} onClick={extractAnchorFromSelectedImages}>
              从已选图片提取锚点
            </button>
          </div>
        </div>
        <p className="character-visual-meta">
          {currentAnchor
            ? `来源：${anchorSourceLabels[currentAnchor.source]} · ${new Date(currentAnchor.updatedAt).toLocaleString('zh-CN')}`
            : '本地草稿：尚未保存，也没有调用转换 API'}
        </p>
        <textarea
          aria-label="角色文生图锚点"
          value={anchorText}
          rows={10}
          onChange={(event) => {
            setAnchorText(event.target.value);
            setAnchorSource('user-edited');
            setAnchorSourceImageIds([]);
            setDraft(undefined);
          }}
        />
        <label className="character-visual-extra-field">
          <span>额外要求（自然语言，转换后优先级高于通用模板）</span>
          <textarea
            aria-label="角色额外文生图要求"
            value={additionalRequirement}
            rows={3}
            onChange={(event) => { setAdditionalRequirement(event.target.value); setDraft(undefined); }}
          />
        </label>
        <label className="character-visual-persist-toggle">
          <input
            type="checkbox"
            checked={persistAdditional}
            onChange={(event) => { setPersistAdditional(event.target.checked); setDraft(undefined); }}
          />
          <span>作为长期字段保存；关闭时只用于本次人物图</span>
        </label>
        <div className="character-visual-actions">
          <button type="button" disabled={busy} onClick={saveAnchor}>保存并覆盖当前锚点</button>
          {currentAnchor?.persistentAdditionalRequirementText ? (
            <button type="button" className="danger" disabled={busy} onClick={clearPersistentRequirement}>
              删除长期要求
            </button>
          ) : null}
          {onOpenSettings ? <button type="button" disabled={busy} onClick={onOpenSettings}>文生图设置</button> : null}
        </div>
      </section>

      <section className="character-visual-generation-card">
        <div className="character-visual-section-heading">
          <div>
            <p>MANUAL GENERATION</p>
            <h4>四类人物图</h4>
          </div>
          <button type="button" disabled={busy} onClick={preparePrompts}>生成并预览提示词</button>
        </div>
        <div className="character-visual-routing" aria-label="手动人物图生成路由">
          <label>
            本次图片档案
            <select
              aria-label="手动人物图图片档案"
              value={manualProfileId}
              disabled={manualRoutingLocked}
              onChange={(event) => {
                setManualProfileId(event.target.value);
                setManualWorkflowId('');
                setSelectedReferenceImageIds([]);
                setDraft(undefined);
                setPromptEdits([]);
              }}
            >
              <option value="">请明确选择</option>
              {manualProfiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.name} · {getImageProviderLabel(profile.providerType)}
                </option>
              ))}
            </select>
          </label>
          {selectedManualProfile?.providerType === 'comfyui-workflow' ? (
            <label>
              本次 ComfyUI API 工作流
              <select
                aria-label="手动人物图 ComfyUI API 工作流"
                value={manualWorkflowId}
                disabled={manualRoutingLocked}
                onChange={(event) => {
                  setManualWorkflowId(event.target.value);
                  setSelectedReferenceImageIds([]);
                  setDraft(undefined);
                  setPromptEdits([]);
                }}
              >
                <option value="">请明确选择</option>
                {manualWorkflows.map((workflow) => (
                  <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>
                    {workflow.name} · 修订 {workflow.revision}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="muted">选择会冻结到本次预览草稿；不会自动改用其他档案或工作流。</p>
          {manualRoutingError ? <p className="character-visual-error" role="alert">{manualRoutingError}</p> : null}
        </div>
        <fieldset className="character-visual-reference-picker">
          <legend>本次实际发送的参考图（可选）</legend>
          <p className="muted">
            {referenceCapability.supported
              ? `${referenceCapability.label}。${referenceCapability.reason}`
              : referenceCapability.reason}
            {' '}锚点提取来源图不会自动进入这里；游戏内置美术永远不会列入候选。
          </p>
          {referenceCandidates.length ? (
            <div className="character-visual-reference-grid">
              {referenceCandidates.map((asset) => (
                <label key={asset.imageId}>
                  <input
                    type="checkbox"
                    checked={selectedReferenceImageIds.includes(asset.imageId)}
                    disabled={manualRoutingLocked || !referenceCapability.supported}
                    onChange={(event) => {
                      setSelectedReferenceImageIds((current) => {
                        if (!event.target.checked) return current.filter((imageId) => imageId !== asset.imageId);
                        if (current.length >= referenceCapability.maxImages) {
                          setError(`当前参考图协议最多允许 ${referenceCapability.maxImages} 张。`);
                          return current;
                        }
                        setError('');
                        return [...current, asset.imageId];
                      });
                      setDraft(undefined);
                      setPromptEdits([]);
                    }}
                  />
                  <span>{asset.imageId} · {asset.width}×{asset.height}</span>
                </label>
              ))}
            </div>
          ) : <p className="muted">这个角色还没有可发送的 PNG、JPEG 或 WebP 玩家资产。</p>}
        </fieldset>
        <div className="character-visual-purpose-grid" aria-label="人物图景别与构图">
          {CHARACTER_VISUAL_PURPOSES.map((purpose) => (
            <div
              className={`character-visual-purpose-card${selectedPurposes.includes(purpose) ? ' is-selected' : ''}`}
              key={purpose}
            >
              <label className="character-visual-purpose-toggle">
                <input
                  type="checkbox"
                  checked={selectedPurposes.includes(purpose)}
                  onChange={(event) => {
                    setSelectedPurposes((current) => event.target.checked
                      ? CHARACTER_VISUAL_PURPOSES.filter((item) => [...current, purpose].includes(item))
                      : current.filter((item) => item !== purpose));
                    setDraft(undefined);
                    setPromptEdits([]);
                  }}
                />
                <span>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</span>
              </label>
              <div className="character-visual-composition-grid">
                <label>
                  <span>人物朝向</span>
                  <select
                    aria-label={`${CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}人物朝向`}
                    value={compositions[purpose].viewAngle}
                    disabled={busy || executing || !selectedPurposes.includes(purpose)}
                    onChange={(event) => {
                      setCompositions((current) => ({
                        ...current,
                        [purpose]: { ...current[purpose], viewAngle: event.target.value as CharacterComposition['viewAngle'] }
                      }));
                      setDraft(undefined);
                      setPromptEdits([]);
                    }}
                  >
                    {CHARACTER_VIEW_ANGLES.map((viewAngle) => (
                      <option key={viewAngle} value={viewAngle}>{CHARACTER_VIEW_ANGLE_LABELS[viewAngle]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>镜头高度</span>
                  <select
                    aria-label={`${CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}镜头高度`}
                    value={compositions[purpose].cameraElevation}
                    disabled={busy || executing || !selectedPurposes.includes(purpose)}
                    onChange={(event) => {
                      setCompositions((current) => ({
                        ...current,
                        [purpose]: {
                          ...current[purpose],
                          cameraElevation: event.target.value as CharacterComposition['cameraElevation']
                        }
                      }));
                      setDraft(undefined);
                      setPromptEdits([]);
                    }}
                  >
                    {CHARACTER_CAMERA_ELEVATIONS.map((cameraElevation) => (
                      <option key={cameraElevation} value={cameraElevation}>
                        {CHARACTER_CAMERA_ELEVATION_LABELS[cameraElevation]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        <p className="character-visual-meta">
          “自动”交给模型决定；明确选择会作为独立构图段写入预览，并冻结到本次请求。
        </p>
        <div className="character-visual-actions">
          <button type="button" disabled={busy} onClick={() => {
            setSelectedPurposes([...CHARACTER_VISUAL_PURPOSES]);
            setDraft(undefined);
          }}>全选四景别</button>
          <button type="button" disabled={busy} onClick={() => {
            const bound = new Set(bindings.map((binding) => binding.purpose));
            setSelectedPurposes(CHARACTER_VISUAL_PURPOSES.filter((purpose) => !bound.has(purpose)));
            setDraft(undefined);
          }}>只选缺失景别</button>
        </div>
        {promptEdits.length && draft ? (
          <div className="character-prompt-preview-list" aria-label="最终提示词预览">
            {promptEdits.map((edit, index) => (
              <article key={edit.purpose}>
                {(() => {
                  const task = draft?.tasks.find((item) =>
                    item.intent.type === 'character-image' && item.intent.purpose === edit.purpose
                  );
                  return task?.draft ? (
                    <div className="character-prompt-execution-summary">
                      <h5>{CHARACTER_VISUAL_PURPOSE_LABELS[edit.purpose]} · {task.draft.targetAspectRatio}</h5>
                      <dl>
                        <div><dt>目标角色</dt><dd>{actor.name}</dd></div>
                        <div><dt>图片档案</dt><dd>{task.draft.imageProfileId} / {task.draft.providerType}</dd></div>
                        <div><dt>执行目标</dt><dd>{executionTargetLabel(task)}</dd></div>
                        <div><dt>人物构图</dt><dd>{compositionLabel(task.draft.characterComposition)}</dd></div>
                        <div><dt>模型提示词格式</dt><dd>{task.draft.promptDialectPresetId}</dd></div>
                        <div><dt>负向词传输</dt><dd>{negativePromptModeLabels[task.draft.negativePromptMode]}</dd></div>
                        <div><dt>传输兼容性</dt><dd>{task.draft.transportCompatibility === 'compatible' ? '已验证可执行' : '旧任务未记录'}</dd></div>
                        <div><dt>当前装扮来源</dt><dd>{characterAppearanceSourceLabel(task)}</dd></div>
                        <div><dt>锚点来源图片</dt><dd>{task.intent.type === 'character-image' &&
                          task.intent.anchorSourceImageIds?.length
                          ? `${task.intent.anchorSourceImageIds.join('、')}（仅锚点来源，未自动发送）`
                          : '无'}</dd></div>
                        <div><dt>实际生成参考图</dt><dd>{task.intent.referenceImageIds.length
                          ? task.intent.referenceImageIds.join('、') : '无'}</dd></div>
                        <div><dt>参考图传输</dt><dd>{task.draft.referenceImageTransport.kind}</dd></div>
                      </dl>
                      {task.draft.referenceImages.length ? (
                        <details>
                          <summary>查看冻结的参考图元数据</summary>
                          <pre>{JSON.stringify(task.draft.referenceImages, null, 2)}</pre>
                        </details>
                      ) : null}
                      <details>
                        <summary>查看本次实际生成参数</summary>
                        <pre>{executionParametersLabel(task)}</pre>
                      </details>
                      <details>
                        <summary>查看语义段、模型格式段与实际传输提示词</summary>
                        <h6>供应商无关语义段</h6>
                        <pre>{JSON.stringify(task.draft.semanticPromptSegments ?? [], null, 2)}</pre>
                        <h6>模型格式转换段</h6>
                        <pre>{JSON.stringify(task.draft.formattedPromptSegments ?? [], null, 2)}</pre>
                        <h6>按当前手动编辑计算的实际传输</h6>
                        <pre>{JSON.stringify(resolveActualTransportPrompts({
                          positive: edit.positivePrompt,
                          negative: edit.negativePrompt
                        }, task.draft.negativePromptMode, task.draft.promptDialectFamily), null, 2)}</pre>
                      </details>
                    </div>
                  ) : <h5>{CHARACTER_VISUAL_PURPOSE_LABELS[edit.purpose]}</h5>;
                })()}
                <label>
                  <span>最终正向提示词</span>
                  <textarea
                    value={edit.positivePrompt}
                    rows={6}
                    disabled={!draft?.tasks.every((task) => task.status === 'awaiting-confirmation')}
                    onChange={(event) => setPromptEdits((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, positivePrompt: event.target.value } : item
                    ))}
                  />
                </label>
                <label>
                  <span>最终负向提示词</span>
                  <textarea
                    value={edit.negativePrompt}
                    rows={4}
                    disabled={!draft?.tasks.every((task) => task.status === 'awaiting-confirmation')}
                    onChange={(event) => setPromptEdits((current) => current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, negativePrompt: event.target.value } : item
                    ))}
                  />
                </label>
              </article>
            ))}
            <button
              type="button"
              className="character-prompt-confirm"
              disabled={busy || !draft?.tasks.every((task) => task.status === 'awaiting-confirmation')}
              onClick={confirmPrompts}
            >
              确认并冻结请求
            </button>
            {draft.tasks.some((task) => task.status !== 'awaiting-confirmation') ? (
              <div className="character-prompt-execution-summary" aria-label="图片批次执行状态">
                <h5>批次状态：{draft.batch.status}</h5>
                <ul>
                  {draft.tasks.map((task) => (
                    <li key={task.taskId}>
                      {task.intent.type === 'character-image' ? CHARACTER_VISUAL_PURPOSE_LABELS[task.intent.purpose] : task.taskId}
                      {' · '}{task.status}{executionStages[task.taskId] ? ` · ${executionStages[task.taskId]}` : ''}
                      {task.error?.message ? ` · ${task.error.message}` : ''}
                    </li>
                  ))}
                </ul>
                <div className="character-visual-actions">
                  <button type="button" disabled={executing || !draft.tasks.every((task) => task.status === 'queued')} onClick={() => void executeBatch()}>
                    {executing ? '生成中…' : '开始生成（可能计费或占用显存）'}
                  </button>
                  <button type="button" disabled={!executing} onClick={() => executionControllerRef.current?.abort(new DOMException('玩家取消人物图生成。', 'AbortError'))}>
                    取消本批次
                  </button>
                  <button type="button" disabled={busy || executing || !draft.tasks.some((task) => task.status === 'failed')} onClick={retryFailedPurposes}>
                    仅重试失败景别
                  </button>
                </div>
                <p className="muted">手动生成允许在没有真实通过证据时继续；自动生成仍受当前执行指纹的真实证据硬门限制。</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {notice ? <p className="character-visual-notice" role="status">{notice}</p> : null}
      {error ? <p className="character-visual-error" role="alert">{error}</p> : null}

      <section className="character-visual-assets-card">
        <div className="character-visual-section-heading">
          <div><p>VISUAL ASSETS</p><h4>已生成与历史图片</h4></div>
          <span>{assets.length} 张</span>
        </div>
        <div className="character-visual-import-row">
          <label>导入用途
            <select value={importPurpose} onChange={(event) => setImportPurpose(event.target.value as CharacterVisualPurpose)}>
              {CHARACTER_VISUAL_PURPOSES.map((purpose) => (
                <option key={purpose} value={purpose}>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={importAsCurrent} onChange={(event) => setImportAsCurrent(event.target.checked)} />
            导入后设为当前图片
          </label>
          <label className="character-visual-file-button">
            导入本地角色图
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = '';
                if (file) void importCharacterImage(file);
              }}
            />
          </label>
        </div>
        <p className="muted">导入图只进入当前存档的视觉仓库，不会写入或替换游戏本体美术。单张上限 15 MB。</p>
        {assets.length ? (
          <div className="character-visual-asset-grid">
            {assets.map((asset) => {
              const assetBindings = bindings.filter((item) => item.imageId === asset.imageId);
              const originPurpose = CHARACTER_VISUAL_PURPOSES.includes(asset.originPurpose as CharacterVisualPurpose)
                ? asset.originPurpose as CharacterVisualPurpose : 'half-body-medium';
              return (
                <article key={asset.imageId}>
                  <div className="character-visual-asset-image">
                    <AssetImage repository={repository} asset={asset} alt={`${actor.name} 人物图`} />
                  </div>
                  <strong>{assetBindings.length
                    ? `当前：${assetBindings.map((binding) => (
                      CHARACTER_VISUAL_PURPOSE_LABELS[binding.purpose as CharacterVisualPurpose] ?? binding.purpose
                    )).join('、')}`
                    : '历史候选图'}</strong>
                  <small>{asset.width} × {asset.height} · {new Date(asset.createdAt).toLocaleString('zh-CN')}</small>
                  <label className="character-visual-source-select">
                    <input
                      type="checkbox"
                      checked={selectedAnchorSourceIds.includes(asset.imageId)}
                      onChange={(event) => setSelectedAnchorSourceIds((current) => event.target.checked
                        ? [...current, asset.imageId].slice(0, 4)
                        : current.filter((imageId) => imageId !== asset.imageId))}
                    />
                    作为锚点提取来源
                  </label>
                  <div>
                    <button type="button" onClick={() => setOriginalAssetId(asset.imageId)}>查看原图</button>
                    <select aria-label="绑定图片用途" defaultValue={originPurpose} id={`purpose-${asset.imageId}`}>
                      {CHARACTER_VISUAL_PURPOSES.map((purpose) => (
                        <option key={purpose} value={purpose}>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={(event) => {
                      const select = event.currentTarget.parentElement?.querySelector('select');
                      if (select) void bind(asset, select.value as CharacterVisualPurpose);
                    }}>设为当前</button>
                    {assetBindings.map((binding) => (
                      <button type="button" key={binding.bindingId} onClick={() => void run(async () => {
                        await repository.unbindAsset(visualSaveId, binding.bindingId);
                        await reload();
                        onRepositoryChanged?.();
                        setNotice(`已解除${CHARACTER_VISUAL_PURPOSE_LABELS[binding.purpose as CharacterVisualPurpose] ?? binding.purpose}绑定；图片仍保留。`);
                      })}>
                        解除{CHARACTER_VISUAL_PURPOSE_LABELS[binding.purpose as CharacterVisualPurpose] ?? binding.purpose}绑定
                      </button>
                    ))}
                    <button
                      type="button"
                      className="danger"
                      disabled={asset.source === 'builtin'}
                      title={asset.source === 'builtin' ? '游戏内置图片属于只读美术' : undefined}
                      onClick={() => requestDelete(asset)}
                    >{asset.source === 'builtin' ? '内置图片只读' : '删除'}</button>
                  </div>
                  {pendingDelete?.imageId === asset.imageId ? (
                    <div className="character-visual-delete-confirm" role="alert">
                      <span>{pendingDelete.bindingIds.length
                        ? `将同时解除 ${pendingDelete.bindingIds.length} 处绑定：`
                        : '这张图片当前没有绑定，删除后无法撤销。'}</span>
                      {pendingDelete.bindingIds.length ? (
                        <ul>
                          {pendingDelete.bindingIds.map((bindingId) => {
                            const binding = bindings.find((item) => item.bindingId === bindingId);
                            return <li key={bindingId}>{binding
                              ? CHARACTER_VISUAL_PURPOSE_LABELS[binding.purpose as CharacterVisualPurpose] ?? binding.purpose
                              : bindingId}</li>;
                          })}
                        </ul>
                      ) : null}
                      <button type="button" onClick={() => setPendingDelete(undefined)}>取消</button>
                      <button type="button" className="danger" onClick={() => removeAsset(asset)}>确认删除</button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <p className="character-visual-empty">这个角色还没有视觉资产。生成请求与游戏本体美术目录完全隔离。</p>}
      </section>
      {originalAssetId && snapshot?.assets[originalAssetId] ? (
        <VisualAssetOriginalDialog
          repository={repository}
          asset={snapshot.assets[originalAssetId]}
          alt={`${actor.name} 人物原图`}
          onClose={() => setOriginalAssetId(undefined)}
        />
      ) : null}
    </div>
  );
}
