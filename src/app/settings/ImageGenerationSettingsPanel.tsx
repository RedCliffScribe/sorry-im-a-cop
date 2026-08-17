import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { APP_VERSION } from '../releaseIdentity';
import {
  IMAGE_PROBE_STAGES,
  IMAGE_PROVIDER_TYPES,
  ImageProbeRunner,
  IndexedDbImageProbeStore,
  createImageProbeEvidenceBundle,
  serializeImageProbeEvidenceBundle,
  type ImageGenerationVerificationRecord,
  type ImageProbeArtifact,
  type ImageProbeEnvironment,
  type ImageProbeNetworkLikelyCause,
  type ImageProbeNetworkRequestRole,
  type ImageProbeStage,
  type ImageProbeStore,
  type ImageProviderType
} from '../../domain/imageGeneration/probe';
import {
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  comfyWorkflowTemplateSchema,
  createComfyWorkflowHash,
  createDefaultImageApiProfile,
  getImageProviderLabel,
  hasMatchingRuntimeGenerationEvidence,
  imageApiCredentialSchema,
  imageApiProfileSchema,
  parseComfyApiWorkflowJson,
  runImageLocalValidationProbe,
  runImageMetadataProbe,
  type ComfyWorkflowBindings,
  type ComfyWorkflowTemplate,
  type ImageApiCredential,
  type ImageApiCredentialSummary,
  type ImageApiProfile,
  type ImageCredentialMaterial,
  type ImageCredentialRepository,
  type ImageProfileProbeResult,
  type ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import {
  CHARACTER_VISUAL_PURPOSES,
  CHARACTER_VISUAL_PURPOSE_LABELS,
  DEFAULT_IMAGE_STYLE_PRESET_ID,
  NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID,
  DEFAULT_IMAGE_PROMPT_MODIFIERS,
  DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS,
  EMPTY_IMAGE_PROMPT_MODIFIERS,
  IMAGE_PROMPT_DIALECT_FAMILIES,
  IndexedDbImagePromptTemplateRepository,
  PROMPT_CONVERSION_TASK_LABELS,
  createCustomImagePromptDialectPreset,
  createCustomImageStylePreset,
  createEmptyImagePromptTemplateSettings,
  duplicateImagePromptDialectPreset,
  duplicateImageStylePreset,
  normalizePresetOrder,
  parseImagePromptTemplateImport,
  restoreBuiltInImagePromptDialectPreset,
  restoreBuiltInImageStylePreset,
  serializeImagePromptTemplateSettings,
  type CharacterVisualPurpose,
  type ImagePromptModifier,
  type ImagePromptDialectPreset,
  type ImagePromptModifierSet,
  type ImagePromptTemplateRepository,
  type ImagePromptTemplateSettings,
  type ImageStylePreset,
  type PromptConversionTaskKind
} from '../../domain/imageGeneration/promptConversion';
import { ImageProfileEditor } from './ImageProfileEditor';
import {
  createDefaultImageAutomationSettings,
  detachImageAutomationProfile,
  IndexedDbImageAutomationSettingsRepository,
  type ImageAutomationSettings,
  type ImageAutomationSettingsRepository
} from '../../domain/imageGeneration/automationSettings';
import {
  prepareRuntimePresetProbe,
  type RuntimeImagePreset
} from '../../domain/imageGeneration/runtimePresetProbe';
import {
  IndexedDbImageGenerationPresetRepository,
  assertComfyGenerationPresetBindings,
  createImageGenerationPreset,
  imageGenerationPresetSchema,
  type ImageGenerationPreset,
  type ImageGenerationPresetRepository,
  type ImageGenerationVariantKey
} from '../../domain/imageGeneration/generationPresets';
import { createBuiltInCharacterDraftExecutionConfig } from '../../domain/imageGeneration/characterVisualWorkflow';
import { createBuiltInSceneDraftExecutionConfig } from '../../domain/imageGeneration/sceneVisualWorkflow';
import { ImageGenerationPresetEditor } from './ImageGenerationPresetEditor';
import { ComfyStyleRecipeLibraryEditor } from './ComfyStyleRecipeLibraryEditor';
import {
  applyPngParameterDraftToGenerationPreset,
  IndexedDbPngStyleRepository,
  type PngStyleParameterDraft,
  type PngStyleRepository
} from '../../domain/imageGeneration/pngStyle';
import { PngStyleLibraryPanel } from './PngStyleLibraryPanel';

type ImageSettingsSection =
  | 'api-models'
  | 'generation-presets'
  | 'png-style-library'
  | 'automation'
  | 'prompt-templates';

interface ImageGenerationSettingsPanelProps {
  profileRepository?: ImageProfileRepository;
  credentialRepository?: ImageCredentialRepository;
  probeStore?: ImageProbeStore;
  fetchImpl?: typeof fetch;
  probeEnvironment?: ImageProbeEnvironment;
  promptTemplateRepository?: ImagePromptTemplateRepository;
  automationSettingsRepository?: ImageAutomationSettingsRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  pngStyleRepository?: PngStyleRepository;
}

const sections: Array<{ id: ImageSettingsSection; label: string }> = [
  { id: 'api-models', label: 'API 与模型' },
  { id: 'generation-presets', label: '生成预设' },
  { id: 'png-style-library', label: 'PNG画风库' },
  { id: 'automation', label: '自动化规则' },
  { id: 'prompt-templates', label: '提示词模板' }
];

const stageLabels: Record<ImageProbeStage, string> = {
  'local-validation': '本地校验',
  authentication: '认证检查',
  submit: '提交任务',
  'poll-or-wait': '排队或等待',
  download: '下载结果',
  decode: '图片解码',
  'blob-persist': '保存测试图'
};

const networkRequestRoleLabels: Record<ImageProbeNetworkRequestRole, string> = {
  'generation-submit': '提交图片生成请求',
  'task-status-poll': '查询已提交任务状态',
  'generated-image-download': '下载供应商返回的临时图片',
  'reference-image-upload': '上传参考图片',
  'provider-auxiliary': '供应商辅助请求'
};

const networkLikelyCauseLabels: Record<ImageProbeNetworkLikelyCause, string> = {
  'cors-preflight-or-response': '跨域预检或响应头未获浏览器许可',
  'cors-response': '跨域响应未获浏览器许可',
  'mixed-content': 'HTTPS 页面访问 HTTP 目标被混合内容策略阻止',
  'private-network-access': '浏览器本地网络访问权限或私网访问策略',
  'browser-network-dns-tls': '浏览器网络、VPN、DNS、证书或连接中断'
};

const TEST_PROMPT = 'a single red apple on a plain neutral background';

function imageProbeFileExtension(mimeType: string): string {
  switch (mimeType.trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/png':
    default:
      return 'png';
  }
}

const PROMPT_CONVERSION_TASKS: PromptConversionTaskKind[] = [
  'character-anchor',
  'character-anchor-from-images',
  'character-view-batch',
  'turn-scene-plan',
  'scene-shot-prompt',
  'provider-prompt-render'
];

const DIALECT_FAMILY_LABELS: Record<(typeof IMAGE_PROMPT_DIALECT_FAMILIES)[number], string> = {
  'general-english-natural': '通用英文自然语言',
  'openai-gpt-image': 'OpenAI GPT Image',
  'gemini-image': 'Gemini 原生图片',
  'chinese-natural': '通用中文自然语言',
  'generic-english-tags': '通用英文视觉标签',
  'sd-sdxl': 'Stable Diffusion／SDXL',
  pony: 'Pony',
  illustrious: 'Illustrious',
  novelai: 'NovelAI',
  flux: 'FLUX'
};

const GENERATION_VARIANTS: Array<{ key: ImageGenerationVariantKey; label: string }> = [
  ...CHARACTER_VISUAL_PURPOSES.map((purpose) => ({ key: purpose, label: CHARACTER_VISUAL_PURPOSE_LABELS[purpose] })),
  { key: 'narrative-scene', label: '正文场景图（16:9）' }
];

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    return error.issues.map((issue) => {
      if (!issue || typeof issue !== 'object') return '字段无效';
      const path = 'path' in issue && Array.isArray(issue.path) ? issue.path.join('.') : '字段';
      const message = 'message' in issue ? String(issue.message) : '无效';
      return `${path || '字段'}：${message}`;
    }).join('；');
  }
  return error instanceof Error ? error.message : '操作失败。';
}

function inferProbeEnvironment(): ImageProbeEnvironment {
  return window.location.protocol === 'https:' ? 'pages-browser' : 'local-browser';
}

function formatProbeDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '旧记录未记录';
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
}

export function ImageGenerationSettingsPanel({
  profileRepository,
  credentialRepository,
  probeStore,
  fetchImpl,
  probeEnvironment,
  promptTemplateRepository,
  automationSettingsRepository,
  generationPresetRepository,
  pngStyleRepository
}: ImageGenerationSettingsPanelProps = {}) {
  const profilesRepository = useMemo(
    () => profileRepository ?? new IndexedDbImageProfileRepository(),
    [profileRepository]
  );
  const credentialsRepository = useMemo(
    () => credentialRepository ?? new IndexedDbImageCredentialRepository(),
    [credentialRepository]
  );
  const verificationStore = useMemo(() => probeStore ?? new IndexedDbImageProbeStore(), [probeStore]);
  const promptTemplatesRepository = useMemo(
    () => promptTemplateRepository ?? new IndexedDbImagePromptTemplateRepository(),
    [promptTemplateRepository]
  );
  const automationRepository = useMemo(
    () => automationSettingsRepository ?? new IndexedDbImageAutomationSettingsRepository(),
    [automationSettingsRepository]
  );
  const generationPresetsRepository = useMemo(
    () => generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository(),
    [generationPresetRepository]
  );
  const pngStylesRepository = useMemo(
    () => pngStyleRepository ?? new IndexedDbPngStyleRepository(),
    [pngStyleRepository]
  );
  const [section, setSection] = useState<ImageSettingsSection>('api-models');
  const [profiles, setProfiles] = useState<ImageApiProfile[]>([]);
  const [credentials, setCredentials] = useState<ImageApiCredentialSummary[]>([]);
  const [workflows, setWorkflows] = useState<ComfyWorkflowTemplate[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageApiProfile | null>(null);
  const [newProviderType, setNewProviderType] = useState<ImageProviderType>('openai-images');
  const [profileStatus, setProfileStatus] = useState('');
  const [loadError, setLoadError] = useState('');
  const [profileProbeResults, setProfileProbeResults] = useState<ImageProfileProbeResult[]>([]);
  const [verificationRecords, setVerificationRecords] = useState<ImageGenerationVerificationRecord[]>([]);
  const [latestArtifact, setLatestArtifact] = useState<ImageProbeArtifact | null>(null);
  const [artifactUrl, setArtifactUrl] = useState('');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [runtimeProbePreset, setRuntimeProbePreset] = useState<RuntimeImagePreset>({
    kind: 'character',
    purpose: 'half-body-medium'
  });
  const [currentExecutionFingerprint, setCurrentExecutionFingerprint] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [generationConfirmationOpen, setGenerationConfirmationOpen] = useState(false);
  const [generationRunning, setGenerationRunning] = useState(false);
  const [generationStages, setGenerationStages] = useState<ImageProbeStage[]>([]);
  const generationControllerRef = useRef<AbortController | null>(null);
  const promptTemplateImportInputRef = useRef<HTMLInputElement | null>(null);
  const catalogInteractionRevisionRef = useRef(0);
  const promptTemplateInteractionRevisionRef = useRef(0);
  const [promptTemplateSettings, setPromptTemplateSettingsRaw] = useState<ImagePromptTemplateSettings>(
    () => createEmptyImagePromptTemplateSettings()
  );
  const setPromptTemplateSettings = useCallback<typeof setPromptTemplateSettingsRaw>((update) => {
    promptTemplateInteractionRevisionRef.current += 1;
    setPromptTemplateSettingsRaw(update);
  }, []);
  const [promptTemplateStatus, setPromptTemplateStatus] = useState('');
  const [automationSettings, setAutomationSettings] = useState<ImageAutomationSettings>(
    () => createDefaultImageAutomationSettings()
  );
  const [automationStatus, setAutomationStatus] = useState('');
  const [generationVariant, setGenerationVariant] = useState<ImageGenerationVariantKey>('half-body-medium');
  const [generationPreset, setGenerationPreset] = useState<ImageGenerationPreset | null>(null);
  const [generationPresetPersisted, setGenerationPresetPersisted] = useState(false);
  const [generationPresetStatus, setGenerationPresetStatus] = useState('');

  const persistedProfile = profiles.find((profile) => profile.profileId === selectedProfileId) ?? null;

  const buildDefaultGenerationPreset = useCallback(async (
    profile: ImageApiProfile,
    variantKey: ImageGenerationVariantKey
  ): Promise<ImageGenerationPreset> => {
    const workflow = profile.providerType === 'comfyui-workflow'
      ? workflows.find((item) => item.workflowTemplateId === selectedWorkflowId)
      : undefined;
    const execution = variantKey === 'narrative-scene'
      ? await createBuiltInSceneDraftExecutionConfig({ profile, workflow })
      : await createBuiltInCharacterDraftExecutionConfig({ profile, purpose: variantKey, workflow });
    const generationParameters = execution.generationParameters.providerType === 'comfyui-workflow' && workflow
      ? {
        ...execution.generationParameters,
        overrides: Object.fromEntries(Object.entries(execution.generationParameters.overrides)
          .filter(([key, entry]) => entry !== undefined && workflow.bindings[key as keyof typeof workflow.bindings]))
      }
      : execution.generationParameters;
    const variantLabel = GENERATION_VARIANTS.find((item) => item.key === variantKey)?.label ?? variantKey;
    return createImageGenerationPreset({
      name: `${profile.name} · ${variantLabel}`,
      profileId: profile.profileId,
      providerType: profile.providerType,
      variantKey,
      routingTarget: execution.executionTarget.kind === 'model'
        ? { kind: 'model', modelId: execution.executionTarget.modelId }
        : { kind: 'comfy-workflow', workflowTemplateId: execution.executionTarget.workflowTemplateId },
      promptDialectPresetId: execution.promptDialectPresetId,
      targetAspectRatio: execution.targetAspectRatio,
      generationParameters
    });
  }, [selectedWorkflowId, workflows]);

  const refreshCatalog = useCallback(async (preferredProfileId?: string) => {
    const [nextProfiles, nextCredentials, nextWorkflows] = await Promise.all([
      profilesRepository.listProfiles(),
      credentialsRepository.listCredentialSummaries(),
      profilesRepository.listWorkflowTemplates()
    ]);
    setProfiles(nextProfiles);
    setCredentials(nextCredentials);
    setWorkflows(nextWorkflows);
    const nextId = preferredProfileId ?? selectedProfileId ?? nextProfiles[0]?.profileId ?? null;
    const nextProfile = nextProfiles.find((profile) => profile.profileId === nextId) ?? null;
    const nextDraft = nextProfile ?? (
      nextProfiles.length === 0
        ? createDefaultImageApiProfile(newProviderType)
        : null
    );
    setSelectedProfileId(nextDraft?.profileId ?? null);
    setDraft(nextDraft ? structuredClone(nextDraft) : null);
    if (!selectedWorkflowId && nextWorkflows[0]) setSelectedWorkflowId(nextWorkflows[0].workflowTemplateId);
  }, [credentialsRepository, newProviderType, profilesRepository, selectedProfileId, selectedWorkflowId]);

  const refreshEvidence = useCallback(async (profile: ImageApiProfile | null) => {
    if (!profile) {
      setProfileProbeResults([]);
      setVerificationRecords([]);
      setLatestArtifact(null);
      return;
    }
    const [connectionRecords, generationRecords, artifact] = await Promise.all([
      profilesRepository.listProfileProbeResults(profile.profileId),
      verificationStore.listRecords(profile.profileId),
      verificationStore.getLatestArtifact(profile.profileId)
    ]);
    setProfileProbeResults(connectionRecords);
    setVerificationRecords(generationRecords);
    setLatestArtifact(artifact);
  }, [profilesRepository, verificationStore]);

  useEffect(() => {
    let active = true;
    const interactionRevision = catalogInteractionRevisionRef.current;
    void Promise.all([
      profilesRepository.listProfiles(),
      credentialsRepository.listCredentialSummaries(),
      profilesRepository.listWorkflowTemplates()
    ]).then(([nextProfiles, nextCredentials, nextWorkflows]) => {
      if (!active || catalogInteractionRevisionRef.current !== interactionRevision) return;
      setProfiles(nextProfiles);
      setCredentials(nextCredentials);
      setWorkflows(nextWorkflows);
      const initial = nextProfiles[0] ?? createDefaultImageApiProfile('openai-images');
      setSelectedProfileId(initial.profileId);
      setDraft(structuredClone(initial));
      setSelectedWorkflowId(nextWorkflows[0]?.workflowTemplateId ?? '');
    }, () => {
      if (active) setLoadError('图片档案仓库读取失败；没有改动任何档案或凭据。');
    });
    return () => {
      active = false;
      generationControllerRef.current?.abort(new DOMException('设置页已关闭。', 'AbortError'));
    };
  }, [credentialsRepository, profilesRepository]);

  useEffect(() => {
    let active = true;
    const interactionRevision = promptTemplateInteractionRevisionRef.current;
    void promptTemplatesRepository.load().then((settings) => {
      if (active && promptTemplateInteractionRevisionRef.current === interactionRevision) {
        setPromptTemplateSettingsRaw(settings);
      }
    }, () => {
      if (active) setPromptTemplateStatus('提示词模板读取失败；当前显示空模板，尚未覆盖原数据。');
    });
    return () => { active = false; };
  }, [promptTemplatesRepository]);

  useEffect(() => {
    let active = true;
    void automationRepository.load().then((settings) => {
      if (active) setAutomationSettings(settings);
    }, () => {
      if (active) setAutomationStatus('自动化设置读取失败；当前显示安全的手动默认值，尚未覆盖原数据。');
    });
    return () => { active = false; };
  }, [automationRepository]);

  useEffect(() => {
    let active = true;
    if (!persistedProfile || section !== 'generation-presets') {
      setGenerationPreset(null);
      setGenerationPresetPersisted(false);
      return () => { active = false; };
    }
    setGenerationPreset(null);
    setGenerationPresetPersisted(false);
    setGenerationPresetStatus('正在读取当前生成预设。');
    void generationPresetsRepository.get(persistedProfile.profileId, generationVariant).then(async (saved) => {
      if (saved) return { preset: saved, persisted: true };
      return { preset: await buildDefaultGenerationPreset(persistedProfile, generationVariant), persisted: false };
    }).then(({ preset, persisted }) => {
      if (!active) return;
      const presetWorkflowTemplateId = preset.routingTarget.kind === 'comfy-workflow'
        ? preset.routingTarget.workflowTemplateId
        : undefined;
      if (
        presetWorkflowTemplateId &&
        workflows.some((workflow) => workflow.workflowTemplateId === presetWorkflowTemplateId)
      ) {
        setSelectedWorkflowId(presetWorkflowTemplateId);
      }
      setGenerationPreset(preset);
      setGenerationPresetPersisted(persisted);
      setGenerationPresetStatus(persisted
        ? `已载入玩家预设修订 ${preset.revision}。`
        : '当前使用内置默认值；修改并保存后才会建立玩家预设。');
    }).catch((error) => {
      if (!active) return;
      setGenerationPreset(null);
      setGenerationPresetPersisted(false);
      setGenerationPresetStatus(errorMessage(error));
    });
    return () => { active = false; };
  }, [buildDefaultGenerationPreset, generationPresetsRepository, generationVariant, persistedProfile, section, workflows]);

  const updateAutomation = <K extends keyof ImageAutomationSettings>(key: K, value: ImageAutomationSettings[K]) => {
    setAutomationSettings((current) => ({ ...current, [key]: value }));
    setAutomationStatus('有未保存的自动化设置修改。');
  };

  const saveAutomation = async () => {
    const next = {
      ...automationSettings,
      revision: automationSettings.revision + 1,
      updatedAt: new Date().toISOString()
    };
    try {
      const validateRoute = (label: string, profileId?: string, workflowTemplateId?: string) => {
        if (!profileId) throw new Error(`${label}必须明确选择图片档案。`);
        const profile = profiles.find((item) => item.profileId === profileId);
        if (!profile?.enabled) throw new Error(`${label}图片档案不存在或尚未启用。`);
        if (profile.providerType === 'comfyui-workflow' && !workflowTemplateId) {
          throw new Error(`${label}使用 ComfyUI 时必须明确选择 API 工作流模板。`);
        }
      };
      const characterRouteNeeded = next.characterMode === 'automatic' || (
        next.sceneMode === 'automatic' && next.sceneAutomaticRouting === 'character-default'
      );
      if (characterRouteNeeded) {
        validateRoute('人物默认自动路由', next.characterAutomaticProfileId, next.characterAutomaticWorkflowTemplateId);
      }
      if (next.sceneMode === 'automatic' && next.sceneAutomaticRouting === 'separate') {
        validateRoute('场景独立自动路由', next.sceneAutomaticProfileId, next.sceneAutomaticWorkflowTemplateId);
      }
      await automationRepository.save(next);
      setAutomationSettings(next);
      setAutomationStatus('自动化规则已保存。自动任务仍必须通过当前执行指纹的真实生成证据硬门。');
    } catch (error) {
      setAutomationStatus(errorMessage(error));
    }
  };

  const updatePromptModifier = (
    sectionId: 'global' | 'characterCommon' | 'narrativeScene',
    value: ImagePromptModifier
  ) => {
    setPromptTemplateSettings((current) => ({
      ...current,
      modifierDefaultsState: 'custom',
      modifiers: { ...current.modifiers, [sectionId]: value }
    }));
    setPromptTemplateStatus('有未保存的模板修改。');
  };

  const updateCharacterViewModifier = (purpose: keyof ImagePromptModifierSet['characterViews'], value: ImagePromptModifier) => {
    setPromptTemplateSettings((current) => ({
      ...current,
      modifierDefaultsState: 'custom',
      modifiers: {
        ...current.modifiers,
        characterViews: { ...current.modifiers.characterViews, [purpose]: value }
      }
    }));
    setPromptTemplateStatus('有未保存的模板修改。');
  };

  const updateConversionInstruction = (taskKind: PromptConversionTaskKind, value: string) => {
    setPromptTemplateSettings((current) => ({
      ...current,
      conversionInstructions: { ...current.conversionInstructions, [taskKind]: value }
    }));
    setPromptTemplateStatus('有未保存的转换任务指令修改。');
  };

  const updateStylePreset = (stylePresetId: string, update: (preset: ImageStylePreset) => ImageStylePreset) => {
    setPromptTemplateSettings((current) => ({
      ...current,
      stylePresets: current.stylePresets.map((preset) => preset.stylePresetId === stylePresetId
        ? update(structuredClone(preset))
        : preset)
    }));
    setPromptTemplateStatus('有未保存的图片风格修改。');
  };

  const updateDialectPreset = (
    dialectPresetId: string,
    update: (preset: ImagePromptDialectPreset) => ImagePromptDialectPreset
  ) => {
    setPromptTemplateSettings((current) => ({
      ...current,
      dialectPresets: current.dialectPresets.map((preset) => preset.dialectPresetId === dialectPresetId
        ? update(structuredClone(preset))
        : preset)
    }));
    setPromptTemplateStatus('有未保存的模型提示词格式修改。');
  };

  const movePreset = (kind: 'style' | 'dialect', presetId: string, direction: -1 | 1) => {
    setPromptTemplateSettings((current) => {
      const source = kind === 'style' ? current.stylePresets : current.dialectPresets;
      const idOf = (preset: ImageStylePreset | ImagePromptDialectPreset) =>
        'stylePresetId' in preset ? preset.stylePresetId : preset.dialectPresetId;
      const index = source.findIndex((preset) => idOf(preset) === presetId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= source.length) return current;
      const reordered = [...source];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return kind === 'style'
        ? { ...current, stylePresets: normalizePresetOrder(reordered as ImageStylePreset[]) }
        : { ...current, dialectPresets: normalizePresetOrder(reordered as ImagePromptDialectPreset[]) };
    });
    setPromptTemplateStatus('有未保存的预设顺序修改。');
  };

  const savePromptTemplates = async () => {
    const next = {
      ...promptTemplateSettings,
      revision: promptTemplateSettings.revision + 1,
      updatedAt: new Date().toISOString()
    };
    try {
      await promptTemplatesRepository.save(next);
      setPromptTemplateSettings(next);
      setPromptTemplateStatus(`已保存模板修订 ${next.revision}；只影响之后重新预览的请求。`);
    } catch (error) {
      setPromptTemplateStatus(errorMessage(error));
    }
  };

  const saveGenerationPreset = async () => {
    if (!generationPreset || !persistedProfile) return;
    try {
      const now = new Date().toISOString();
      const next = imageGenerationPresetSchema.parse({
        ...generationPreset,
        revision: generationPresetPersisted ? generationPreset.revision + 1 : 1,
        updatedAt: now
      });
      if (
        next.profileId !== persistedProfile.profileId ||
        next.providerType !== persistedProfile.providerType ||
        next.variantKey !== generationVariant
      ) {
        throw new Error('生成预设与当前图片档案或视觉用途不一致；请重新载入后再保存。');
      }
      if (next.routingTarget.kind === 'comfy-workflow') {
        const workflowTemplateId = next.routingTarget.workflowTemplateId;
        const workflow = workflows.find((item) => item.workflowTemplateId === workflowTemplateId);
        if (!workflow) throw new Error('生成预设绑定的 ComfyUI 工作流不存在。');
        assertComfyGenerationPresetBindings(next, workflow);
      } else {
        const modelId = next.routingTarget.modelId;
        if (
          !('models' in persistedProfile) ||
          !persistedProfile.models.some((model) => model.modelId === modelId)
        ) {
          throw new Error('生成预设绑定的模型已不在当前图片档案中。');
        }
      }
      await generationPresetsRepository.save(next);
      setGenerationPreset(next);
      setGenerationPresetPersisted(true);
      setGenerationPresetStatus(`生成预设修订 ${next.revision} 已保存；新的执行指纹必须重新通过真实生成测试。`);
    } catch (error) {
      setGenerationPresetStatus(errorMessage(error));
    }
  };

  const restoreBuiltInGenerationPreset = async () => {
    if (!persistedProfile) return;
    try {
      await generationPresetsRepository.delete(persistedProfile.profileId, generationVariant);
      const next = await buildDefaultGenerationPreset(persistedProfile, generationVariant);
      setGenerationPreset(next);
      setGenerationPresetPersisted(false);
      setGenerationPresetStatus('玩家预设已删除，当前恢复内置默认值；已有图片和冻结任务没有改变。');
    } catch (error) {
      setGenerationPresetStatus(errorMessage(error));
    }
  };

  const applyPngParameterDraft = (
    draft: PngStyleParameterDraft,
    presetName: string
  ): string => {
    if (!generationPreset) return '请先在“生成预设”选择一个已保存图片档案与用途。';
    try {
      const applied = applyPngParameterDraftToGenerationPreset(generationPreset, draft);
      if (!applied.appliedFields.length) {
        return `“${presetName}”的参数草稿与当前供应商不兼容，没有修改生成预设。`;
      }
      setGenerationPreset(applied.preset);
      setGenerationPresetStatus(
        `已从“${presetName}”载入参数草稿：${applied.appliedFields.join('、')}。` +
        `${applied.skippedFields.length ? ` 未采用：${applied.skippedFields.join('、')}。` : ''}` +
        ' 尚未保存，请核对后保存生成预设。'
      );
      setSection('generation-presets');
      return `参数草稿已放入当前生成预设编辑区：${applied.appliedFields.join('、')}；尚未保存。`;
    } catch (error) {
      return errorMessage(error);
    }
  };

  const exportPromptTemplates = () => {
    try {
      const payload = serializeImagePromptTemplateSettings(promptTemplateSettings);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sorry-im-a-cop-v2-image-prompt-templates-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPromptTemplateStatus('已导出当前编辑区模板；文件不包含 API、凭据、图片或图片档案。');
    } catch (error) {
      setPromptTemplateStatus(errorMessage(error));
    }
  };

  const importPromptTemplates = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('模板文件超过 2 MB，请先精简后再导入。');
      }
      const imported = parseImagePromptTemplateImport(await file.text(), promptTemplateSettings);
      setPromptTemplateSettings(imported);
      setPromptTemplateStatus('模板已载入编辑区；请检查内容并点击“保存提示词设置”后才会生效。');
    } catch (error) {
      setPromptTemplateStatus(`导入失败：${errorMessage(error)}`);
    }
  };

  useEffect(() => {
    void refreshEvidence(persistedProfile);
  }, [persistedProfile, refreshEvidence]);

  useEffect(() => {
    if (!latestArtifact || typeof URL.createObjectURL !== 'function') {
      setArtifactUrl('');
      return;
    }
    const url = URL.createObjectURL(latestArtifact.blob);
    setArtifactUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [latestArtifact]);

  useEffect(() => {
    let active = true;
    const calculate = async () => {
      if (!persistedProfile) {
        if (active) setCurrentExecutionFingerprint('');
        return;
      }
      try {
        const credential = persistedProfile.credentialId
          ? await credentialsRepository.resolveCredential(persistedProfile.credentialId)
          : undefined;
        const workflow = persistedProfile.providerType === 'comfyui-workflow'
          ? workflows.find((item) => item.workflowTemplateId === selectedWorkflowId)
          : undefined;
        const variantKey = runtimeProbePreset.kind === 'scene' ? 'narrative-scene' : runtimeProbePreset.purpose;
        const savedPreset = await generationPresetsRepository.get(persistedProfile.profileId, variantKey);
        const prepared = await prepareRuntimePresetProbe({
          profile: persistedProfile,
          credential: credential ?? undefined,
          workflow,
          preset: runtimeProbePreset,
          generationPreset: savedPreset,
          pageUrl: window.location.href
        });
        if (active) setCurrentExecutionFingerprint(prepared.executionFingerprint);
      } catch {
        if (active) setCurrentExecutionFingerprint('');
      }
    };
    void calculate();
    return () => {
      active = false;
    };
  }, [
    credentialsRepository,
    generationPreset?.revision,
    generationPresetPersisted,
    generationPresetsRepository,
    persistedProfile,
    runtimeProbePreset,
    selectedWorkflowId,
    workflows
  ]);

  const selectProfile = (profile: ImageApiProfile) => {
    catalogInteractionRevisionRef.current += 1;
    setSelectedProfileId(profile.profileId);
    setDraft(structuredClone(profile));
    setProfileStatus('');
    setTestStatus('');
  };

  const createProfile = () => {
    catalogInteractionRevisionRef.current += 1;
    const profile = createDefaultImageApiProfile(newProviderType);
    setSelectedProfileId(profile.profileId);
    setDraft(profile);
    setProfileStatus('新档案尚未保存；测试按钮只对已保存档案生效。');
    setTestStatus('');
  };

  const saveProfile = async () => {
    if (!draft) return;
    setProfileStatus('');
    try {
      const existing = profiles.find((profile) => profile.profileId === draft.profileId);
      const now = new Date().toISOString();
      const next = imageApiProfileSchema.parse({
        ...draft,
        revision: existing ? existing.revision + 1 : 1,
        createdAt: existing?.createdAt ?? draft.createdAt,
        updatedAt: now
      });
      await profilesRepository.putProfile(next);
      await refreshCatalog(next.profileId);
      setProfileStatus('图片档案已保存；凭据未复制到档案记录。');
    } catch (error) {
      setProfileStatus(errorMessage(error));
    }
  };

  const deleteProfile = async () => {
    if (!persistedProfile) return;
    if (!window.confirm(`删除图片档案“${persistedProfile.name}”？关联生成预设和测试证据会删除；凭据和已生成图片不会随之删除。`)) return;
    const detachedAutomationSettings = detachImageAutomationProfile(
      automationSettings,
      persistedProfile.profileId
    );
    await Promise.all([
      profilesRepository.clearProfileProbeResults(persistedProfile.profileId),
      verificationStore.clearProfile(persistedProfile.profileId),
      generationPresetsRepository.clearProfile(persistedProfile.profileId),
      ...(detachedAutomationSettings ? [automationRepository.save(detachedAutomationSettings)] : [])
    ]);
    await profilesRepository.deleteProfile(persistedProfile.profileId);
    if (detachedAutomationSettings) setAutomationSettings(detachedAutomationSettings);
    setSelectedProfileId(null);
    setDraft(null);
    await refreshCatalog();
    setTestStatus('');
    setGenerationStages([]);
    setProfileStatus('图片档案、关联预设和测试证据已删除；独立凭据和已生成图片未删除。');
  };

  const saveCredential = async (input: {
    label: string;
    material: ImageCredentialMaterial;
    providerAffinity: ImageApiCredentialSummary['providerAffinity'];
  }): Promise<string> => {
    const now = new Date().toISOString();
    const credential = imageApiCredentialSchema.parse({
      credentialId: crypto.randomUUID(),
      label: input.label,
      providerAffinity: input.providerAffinity,
      material: input.material,
      revision: 1,
      createdAt: now,
      updatedAt: now
    });
    await credentialsRepository.putCredential(credential);
    setCredentials(await credentialsRepository.listCredentialSummaries());
    return credential.credentialId;
  };

  const saveWorkflow = async (input: {
    name: string;
    apiWorkflowText: string;
    bindings: ComfyWorkflowBindings;
    exposedParameters: ComfyWorkflowTemplate['exposedParameters'];
    outputNodeIds: string[];
  }) => {
    if (!input.name) throw new Error('请填写工作流模板名称。');
    const { apiWorkflow } = parseComfyApiWorkflowJson(input.apiWorkflowText);
    const bindings = input.bindings;
    const exposedParameters = input.exposedParameters ?? [];
    const now = new Date().toISOString();
    const workflow = comfyWorkflowTemplateSchema.parse({
      workflowTemplateId: crypto.randomUUID(),
      name: input.name,
      apiWorkflow,
      workflowHash: await createComfyWorkflowHash({
        apiWorkflow,
        bindings,
        exposedParameters,
        outputNodeIds: input.outputNodeIds
      }),
      bindings,
      exposedParameters,
      outputNodeIds: input.outputNodeIds,
      revision: 1,
      createdAt: now,
      updatedAt: now
    });
    await profilesRepository.putWorkflowTemplate(workflow);
    const nextWorkflows = await profilesRepository.listWorkflowTemplates();
    setWorkflows(nextWorkflows);
    setSelectedWorkflowId(workflow.workflowTemplateId);
  };

  const deleteWorkflow = async (workflow: ComfyWorkflowTemplate): Promise<boolean> => {
    const savedProfiles = await profilesRepository.listProfiles();
    const [presetGroups, savedAutomationSettings] = await Promise.all([
      Promise.all(savedProfiles.map(async (profile) => ({
        profile,
        presets: await generationPresetsRepository.list(profile.profileId)
      }))),
      automationRepository.load()
    ]);
    const presetReferences = presetGroups.flatMap(({ profile, presets }) =>
      presets
        .filter((preset) =>
          preset.routingTarget.kind === 'comfy-workflow' &&
          preset.routingTarget.workflowTemplateId === workflow.workflowTemplateId
        )
        .map((preset) => `${profile.name}／${preset.name}`)
    );
    const automationReferences = [
      savedAutomationSettings.characterAutomaticWorkflowTemplateId === workflow.workflowTemplateId
        ? '自动化规则／人物图' : undefined,
      savedAutomationSettings.sceneAutomaticWorkflowTemplateId === workflow.workflowTemplateId
        ? '自动化规则／场景图' : undefined
    ].filter((reference): reference is string => Boolean(reference));
    const references = [...presetReferences, ...automationReferences];
    if (references.length) {
      throw new Error(
        `不能删除 API 工作流“${workflow.name}”：仍被 ${references.join('、')} 使用。请先切换或删除这些生成预设／自动化绑定。`
      );
    }
    if (!window.confirm(
      `删除 API 工作流“${workflow.name}”？工作流 JSON 和节点绑定会从本机移除；已经生成的图片与历史任务记录不会删除。`
    )) return false;

    await profilesRepository.deleteWorkflowTemplate(workflow.workflowTemplateId);
    const nextWorkflows = await profilesRepository.listWorkflowTemplates();
    setWorkflows(nextWorkflows);
    if (selectedWorkflowId === workflow.workflowTemplateId) {
      setSelectedWorkflowId(nextWorkflows[0]?.workflowTemplateId ?? '');
      setTestStatus('');
      setGenerationStages([]);
    }
    return true;
  };

  const resolveProfileCredential = async (profile: ImageApiProfile): Promise<ImageApiCredential | undefined> => {
    if (!profile.credentialId) return undefined;
    return (await credentialsRepository.resolveCredential(profile.credentialId)) ?? undefined;
  };

  const runLocalValidation = async () => {
    if (!persistedProfile) return;
    setTestStatus('正在执行本地校验；不会发送网络请求。');
    const result = await runImageLocalValidationProbe(
      persistedProfile,
      await resolveProfileCredential(persistedProfile),
      { pageUrl: window.location.href }
    );
    await profilesRepository.putProfileProbeResult(result);
    await refreshEvidence(persistedProfile);
    setTestStatus(result.safeMessage);
  };

  const runMetadata = async () => {
    if (!persistedProfile) return;
    setTestStatus('正在读取低成本元数据；不会提交图片生成。');
    const result = await runImageMetadataProbe(
      persistedProfile,
      await resolveProfileCredential(persistedProfile),
      { fetch: fetchImpl, pageUrl: window.location.href }
    );
    await profilesRepository.putProfileProbeResult(result);
    await refreshEvidence(persistedProfile);
    setTestStatus(result.safeMessage);
  };

  const prepareCurrentGeneration = async () => {
    if (!persistedProfile) throw new Error('请先保存并选择图片档案。');
    const workflow = persistedProfile.providerType === 'comfyui-workflow'
      ? workflows.find((item) => item.workflowTemplateId === selectedWorkflowId)
      : undefined;
    const variantKey = runtimeProbePreset.kind === 'scene' ? 'narrative-scene' : runtimeProbePreset.purpose;
    const savedPreset = await generationPresetsRepository.get(persistedProfile.profileId, variantKey);
    return prepareRuntimePresetProbe({
      profile: persistedProfile,
      credential: await resolveProfileCredential(persistedProfile),
      workflow,
      preset: runtimeProbePreset,
      generationPreset: savedPreset,
      pageUrl: window.location.href
    });
  };

  const requestGenerationConfirmation = async () => {
    setTestStatus('');
    try {
      await prepareCurrentGeneration();
      setGenerationConfirmationOpen(true);
    } catch (error) {
      setTestStatus(errorMessage(error));
    }
  };

  const runGenerationProbe = async () => {
    if (!persistedProfile) return;
    setGenerationConfirmationOpen(false);
    setGenerationRunning(true);
    setGenerationStages([]);
    setTestStatus('真实生成测试运行中；请勿关闭页面。');
    const controller = new AbortController();
    generationControllerRef.current = controller;
    try {
      const prepared = await prepareCurrentGeneration();
      const runner = new ImageProbeRunner({ store: verificationStore, fetch: fetchImpl });
      const record = await runner.run({
        adapter: prepared.adapter,
        scope: 'runtime-profile',
        profileId: persistedProfile.profileId,
        environment: probeEnvironment ?? inferProbeEnvironment(),
        adapterRevision: 'p1-a',
        connectionFingerprint: prepared.connectionFingerprint,
        executionFingerprint: prepared.executionFingerprint,
        prompt: TEST_PROMPT,
        profile: prepared.profile,
        credential: prepared.credential,
        signal: controller.signal,
        onStage: (stage) => setGenerationStages((current) => current.includes(stage) ? current : [...current, stage])
      });
      await refreshEvidence(persistedProfile);
      setCurrentExecutionFingerprint(prepared.executionFingerprint);
      setTestStatus(`${record.verdict}：${record.safeSummary}`);
    } catch (error) {
      setTestStatus(errorMessage(error));
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
      setGenerationRunning(false);
    }
  };

  const clearTests = async () => {
    if (!persistedProfile) return;
    if (!window.confirm('清除当前图片档案的本地校验、元数据和真实生成测试记录？自动模式能力也会立即失效。')) return;
    await Promise.all([
      profilesRepository.clearProfileProbeResults(persistedProfile.profileId),
      verificationStore.clearProfile(persistedProfile.profileId)
    ]);
    await refreshEvidence(persistedProfile);
    setCurrentExecutionFingerprint('');
    setGenerationStages([]);
    setTestStatus('当前档案测试记录已清除；档案与凭据未删除。');
  };

  const exportProbeEvidence = () => {
    if (!persistedProfile || verificationRecords.length === 0) return;
    try {
      const bundle = createImageProbeEvidenceBundle({
        profileId: persistedProfile.profileId,
        providerType: persistedProfile.providerType,
        records: verificationRecords,
        latestArtifact
      });
      const blob = new Blob([serializeImageProbeEvidenceBundle(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeProfileId = persistedProfile.profileId.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80);
      anchor.href = url;
      anchor.download = `image-probe-evidence-${safeProfileId}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setTestStatus('已下载当前档案的脱敏证据 JSON；不含凭据、档案配置、提示词或图片二进制。');
    } catch (error) {
      setTestStatus(`脱敏证据导出失败：${errorMessage(error)}`);
    }
  };

  const automationReady = Boolean(
    persistedProfile &&
    currentExecutionFingerprint &&
    hasMatchingRuntimeGenerationEvidence(verificationRecords, persistedProfile.profileId, currentExecutionFingerprint)
  );
  const stylePresetNames = new Map(
    promptTemplateSettings.stylePresets.map((preset) => [preset.stylePresetId, preset.name])
  );
  const globalStyleName = stylePresetNames.get(promptTemplateSettings.styleSelection.globalStylePresetId)
    ?? promptTemplateSettings.styleSelection.globalStylePresetId;
  const characterSpecificStyleName = promptTemplateSettings.styleSelection.characterStylePresetId
    ? stylePresetNames.get(promptTemplateSettings.styleSelection.characterStylePresetId)
    : undefined;
  const sceneSpecificStyleName = promptTemplateSettings.styleSelection.narrativeSceneStylePresetId
    ? stylePresetNames.get(promptTemplateSettings.styleSelection.narrativeSceneStylePresetId)
    : undefined;

  return (
    <section className="settings-panel image-generation-settings-panel">
      <div className="settings-topline">
        <div>
          <h2>文生图设置</h2>
          <p className="muted">图片档案、凭据、测试证据与游戏存档相互隔离；不会改动已经生成的图片。</p>
        </div>
        <span className="image-settings-phase-badge">v{APP_VERSION} · 正式版</span>
      </div>

      <div className="image-settings-tabs" role="tablist" aria-label="文生图设置分区">
        {sections.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="settings-page-scroll image-settings-scroll">
        {section === 'api-models' ? (
          <>
            {loadError ? <p className="image-settings-error" role="alert">{loadError}</p> : null}
            <section className="settings-section image-settings-profile" aria-labelledby="current-image-profile-title">
              <div className="image-settings-section-heading">
                <div><p className="image-settings-kicker">IMAGE API PROFILES</p><h3 id="current-image-profile-title">当前图片档案</h3></div>
                <span data-status={profiles.length ? 'configured' : 'unconfigured'}>{profiles.length ? `${profiles.length} 个本机档案` : '尚未配置'}</span>
              </div>
              <div className="image-profile-create-row">
                <label>后端类型<select aria-label="新增图片档案后端" value={newProviderType} onChange={(event) => setNewProviderType(event.target.value as ImageProviderType)}>
                  {IMAGE_PROVIDER_TYPES.map((providerType) => <option key={providerType} value={providerType}>{getImageProviderLabel(providerType)}</option>)}
                </select></label>
                <button type="button" onClick={createProfile}>新增图片档案</button>
              </div>
              {profiles.length ? (
                <div className="image-profile-list" aria-label="已保存图片档案">
                  {profiles.map((profile) => <button key={profile.profileId} type="button" className={selectedProfileId === profile.profileId ? 'active' : ''} onClick={() => selectProfile(profile)}><strong>{profile.name}</strong><span>{getImageProviderLabel(profile.providerType)} · {profile.enabled ? '启用' : '关闭'}</span></button>)}
                </div>
              ) : <p className="muted">还没有已保存档案。下方已经展开 API 地址表单；如需其他服务商，先选择后端再点“新增图片档案”。只支持七种批准后端，不支持任意供应商 JSON 或脚本。</p>}

              {draft ? (
                <>
                  <ImageProfileEditor
                    key={draft.profileId}
                    profile={draft}
                    credentials={credentials}
                    workflows={workflows}
                    onChange={setDraft}
                    onSaveCredential={saveCredential}
                    onSaveWorkflow={saveWorkflow}
                    onDeleteWorkflow={deleteWorkflow}
                  />
                  <div className="image-profile-save-actions">
                    <button type="button" className="image-settings-primary" onClick={() => void saveProfile()}>保存图片档案</button>
                    <button type="button" disabled={!persistedProfile} onClick={() => void deleteProfile()}>删除档案</button>
                  </div>
                </>
              ) : null}
              {profileStatus ? <p className="image-settings-gate-note" role="status">{profileStatus}</p> : null}
            </section>

            <section className="settings-section" aria-labelledby="image-profile-tests-title">
              <div className="image-settings-section-heading">
                <div><p className="image-settings-kicker">RUNTIME PROFILE VERIFICATION</p><h3 id="image-profile-tests-title">当前档案测试</h3></div>
                <span data-status={automationReady ? 'ready' : 'locked'}>{automationReady ? '自动模式证据有效' : '自动模式已锁定'}</span>
              </div>
              {!persistedProfile ? <p className="muted">请先保存图片档案，再执行三层测试。</p> : (
                <>
                  {persistedProfile.providerType === 'comfyui-workflow' ? (
                    <label className="image-settings-workflow-select">生成测试工作流<select value={selectedWorkflowId} onChange={(event) => setSelectedWorkflowId(event.target.value)}><option value="">请选择</option>{workflows.map((workflow) => <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name}</option>)}</select></label>
                  ) : null}
                  <label className="image-settings-workflow-select">运行时测试规格
                    <select value={runtimeProbePreset.kind === 'scene' ? 'scene' : runtimeProbePreset.purpose} onChange={(event) => {
                      const value = event.target.value;
                      setRuntimeProbePreset(value === 'scene'
                        ? { kind: 'scene' }
                        : { kind: 'character', purpose: value as CharacterVisualPurpose });
                    }}>
                      {CHARACTER_VISUAL_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>人物 · {CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</option>)}
                      <option value="scene">正文场景图 · 16:9</option>
                    </select>
                  </label>
                  <div className="image-settings-probe-grid">
                    <article><strong>01 · 检查配置</strong><p>只校验地址、字段、凭据引用和浏览器风险，不发送网络请求。</p><button type="button" disabled={generationRunning} onClick={() => void runLocalValidation()}>检查配置</button></article>
                    <article><strong>02 · 测试连接</strong><p>读取固定廉价元数据端点；不生图，也不能证明图片生成成功。</p><button type="button" disabled={generationRunning} onClick={() => void runMetadata()}>测试连接</button></article>
                    <article><strong>03 · 生成测试图</strong><p>可能计费、排队或占用显存；每次必须确认，测试图只进 ProbeStore。</p><button type="button" disabled={generationRunning} onClick={() => void requestGenerationConfirmation()}>{generationRunning ? '测试运行中…' : '生成测试图'}</button></article>
                  </div>
                </>
              )}
              {testStatus ? <p className="image-settings-gate-note" role="status">{testStatus}</p> : null}
              {generationStages.length ? (
                <ol className="image-settings-stage-list" aria-label="生成测试阶段">
                  {IMAGE_PROBE_STAGES.map((stage) => <li key={stage} data-complete={generationStages.includes(stage)}><span>{stageLabels[stage]}</span><small>{generationStages.includes(stage) ? '已到达' : '等待'}</small></li>)}
                </ol>
              ) : null}
              {latestArtifact ? (
                <div className="image-settings-test-artifact">
                  {artifactUrl ? <img src={artifactUrl} alt="当前档案最新生成测试图" /> : null}
                  <div><strong>独立测试图</strong><p>{latestArtifact.mimeType} · {latestArtifact.byteLength} bytes</p>{artifactUrl ? <a href={artifactUrl} download={`image-probe-${latestArtifact.artifactId}.${imageProbeFileExtension(latestArtifact.mimeType)}`}>下载测试图</a> : null}</div>
                </div>
              ) : null}
              {profileProbeResults.length || verificationRecords.length ? (
                <div className="image-settings-evidence-list">
                  <h4>脱敏测试记录</h4>
                  {profileProbeResults.map((record) => (
                    <article key={record.probeId}>
                      <strong>{record.kind} · {record.status}</strong>
                      <span>{record.completedAt}</span><p>{record.safeMessage}</p>
                    </article>
                  ))}
                  {verificationRecords.map((record) => (
                    <article key={record.verificationId} data-verdict={record.verdict}>
                      <strong>{record.verdict} · {record.environment}</strong>
                      <span>{record.completedAt}</span><p>{record.safeSummary}</p>
                      <dl className="image-settings-evidence-facts">
                        <div><dt>总耗时</dt><dd>{formatProbeDuration(record.durationMs)}</dd></div>
                        <div><dt>供应商请求 ID</dt><dd><code>{record.providerRequestId ?? '供应商未返回'}</code></dd></div>
                        <div><dt>完成阶段</dt><dd>{record.completedStages.map((stage) => stageLabels[stage]).join(' → ')}</dd></div>
                        <div><dt>执行指纹</dt><dd><code>{record.executionFingerprint ?? '无'}</code></dd></div>
                        <div><dt>连接指纹</dt><dd><code>{record.connectionFingerprint ?? '无'}</code></dd></div>
                        {record.blockerOrFailureCode ? <div><dt>失败/阻断码</dt><dd><code>{record.blockerOrFailureCode}</code></dd></div> : null}
                        {record.networkFailure ? (
                          <>
                            <div><dt>失败请求环节</dt><dd>{networkRequestRoleLabels[record.networkFailure.requestRole]}</dd></div>
                            <div><dt>请求目标</dt><dd><code>{record.networkFailure.method} {record.networkFailure.targetOrigin ?? '浏览器未能解析'}</code></dd></div>
                            <div><dt>是否取得 HTTP 响应</dt><dd>否；浏览器在响应可读前拒绝或中断</dd></div>
                            <div><dt>页面来源</dt><dd><code>{record.networkFailure.pageOrigin ?? '当前环境未提供'}</code></dd></div>
                            <div><dt>跨域与预检</dt><dd>{record.networkFailure.crossOrigin === undefined
                              ? '无法判断'
                              : `${record.networkFailure.crossOrigin ? '跨域' : '同源'}；${record.networkFailure.corsPreflightExpected ? '预计触发 OPTIONS 预检' : '未识别到必然预检条件'}`}</dd></div>
                            <div><dt>可能原因（非定论）</dt><dd>{record.networkFailure.likelyCauses.map((cause) => networkLikelyCauseLabels[cause]).join('；')}</dd></div>
                          </>
                        ) : null}
                      </dl>
                    </article>
                  ))}
                </div>
              ) : null}
              <div className="image-profile-save-actions">
                <button type="button" disabled={!persistedProfile || verificationRecords.length === 0 || generationRunning} onClick={exportProbeEvidence}>下载脱敏证据 JSON</button>
                <button type="button" disabled={!persistedProfile || generationRunning} onClick={() => void clearTests()}>清除当前档案测试记录</button>
                <button type="button" disabled={!generationRunning} onClick={() => generationControllerRef.current?.abort(new DOMException('玩家取消生成测试。', 'AbortError'))}>取消生成测试</button>
              </div>
              <p className="muted">只有当前执行指纹匹配的运行时 `real-passed` 能解除自动模式硬锁；模拟证据、元数据通过和旧指纹均无效。</p>
            </section>
          </>
        ) : null}

        {section === 'generation-presets' ? (
          <section className="settings-section" aria-label="生成预设设置">
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">TYPED GENERATION PRESETS</p><h3>生成预设</h3></div>
              <span>{generationPresetPersisted && generationPreset ? `修订 ${generationPreset.revision}` : '内置默认'}</span>
            </div>
            <p>每个图片档案分别保存五种用途的类型化参数。预设会同时用于手动人物图、场景图、自动任务和同规格真实生成测试；不支持任意供应商 JSON。</p>
            {!persistedProfile ? (
              <p className="image-settings-empty">请先在“API 与模型”中新建、启用并保存一个图片档案。</p>
            ) : (
              <>
                <p className="muted">当前档案：{persistedProfile.name} · {getImageProviderLabel(persistedProfile.providerType)}</p>
                <div className="image-settings-tabs" role="tablist" aria-label="生成预设视觉用途">
                  {GENERATION_VARIANTS.map((variant) => <button
                    key={variant.key}
                    type="button"
                    role="tab"
                    aria-selected={generationVariant === variant.key}
                    className={generationVariant === variant.key ? 'active' : ''}
                    onClick={() => setGenerationVariant(variant.key)}
                  >{variant.label}</button>)}
                </div>
                {generationPreset ? <ImageGenerationPresetEditor
                  value={generationPreset}
                  profile={persistedProfile}
                  workflows={workflows}
                  dialectPresets={promptTemplateSettings.dialectPresets}
                  stylePresets={promptTemplateSettings.stylePresets}
                  comfyStyleRecipes={promptTemplateSettings.comfyStyleRecipes}
                  onSelectCompanionStyle={(stylePresetId) => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      styleSelection: generationVariant === 'narrative-scene'
                        ? {
                            ...current.styleSelection,
                            narrativeSceneStylePresetId: stylePresetId,
                            narrativeSceneStyleMode: 'replace-global'
                          }
                        : {
                            ...current.styleSelection,
                            characterStylePresetId: stylePresetId,
                            characterStyleMode: 'replace-global'
                          }
                    }));
                    setPromptTemplateStatus('已在编辑区同步配套提示词风格；还需到“提示词模板”保存后才会生效。');
                    setGenerationPresetStatus('已同步配套提示词风格；生成预设和提示词模板需要分别保存。');
                  }}
                  onChange={(next) => {
                    setGenerationPreset(next);
                    setGenerationPresetStatus('有未保存的生成预设修改。');
                  }}
                /> : null}
                <div className="image-profile-save-actions">
                  <button type="button" className="image-settings-primary" disabled={!generationPreset} onClick={() => void saveGenerationPreset()}>保存生成预设</button>
                  <button type="button" disabled={!generationPreset} onClick={() => void restoreBuiltInGenerationPreset()}>恢复内置默认</button>
                </div>
              </>
            )}
            {generationPresetStatus ? <p className="image-settings-gate-note" role="status">{generationPresetStatus}</p> : null}
            <p className="muted">保存或恢复会改变之后任务的执行指纹；已经确认、提交或生成的图片继续使用各自冻结快照，不会被追溯修改。</p>
          </section>
        ) : null}

        {section === 'png-style-library' ? (
          <section className="settings-section" aria-label="PNG 画风库设置">
            <PngStyleLibraryPanel
              repository={pngStylesRepository}
              canApplyParameterDraft={Boolean(generationPreset && persistedProfile)}
              onApplyParameterDraft={applyPngParameterDraft}
            />
          </section>
        ) : null}

        {section === 'automation' ? (
          <section className="settings-section" aria-label="自动化规则">
            <div className="image-settings-section-heading"><div><p className="image-settings-kicker">AUTOMATION</p><h3>自动化规则</h3></div><span>修订 {automationSettings.revision}</span></div>
            <p>这里保存玩家偏好；手动任务始终先预览最终提示词。自动任务只有在当前档案、模型或工作流的执行指纹拥有真实生成通过证据时才允许提交。</p>
            <div className="image-settings-automation-grid">
              <label>人物默认自动图片档案
                <select value={automationSettings.characterAutomaticProfileId ?? ''} onChange={(event) => {
                  const profileId = event.target.value || undefined;
                  updateAutomation('characterAutomaticProfileId', profileId);
                  const profile = profiles.find((item) => item.profileId === profileId);
                  if (profile?.providerType !== 'comfyui-workflow') updateAutomation('characterAutomaticWorkflowTemplateId', undefined);
                }}>
                  <option value="">请选择</option>
                  {profiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.name} · {getImageProviderLabel(profile.providerType)}</option>)}
                </select>
              </label>
              {profiles.find((profile) => profile.profileId === automationSettings.characterAutomaticProfileId)?.providerType === 'comfyui-workflow' ? (
                <label>人物默认 ComfyUI 工作流
                  <select value={automationSettings.characterAutomaticWorkflowTemplateId ?? ''} onChange={(event) => updateAutomation('characterAutomaticWorkflowTemplateId', event.target.value || undefined)}>
                    <option value="">请选择</option>
                    {workflows.map((workflow) => <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name}</option>)}
                  </select>
                </label>
              ) : null}
              <label>新 NPC 角色图
                <select value={automationSettings.characterMode} onChange={(event) => updateAutomation('characterMode', event.target.value as ImageAutomationSettings['characterMode'])}>
                  <option value="off">关闭</option><option value="manual">手动</option><option value="automatic">自动</option>
                </select>
              </label>
              <label>正文场景图
                <select value={automationSettings.sceneMode} onChange={(event) => updateAutomation('sceneMode', event.target.value as ImageAutomationSettings['sceneMode'])}>
                  <option value="off">关闭</option><option value="manual">手动</option><option value="automatic">自动</option>
                </select>
              </label>
              <label className="image-settings-automation-toggle">
                <input
                  type="checkbox"
                  checked={automationSettings.sceneAutomaticRouting === 'separate'}
                  onChange={(event) => updateAutomation('sceneAutomaticRouting', event.target.checked ? 'separate' : 'character-default')}
                /> 场景自动任务使用独立图片档案
              </label>
              {automationSettings.sceneAutomaticRouting === 'separate' ? (
                <>
                  <label>场景独立自动图片档案
                    <select value={automationSettings.sceneAutomaticProfileId ?? ''} onChange={(event) => {
                      const profileId = event.target.value || undefined;
                      updateAutomation('sceneAutomaticProfileId', profileId);
                      const profile = profiles.find((item) => item.profileId === profileId);
                      if (profile?.providerType !== 'comfyui-workflow') updateAutomation('sceneAutomaticWorkflowTemplateId', undefined);
                    }}>
                      <option value="">请选择</option>
                      {profiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.profileId} value={profile.profileId}>{profile.name} · {getImageProviderLabel(profile.providerType)}</option>)}
                    </select>
                  </label>
                  {profiles.find((profile) => profile.profileId === automationSettings.sceneAutomaticProfileId)?.providerType === 'comfyui-workflow' ? (
                    <label>场景独立 ComfyUI 工作流
                      <select value={automationSettings.sceneAutomaticWorkflowTemplateId ?? ''} onChange={(event) => updateAutomation('sceneAutomaticWorkflowTemplateId', event.target.value || undefined)}>
                        <option value="">请选择</option>
                        {workflows.map((workflow) => <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name}</option>)}
                      </select>
                    </label>
                  ) : null}
                </>
              ) : (
                <p className="muted image-settings-automation-route-note">场景自动任务默认复用人物自动路由；可开启独立档案以使用另一供应商、模型或工作流。</p>
              )}
              <label>每回合场景图上限
                <select value={automationSettings.sceneMaxPerTurn} onChange={(event) => updateAutomation('sceneMaxPerTurn', Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value} 张</option>)}
                </select>
              </label>
              <label>场景图并发上限
                <select value={automationSettings.sceneConcurrency} onChange={(event) => updateAutomation('sceneConcurrency', Number(event.target.value))}>
                  {[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value}</option>)}
                </select>
              </label>
              <label>自动场景失败处理
                <select value={automationSettings.sceneFailureRetry} onChange={(event) => updateAutomation('sceneFailureRetry', event.target.value as ImageAutomationSettings['sceneFailureRetry'])}>
                  <option value="manual">仅手动重试</option><option value="once">自动重试一次</option>
                </select>
              </label>
            </div>
            <fieldset className="image-settings-prompt-group"><legend>新 NPC 自动生成的角色图</legend>
              {CHARACTER_VISUAL_PURPOSES.map((purpose) => <label key={purpose}>
                <input type="checkbox" checked={automationSettings.characterAutomaticPurposes.includes(purpose)} onChange={(event) => {
                  const next = event.target.checked
                    ? [...automationSettings.characterAutomaticPurposes, purpose]
                    : automationSettings.characterAutomaticPurposes.filter((item) => item !== purpose);
                  if (next.length) updateAutomation('characterAutomaticPurposes', next);
                }} /> {CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}
              </label>)}
            </fieldset>
            <div className="image-profile-save-actions"><button type="button" className="image-settings-primary" onClick={() => void saveAutomation()}>保存自动化规则</button></div>
            {automationStatus ? <p className="image-settings-gate-note" role="status">{automationStatus}</p> : null}
            <p className="muted">当前档案、模型、凭据修订、内置执行参数或 Comfy 工作流改变后，旧真实证据立即失效。自动触发只使用这里明确指定的档案，不会暗中改用其他供应商。</p>
          </section>
        ) : null}

        {section === 'prompt-templates' ? (
          <section className="settings-section" aria-label="提示词模板设置">
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">PROMPT MODIFIERS</p><h3>通用提示词模板</h3></div>
              <span>修订 {promptTemplateSettings.revision}</span>
            </div>
            <p>模板只在“生成并预览提示词”时注入；已经确认、已生成及历史图片不会随模板变化。</p>
            <div className="image-profile-save-actions">
              <button type="button" onClick={exportPromptTemplates}>导出文生图模板</button>
              <button type="button" onClick={() => promptTemplateImportInputRef.current?.click()}>导入文生图模板</button>
              <input
                ref={promptTemplateImportInputRef}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                aria-label="导入文生图模板文件"
                onChange={(event) => void importPromptTemplates(event)}
              />
            </div>
            <p className="muted">导出当前编辑区的转换指令、通用修饰词、提示词风格、模型渲染方案和 ComfyUI 风格配方；只保存逻辑资产槽位与建议，不包含 API、凭据、本地模型文件、图片或图片档案。导入只载入编辑区，不会自动保存。</p>
            <fieldset className="image-settings-prompt-group">
              <legend>提示词转换模型能力声明</legend>
              <label>
                <input
                  type="checkbox"
                  checked={promptTemplateSettings.conversionCapabilities.imageInputEnabled}
                  onChange={(event) => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      conversionCapabilities: { imageInputEnabled: event.target.checked }
                    }));
                    setPromptTemplateStatus('有未保存的模型能力修改。');
                  }}
                />
                当前辅助生成路由的模型支持图片输入
              </label>
              <p className="muted">默认关闭。只有玩家明确声明后，角色页才允许把所选本地图片发送给转换 API；模型拒绝时会显示错误，不会覆盖锚点。</p>
            </fieldset>
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">CONVERSION INSTRUCTIONS</p><h4>提示词转换任务指令</h4></div>
              <span>6 类任务</span>
            </div>
            <p>这些指令决定转换 API 如何理解人物资料、已有图片和正文。固定的 JSON 输出外壳、输入防注入规则、稳定 actorId 校验与一次结构修复不开放编辑。</p>
            {PROMPT_CONVERSION_TASKS.map((taskKind) => {
              const label = PROMPT_CONVERSION_TASK_LABELS[taskKind];
              return <fieldset key={taskKind} className="image-settings-prompt-group"><legend>{label}</legend>
                <label>任务指令
                  <textarea
                    rows={9}
                    aria-label={`${label}任务指令`}
                    value={promptTemplateSettings.conversionInstructions[taskKind]}
                    onChange={(event) => updateConversionInstruction(taskKind, event.target.value)}
                  />
                </label>
                <button type="button" onClick={() => {
                  updateConversionInstruction(taskKind, DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS[taskKind]);
                  setPromptTemplateStatus(`已在编辑区恢复“${label}”默认指令；点击保存后才会生效。`);
                }}>恢复此项默认指令</button>
              </fieldset>;
            })}
            <div className="image-profile-save-actions">
              <button type="button" onClick={() => {
                setPromptTemplateSettings((current) => ({
                  ...current,
                  conversionInstructions: structuredClone(DEFAULT_PROMPT_CONVERSION_INSTRUCTIONS)
                }));
                setPromptTemplateStatus('已在编辑区恢复全部转换任务默认指令；点击保存后才会生效。');
              }}>恢复全部默认指令</button>
            </div>
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">STYLE LIBRARY</p><h4>图片风格预设库</h4></div>
              <span>{promptTemplateSettings.stylePresets.length} 套</span>
            </div>
            <p>风格预设保存玩家可见、可修改的语义约束。内置风格可直接修改、隐藏或恢复；玩家可新增任意数量的自定义风格。整套库会随文生图模板导入和导出。</p>
            <aside className="image-settings-gate-note" aria-label="ComfyUI 实测风格说明">
              <p><strong>提示词近似：</strong>AsianBlend、Duchaiten 人物／雨夜场景、Rin SoftSketch、WAI、北条司、织田 non 和十六夜清心保留为跨供应商语义方向。这些风格不会加载 checkpoint 或 LoRA，也不保证复现对应模型画风；需要真实资产的路线请使用下方 ComfyUI 风格配方。</p>
            </aside>
            <aside className="image-settings-gate-note" aria-label="NovelAI 风格建议">
              <p><strong>NovelAI 推荐：</strong>“NAI 推荐·日漫写实”使用 NAI 擅长的动漫标签表达，故事年代仍服从人物与场景事实，也不会替换 GPT 等自然语言模型使用的全局默认写实插画。推荐只是快捷选择，不会随模型切换自动覆盖玩家选择；预设内容仍可查看、修改或复制。</p>
              <div className="image-profile-save-actions">
                <button type="button" onClick={() => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      characterStylePresetId: NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID,
                      characterStyleMode: 'replace-global'
                    }
                  }));
                  setPromptTemplateStatus('已在编辑区为人物图选择 NovelAI 推荐风格，并设为覆盖全局；点击保存后才会生效。');
                }}>人物图使用 NAI 推荐</button>
                <button type="button" onClick={() => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      narrativeSceneStylePresetId: NOVELAI_RECOMMENDED_IMAGE_STYLE_PRESET_ID,
                      narrativeSceneStyleMode: 'replace-global'
                    }
                  }));
                  setPromptTemplateStatus('已在编辑区为场景图选择 NovelAI 推荐风格，并设为覆盖全局；点击保存后才会生效。');
                }}>场景图使用 NAI 推荐</button>
              </div>
            </aside>
            <div className="settings-grid two-column">
              <label>全局默认风格<select
                aria-label="全局默认图片风格"
                value={promptTemplateSettings.styleSelection.globalStylePresetId}
                onChange={(event) => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: { ...current.styleSelection, globalStylePresetId: event.target.value }
                  }));
                  setPromptTemplateStatus('有未保存的图片风格选择修改。');
                }}
              >
                {promptTemplateSettings.stylePresets
                  .filter((preset) => !preset.hidden || preset.stylePresetId === promptTemplateSettings.styleSelection.globalStylePresetId)
                  .map((preset) => <option key={preset.stylePresetId} value={preset.stylePresetId}>{preset.name}</option>)}
              </select></label>
              <label>人物图专用风格<select
                aria-label="人物图覆盖风格"
                value={promptTemplateSettings.styleSelection.characterStylePresetId ?? ''}
                onChange={(event) => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      characterStylePresetId: event.target.value || undefined,
                      characterStyleMode: event.target.value
                        ? current.styleSelection.characterStyleMode
                        : 'inherit-global'
                    }
                  }));
                  setPromptTemplateStatus('有未保存的图片风格选择修改。');
                }}
              >
                <option value="">继承全局风格</option>
                {promptTemplateSettings.stylePresets
                  .filter((preset) => !preset.hidden || preset.stylePresetId === promptTemplateSettings.styleSelection.characterStylePresetId)
                  .map((preset) => <option key={preset.stylePresetId} value={preset.stylePresetId}>{preset.name}</option>)}
              </select></label>
              <label>人物图组合方式<select
                aria-label="人物图风格组合方式"
                disabled={!promptTemplateSettings.styleSelection.characterStylePresetId}
                value={promptTemplateSettings.styleSelection.characterStyleMode}
                onChange={(event) => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      characterStyleMode: event.target.value as typeof current.styleSelection.characterStyleMode
                    }
                  }));
                  setPromptTemplateStatus('有未保存的图片风格选择修改。');
                }}
              >
                <option value="inherit-global">叠加在全局风格上</option>
                <option value="replace-global">覆盖全局风格</option>
              </select></label>
              <label>场景图专用风格<select
                aria-label="场景图覆盖风格"
                value={promptTemplateSettings.styleSelection.narrativeSceneStylePresetId ?? ''}
                onChange={(event) => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      narrativeSceneStylePresetId: event.target.value || undefined,
                      narrativeSceneStyleMode: event.target.value
                        ? current.styleSelection.narrativeSceneStyleMode
                        : 'inherit-global'
                    }
                  }));
                  setPromptTemplateStatus('有未保存的图片风格选择修改。');
                }}
              >
                <option value="">继承全局风格</option>
                {promptTemplateSettings.stylePresets
                  .filter((preset) => !preset.hidden || preset.stylePresetId === promptTemplateSettings.styleSelection.narrativeSceneStylePresetId)
                  .map((preset) => <option key={preset.stylePresetId} value={preset.stylePresetId}>{preset.name}</option>)}
              </select></label>
              <label>场景图组合方式<select
                aria-label="场景图风格组合方式"
                disabled={!promptTemplateSettings.styleSelection.narrativeSceneStylePresetId}
                value={promptTemplateSettings.styleSelection.narrativeSceneStyleMode}
                onChange={(event) => {
                  setPromptTemplateSettings((current) => ({
                    ...current,
                    styleSelection: {
                      ...current.styleSelection,
                      narrativeSceneStyleMode: event.target.value as typeof current.styleSelection.narrativeSceneStyleMode
                    }
                  }));
                  setPromptTemplateStatus('有未保存的图片风格选择修改。');
                }}
              >
                <option value="inherit-global">叠加在全局风格上</option>
                <option value="replace-global">覆盖全局风格</option>
              </select></label>
            </div>
            <aside className="image-settings-gate-note" aria-label="当前图片风格组合">
              <p><strong>人物图：</strong>{characterSpecificStyleName
                ? promptTemplateSettings.styleSelection.characterStyleMode === 'replace-global'
                  ? `${characterSpecificStyleName}（覆盖全局“${globalStyleName}”）`
                  : `${globalStyleName} + ${characterSpecificStyleName}（叠加）`
                : `${globalStyleName}（继承全局）`}</p>
              <p><strong>场景图：</strong>{sceneSpecificStyleName
                ? promptTemplateSettings.styleSelection.narrativeSceneStyleMode === 'replace-global'
                  ? `${sceneSpecificStyleName}（覆盖全局“${globalStyleName}”）`
                  : `${globalStyleName} + ${sceneSpecificStyleName}（叠加）`
                : `${globalStyleName}（继承全局）`}</p>
            </aside>
            <div className="image-profile-save-actions">
              <button type="button" onClick={() => {
                const created = createCustomImageStylePreset('新建自定义风格');
                setPromptTemplateSettings((current) => ({
                  ...current,
                  stylePresets: normalizePresetOrder([...current.stylePresets, created])
                }));
                setPromptTemplateStatus('已在编辑区新增自定义风格；点击保存后才会生效。');
              }}>新增自定义风格</button>
            </div>
            {promptTemplateSettings.stylePresets.map((preset, index) => (
              <details key={preset.stylePresetId} className="image-settings-prompt-group">
                <summary>{preset.name} · {preset.origin === 'built-in' ? '内置' : '自定义'}{preset.hidden ? ' · 已隐藏' : ''}</summary>
                <div className="settings-grid two-column">
                  <label>名称<input value={preset.name} maxLength={200} onChange={(event) =>
                    updateStylePreset(preset.stylePresetId, (current) => ({ ...current, name: event.target.value }))
                  } /></label>
                  <label>说明<input value={preset.description} maxLength={2000} onChange={(event) =>
                    updateStylePreset(preset.stylePresetId, (current) => ({ ...current, description: event.target.value }))
                  } /></label>
                </div>
                <label><input type="checkbox" checked={preset.hidden} onChange={(event) =>
                  updateStylePreset(preset.stylePresetId, (current) => ({ ...current, hidden: event.target.checked }))
                } />从新选择列表隐藏</label>
                {([
                  ['global', '风格全局层'],
                  ['character', '人物图风格层'],
                  ['narrativeScene', '场景图风格层']
                ] as const).map(([layer, label]) => {
                  const value = preset.modifiers[layer];
                  return <fieldset key={layer}><legend>{label}</legend>
                    <label>正向<textarea rows={3} value={value.positive} onChange={(event) =>
                      updateStylePreset(preset.stylePresetId, (current) => ({
                        ...current,
                        modifiers: {
                          ...current.modifiers,
                          [layer]: { ...current.modifiers[layer], positive: event.target.value }
                        }
                      }))
                    } /></label>
                    <label>负向<textarea rows={2} value={value.negative} onChange={(event) =>
                      updateStylePreset(preset.stylePresetId, (current) => ({
                        ...current,
                        modifiers: {
                          ...current.modifiers,
                          [layer]: { ...current.modifiers[layer], negative: event.target.value }
                        }
                      }))
                    } /></label>
                  </fieldset>;
                })}
                <div className="image-profile-save-actions">
                  <button type="button" disabled={index === 0} onClick={() => movePreset('style', preset.stylePresetId, -1)}>上移</button>
                  <button type="button" disabled={index === promptTemplateSettings.stylePresets.length - 1} onClick={() => movePreset('style', preset.stylePresetId, 1)}>下移</button>
                  <button type="button" onClick={() => {
                    const copy = duplicateImageStylePreset(preset);
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      stylePresets: normalizePresetOrder([...current.stylePresets, copy])
                    }));
                    setPromptTemplateStatus(`已复制“${preset.name}”为自定义风格；点击保存后才会生效。`);
                  }}>复制为自定义</button>
                  {preset.origin === 'built-in' ? <button type="button" onClick={() => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      stylePresets: restoreBuiltInImageStylePreset(current.stylePresets, preset.stylePresetId)
                    }));
                    setPromptTemplateStatus(`已在编辑区恢复“${preset.name}”内置内容；点击保存后才会生效。`);
                  }}>恢复内置内容</button> : <button type="button" onClick={() => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      stylePresets: normalizePresetOrder(
                        current.stylePresets.filter((item) => item.stylePresetId !== preset.stylePresetId)
                      ),
                      styleSelection: {
                        globalStylePresetId: current.styleSelection.globalStylePresetId === preset.stylePresetId
                          ? DEFAULT_IMAGE_STYLE_PRESET_ID
                          : current.styleSelection.globalStylePresetId,
                        characterStylePresetId: current.styleSelection.characterStylePresetId === preset.stylePresetId
                          ? undefined
                          : current.styleSelection.characterStylePresetId,
                        narrativeSceneStylePresetId: current.styleSelection.narrativeSceneStylePresetId === preset.stylePresetId
                          ? undefined
                          : current.styleSelection.narrativeSceneStylePresetId,
                        characterStyleMode: current.styleSelection.characterStylePresetId === preset.stylePresetId
                          ? 'inherit-global'
                          : current.styleSelection.characterStyleMode,
                        narrativeSceneStyleMode: current.styleSelection.narrativeSceneStylePresetId === preset.stylePresetId
                          ? 'inherit-global'
                          : current.styleSelection.narrativeSceneStyleMode
                      }
                    }));
                    setPromptTemplateStatus(`已从编辑区删除“${preset.name}”；点击保存后才会生效。`);
                  }}>删除自定义风格</button>}
                </div>
              </details>
            ))}
            <ComfyStyleRecipeLibraryEditor
              recipes={promptTemplateSettings.comfyStyleRecipes}
              stylePresets={promptTemplateSettings.stylePresets}
              dialectPresets={promptTemplateSettings.dialectPresets}
              onChange={(comfyStyleRecipes, status) => {
                setPromptTemplateSettings((current) => ({ ...current, comfyStyleRecipes }));
                setPromptTemplateStatus(status);
              }}
            />
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">MODEL RENDER PROFILES</p><h4>模型渲染方案库</h4></div>
              <span>{promptTemplateSettings.dialectPresets.length} 套</span>
            </div>
            <p>渲染方案只负责把相同语义转换为目标模型习惯的自然语言、标签顺序和正负向字段，不会替玩家更换所选媒介或画风。OpenAI GPT Image、Gemini 原生图片与 NovelAI 已使用三套独立内置方案；同一接口或 ComfyUI 的不同模型仍可由玩家改选、复制和修改任意方案。</p>
            <div className="image-profile-save-actions">
              <button type="button" onClick={() => {
                const created = createCustomImagePromptDialectPreset('新建自定义格式');
                setPromptTemplateSettings((current) => ({
                  ...current,
                  dialectPresets: normalizePresetOrder([...current.dialectPresets, created])
                }));
                setPromptTemplateStatus('已在编辑区新增自定义模型提示词格式；点击保存后才会生效。');
              }}>新增自定义格式</button>
            </div>
            {promptTemplateSettings.dialectPresets.map((preset, index) => (
              <details key={preset.dialectPresetId} className="image-settings-prompt-group">
                <summary>{preset.name} · {preset.origin === 'built-in' ? '内置' : '自定义'}{preset.hidden ? ' · 已隐藏' : ''}</summary>
                <div className="settings-grid two-column">
                  <label>名称<input value={preset.name} maxLength={200} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, name: event.target.value }))
                  } /></label>
                  <label>模型家族<select value={preset.family} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({
                      ...current,
                      family: event.target.value as ImagePromptDialectPreset['family']
                    }))
                  }>
                    {IMAGE_PROMPT_DIALECT_FAMILIES.map((family) =>
                      <option key={family} value={family}>{DIALECT_FAMILY_LABELS[family]}</option>)}
                  </select></label>
                </div>
                <label>说明<input value={preset.description} maxLength={2000} onChange={(event) =>
                  updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, description: event.target.value }))
                } /></label>
                <label><input type="checkbox" checked={preset.hidden} onChange={(event) =>
                  updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, hidden: event.target.checked }))
                } />从新选择列表隐藏</label>
                <label>模型语法与标签转换指令<textarea rows={8} value={preset.renderingInstruction} onChange={(event) =>
                  updateDialectPreset(preset.dialectPresetId, (current) => ({
                    ...current,
                    renderingInstruction: event.target.value
                  }))
                } /></label>
                <div className="settings-grid two-column">
                  <label>正向前缀<textarea rows={2} value={preset.positivePrefix} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, positivePrefix: event.target.value }))
                  } /></label>
                  <label>正向后缀<textarea rows={2} value={preset.positiveSuffix} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, positiveSuffix: event.target.value }))
                  } /></label>
                  <label>负向前缀<textarea rows={2} value={preset.negativePrefix} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, negativePrefix: event.target.value }))
                  } /></label>
                  <label>负向后缀<textarea rows={2} value={preset.negativeSuffix} onChange={(event) =>
                    updateDialectPreset(preset.dialectPresetId, (current) => ({ ...current, negativeSuffix: event.target.value }))
                  } /></label>
                </div>
                <div className="image-profile-save-actions">
                  <button type="button" disabled={index === 0} onClick={() => movePreset('dialect', preset.dialectPresetId, -1)}>上移</button>
                  <button type="button" disabled={index === promptTemplateSettings.dialectPresets.length - 1} onClick={() => movePreset('dialect', preset.dialectPresetId, 1)}>下移</button>
                  <button type="button" onClick={() => {
                    const copy = duplicateImagePromptDialectPreset(preset);
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      dialectPresets: normalizePresetOrder([...current.dialectPresets, copy])
                    }));
                    setPromptTemplateStatus(`已复制“${preset.name}”为自定义格式；点击保存后才会生效。`);
                  }}>复制为自定义</button>
                  {preset.origin === 'built-in' ? <button type="button" onClick={() => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      dialectPresets: restoreBuiltInImagePromptDialectPreset(
                        current.dialectPresets,
                        preset.dialectPresetId
                      )
                    }));
                    setPromptTemplateStatus(`已在编辑区恢复“${preset.name}”内置内容；点击保存后才会生效。`);
                  }}>恢复内置内容</button> : <button type="button" onClick={() => {
                    setPromptTemplateSettings((current) => ({
                      ...current,
                      dialectPresets: normalizePresetOrder(
                        current.dialectPresets.filter((item) => item.dialectPresetId !== preset.dialectPresetId)
                      )
                    }));
                    setPromptTemplateStatus(`已从编辑区删除“${preset.name}”；使用它的生成预设在重新保存前会校验失败。`);
                  }}>删除自定义格式</button>}
                </div>
              </details>
            ))}
            <div className="image-settings-section-heading">
              <div><p className="image-settings-kicker">FINAL PROMPT MODIFIERS</p><h4>最终提示词通用修饰词</h4></div>
              <span>{promptTemplateSettings.modifierDefaultsState === 'built-in'
                ? '内置默认'
                : promptTemplateSettings.modifierDefaultsState === 'legacy-preserved'
                  ? '已保留旧配置'
                  : '玩家自定义'}</span>
            </div>
            {promptTemplateSettings.modifierDefaultsState === 'legacy-preserved' ? (
              <p className="image-settings-gate-note">
                检测到升级前保存的提示词配置，已原样保留，没有自动写入新默认值。你可以继续使用旧配置，或在下方明确应用内置默认修饰词。
              </p>
            ) : null}
            {([
              ['global', '全局画风与质量要求'],
              ['characterCommon', '人物图通用要求'],
              ['narrativeScene', '正文场景图通用要求']
            ] as const).map(([sectionId, label]) => {
              const value = promptTemplateSettings.modifiers[sectionId];
              return <fieldset key={sectionId} className="image-settings-prompt-group"><legend>{label}</legend>
                <label>正向模板<textarea rows={3} value={value.positive} onChange={(event) => updatePromptModifier(sectionId, { ...value, positive: event.target.value })} /></label>
                <label>负向模板<textarea rows={2} value={value.negative} onChange={(event) => updatePromptModifier(sectionId, { ...value, negative: event.target.value })} /></label>
              </fieldset>;
            })}
            <h4>四种人物景别</h4>
            {CHARACTER_VISUAL_PURPOSES.map((purpose) => {
              const value = promptTemplateSettings.modifiers.characterViews[purpose];
              return <fieldset key={purpose} className="image-settings-prompt-group"><legend>{CHARACTER_VISUAL_PURPOSE_LABELS[purpose]}</legend>
                <label>正向模板<textarea rows={3} value={value.positive} onChange={(event) => updateCharacterViewModifier(purpose, { ...value, positive: event.target.value })} /></label>
                <label>负向模板<textarea rows={2} value={value.negative} onChange={(event) => updateCharacterViewModifier(purpose, { ...value, negative: event.target.value })} /></label>
              </fieldset>;
            })}
            <div className="image-profile-save-actions">
              <button type="button" className="image-settings-primary" onClick={() => void savePromptTemplates()}>保存提示词设置</button>
              <button type="button" onClick={() => {
                setPromptTemplateSettings((current) => ({
                  ...current,
                  modifiers: structuredClone(DEFAULT_IMAGE_PROMPT_MODIFIERS),
                  modifierDefaultsState: 'built-in'
                }));
                setPromptTemplateStatus('已在编辑区应用全部内置默认修饰词；点击保存后才会覆盖本地配置。');
              }}>应用内置默认修饰词</button>
              <button type="button" onClick={() => {
                setPromptTemplateSettings((current) => ({
                  ...current,
                  modifiers: structuredClone(EMPTY_IMAGE_PROMPT_MODIFIERS),
                  modifierDefaultsState: 'custom'
                }));
                setPromptTemplateStatus('已在编辑区清空全部通用修饰词；转换任务指令未改变，点击保存后才会覆盖本地配置。');
              }}>清空通用修饰词</button>
            </div>
            {promptTemplateStatus ? <p className="image-settings-gate-note" role="status">{promptTemplateStatus}</p> : null}
            <p className="muted">图片管理只管理资产与绑定，不负责编辑全局模板。自然语言额外要求仍在人物页面输入，并保持更高优先级。</p>
          </section>
        ) : null}
      </div>

      {generationConfirmationOpen ? (
        <div className="image-settings-confirm-backdrop" role="presentation">
          <section className="image-settings-confirm" role="dialog" aria-modal="true" aria-label="生成测试费用确认">
            <p className="image-settings-kicker">EXPLICIT CONFIRMATION</p><h3>真实生成测试可能产生费用</h3>
            <p>本次将向“{persistedProfile?.name}”提交一张与所选正式运行规格相同的中性测试图。云端可能扣除额度，本地服务可能排队并占用显存。</p>
            <p>最终提示词：<code>{TEST_PROMPT}</code></p>
            <ul><li>测试图只进入独立 ImageProbeStore，不进入图册。</li><li>当前操作不会开放其他档案或其他模型的自动模式。</li><li>每次重新测试都必须再次确认。</li></ul>
            <div className="image-profile-save-actions"><button type="button" onClick={() => setGenerationConfirmationOpen(false)}>取消</button><button type="button" className="image-settings-primary" onClick={() => void runGenerationProbe()}>确认并生成测试图</button></div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
