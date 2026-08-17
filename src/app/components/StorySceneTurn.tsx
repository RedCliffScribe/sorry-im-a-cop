import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterImageRuntimeExecutor } from '../../domain/imageGeneration/characterImageRuntimeExecutor';
import {
  createDefaultImageAutomationSettings,
  IndexedDbImageAutomationSettingsRepository,
  type ImageAutomationSettings,
  type ImageAutomationSettingsRepository
} from '../../domain/imageGeneration/automationSettings';
import type { CharacterImageExecutor } from '../../domain/imageGeneration/characterVisualWorkflow';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import {
  createStoryVisualBlocks,
  compileFormattedProviderPrompt,
  createProviderPromptRenderInput,
  hashStoryText,
  IndexedDbImagePromptTemplateRepository,
  projectAnchoredActorsForScenePlanning,
  resolveSelectedImageStyleModifiers,
  resolveActualTransportPrompts,
  type ImagePromptConversionProbe,
  type ImagePromptTemplateRepository,
  PromptConversionContractError,
  PROMPT_CONVERSION_TASK_LABELS,
  type TurnScenePlanningInput,
  type VisualWorldContext
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
  confirmManualScenePlan,
  cancelManualScenePlanDraft,
  createBuiltInSceneDraftExecutionConfig,
  createFailedSceneRetryDraft,
  createManualScenePlanDraft,
  createSceneShotRegenerationDraft,
  executeConfirmedScenePlan,
  type ManualScenePlanDraft,
  type ScenePromptEdit
} from '../../domain/imageGeneration/sceneVisualWorkflow';
import type {
  ImageGenerationTask,
  VisualAsset,
  VisualRepository,
  VisualRepositorySnapshot
} from '../../domain/imageGeneration/visualRepository';
import type { Actor, StoryEntry } from '../../domain/runtime/types';
import { StoryEntryBody } from './StoryEntryBody';
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

export interface StorySceneVisualsConfiguration {
  saveId: string;
  actors: Record<string, Actor>;
  actorIdAliases?: Record<string, string>;
  worldYear: number;
  repository: VisualRepository;
  createPromptConversion?: () => ImagePromptConversionProbe | null;
  profileRepository?: ImageProfileRepository;
  credentialRepository?: ImageCredentialRepository;
  promptTemplateRepository?: ImagePromptTemplateRepository;
  automationSettingsRepository?: ImageAutomationSettingsRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  pngStyleRepository?: PngStyleRepository;
  createImageExecutor?: () => CharacterImageExecutor;
  onOpenSettings?: () => void;
  onRepositoryChanged?: () => void;
  revision?: number;
}

interface LoadedSceneImage {
  shotId: string;
  blockIndex: number;
  sceneSummary: string;
  asset: VisualAsset;
  url: string;
}

export function formatStorySceneError(error: unknown): string {
  if (error instanceof PromptConversionContractError) {
    const taskLabel = PROMPT_CONVERSION_TASK_LABELS[error.taskKind];
    const issueSummary = error.issues.slice(0, 3).join('；');
    const providerBoundary = error.taskKind === 'turn-scene-plan'
      || error.taskKind === 'scene-shot-prompt'
      || error.taskKind === 'provider-prompt-render'
      ? '图片供应商尚未调用。'
      : '';
    return `${taskLabel}未能完成${issueSummary ? `：${issueSummary}。` : '。'}${providerBoundary}`;
  }
  return error instanceof Error ? error.message : '场景图操作失败。';
}

export function hasUnresolvedFailedSceneTask(
  tasks: Array<Pick<ImageGenerationTask, 'taskId' | 'sourceTaskId' | 'status'>>
): boolean {
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
  const resolvedTaskIds = new Set<string>();

  for (const task of tasks) {
    if (task.status !== 'succeeded') continue;
    const visited = new Set<string>();
    let sourceTaskId = task.sourceTaskId;
    while (sourceTaskId && !visited.has(sourceTaskId)) {
      visited.add(sourceTaskId);
      resolvedTaskIds.add(sourceTaskId);
      sourceTaskId = tasksById.get(sourceTaskId)?.sourceTaskId;
    }
  }

  return tasks.some((task) => task.status === 'failed' && !resolvedTaskIds.has(task.taskId));
}

function sceneExecutionTargetLabel(task: ManualScenePlanDraft['tasks'][number]): string {
  const target = task.draft?.executionTarget ?? task.submittedRequest?.executionTarget;
  if (!target) return '执行目标未确定';
  return target.kind === 'model'
    ? `模型 ${target.modelId}`
    : `工作流 ${target.workflowTemplateId}（修订 ${target.workflowRevision}）`;
}

const negativePromptModeLabels = {
  separate: '独立负向字段',
  'merged-into-positive': '合并进正向提示词',
  unsupported: '当前后端不支持',
  'workflow-controlled': '由 ComfyUI 工作流控制'
} as const;

function sceneExecutionParametersLabel(task: ManualScenePlanDraft['tasks'][number]): string {
  const parameters = task.draft?.generationParameters ?? task.submittedRequest?.generationParameters;
  if (!parameters) return '未确定';
  const { providerType: _providerType, ...visibleParameters } = parameters;
  return JSON.stringify(visibleParameters, null, 2);
}

function latestTurnDraft(
  snapshot: VisualRepositorySnapshot,
  turnId: string,
  sourceStoryTextHash: string
): ManualScenePlanDraft | undefined {
  const plan = Object.values(snapshot.scenePlans)
    .filter((plan) => plan.sourceTurnId === turnId && plan.sourceStoryTextHash === sourceStoryTextHash)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  if (!plan) return undefined;
  const shotIds = new Set(plan.shots.map((shot) => shot.shotId));
  const latestByShot = new Map<string, ManualScenePlanDraft['tasks'][number]>();
  Object.values(snapshot.tasks)
    .filter((task) => task.intent.type === 'scene-image' && task.intent.scenePlanId === plan.planId && shotIds.has(task.intent.shotId))
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
    .forEach((task) => {
      if (task.intent.type === 'scene-image') latestByShot.set(task.intent.shotId, task);
    });
  const tasks = plan.shots
    .flatMap((shot) => latestByShot.get(shot.shotId) ?? [])
    .filter((task) => ['awaiting-confirmation', 'queued', 'failed'].includes(task.status));
  return tasks.length ? { plan, tasks } : undefined;
}

async function loadTurnImages(
  snapshot: VisualRepositorySnapshot,
  repository: VisualRepository,
  turnId: string,
  sourceStoryTextHash: string
): Promise<LoadedSceneImage[]> {
  const active = snapshot.storySceneDisplayStates[turnId]?.activeShotIds ?? [];
  const shots = new Map(Object.values(snapshot.scenePlans)
    .filter((plan) => plan.sourceTurnId === turnId && plan.sourceStoryTextHash === sourceStoryTextHash)
    .flatMap((plan) => plan.shots.map((shot) => [shot.shotId, shot] as const)));
  const images: LoadedSceneImage[] = [];
  for (const shotId of active) {
    const shot = shots.get(shotId);
    const binding = Object.values(snapshot.bindings).find((candidate) => (
      candidate.purpose === 'turn-scene' && candidate.subject.type === 'scene-shot' && candidate.subject.shotId === shotId
    ));
    const asset = binding ? snapshot.assets[binding.imageId] : undefined;
    if (!shot || !asset) continue;
    const blob = await repository.getBlob(asset.blobKey);
    if (!blob || typeof URL.createObjectURL !== 'function') continue;
    images.push({
      shotId,
      blockIndex: shot.placement.blockIndex,
      sceneSummary: shot.sceneSummary,
      asset,
      url: URL.createObjectURL(blob)
    });
  }
  return images;
}

export function StorySceneTurn({
  entry,
  configuration,
  dialogueAvatars
}: {
  entry: StoryEntry;
  configuration: StorySceneVisualsConfiguration;
  dialogueAvatars?: ReadonlyMap<string, { url: string; alt: string }>;
}) {
  const createImageExecutor = configuration.createImageExecutor;
  const profiles = useMemo(
    () => configuration.profileRepository ?? new IndexedDbImageProfileRepository(),
    [configuration.profileRepository]
  );
  const credentials = useMemo(
    () => configuration.credentialRepository ?? new IndexedDbImageCredentialRepository(),
    [configuration.credentialRepository]
  );
  const generationPresets = useMemo(
    () => configuration.generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository(),
    [configuration.generationPresetRepository]
  );
  const templates = useMemo(
    () => configuration.promptTemplateRepository ?? new IndexedDbImagePromptTemplateRepository(),
    [configuration.promptTemplateRepository]
  );
  const pngStyles = useMemo(
    () => configuration.pngStyleRepository ?? new IndexedDbPngStyleRepository(),
    [configuration.pngStyleRepository]
  );
  const verificationStore = useMemo(() => new IndexedDbImageProbeStore(), []);
  const automationRepository = useMemo(
    () => configuration.automationSettingsRepository ?? new IndexedDbImageAutomationSettingsRepository(),
    [configuration.automationSettingsRepository]
  );
  const executor = useMemo(() => createImageExecutor?.() ?? new CharacterImageRuntimeExecutor({
    profiles,
    credentials,
    verificationStore,
    visualRepository: configuration.repository,
    pageUrl: () => typeof window === 'undefined' ? undefined : window.location.href
  }), [configuration.repository, createImageExecutor, credentials, profiles, verificationStore]);
  const [snapshot, setSnapshot] = useState<VisualRepositorySnapshot>();
  const [images, setImages] = useState<LoadedSceneImage[]>([]);
  const [maxScenes, setMaxScenes] = useState(2);
  const [displayOperation, setDisplayOperation] = useState<'append' | 'replace-group'>('append');
  const [automationSettings, setAutomationSettings] = useState<ImageAutomationSettings>(
    () => createDefaultImageAutomationSettings()
  );
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState<ManualScenePlanDraft>();
  const [edits, setEdits] = useState<ScenePromptEdit[]>([]);
  const [busy, setBusy] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [stages, setStages] = useState<Record<string, string>>({});
  const [manualProfiles, setManualProfiles] = useState<ImageApiProfile[]>([]);
  const [manualWorkflows, setManualWorkflows] = useState<ComfyWorkflowTemplate[]>([]);
  const [manualProfileId, setManualProfileId] = useState('');
  const [originalImageId, setOriginalImageId] = useState<string>();
  const [manualWorkflowId, setManualWorkflowId] = useState('');
  const [selectedReferenceImageIds, setSelectedReferenceImageIds] = useState<string[]>([]);
  const [manualRoutingError, setManualRoutingError] = useState('');
  const executionControllerRef = useRef<AbortController | null>(null);
  const urlsRef = useRef<string[]>([]);
  const reloadRequestIdRef = useRef(0);

  const reload = useCallback(async (hydrateDraft = false) => {
    const requestId = ++reloadRequestIdRef.current;
    const loaded = await configuration.repository.loadSnapshot(configuration.saveId);
    const sourceStoryTextHash = await hashStoryText(entry.text);
    const loadedImages = await loadTurnImages(
      loaded,
      configuration.repository,
      entry.turnId,
      sourceStoryTextHash
    );
    if (requestId !== reloadRequestIdRef.current) {
      loadedImages.forEach((image) => URL.revokeObjectURL(image.url));
      return loaded;
    }
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = loadedImages.map((image) => image.url);
    setSnapshot(loaded);
    setImages(loadedImages);
    if (hydrateDraft) {
      const recovered = latestTurnDraft(loaded, entry.turnId, sourceStoryTextHash);
      if (recovered) {
        setDraft(recovered);
        const frozenRequest = recovered.tasks[0]?.draft ?? recovered.tasks[0]?.submittedRequest;
        if (frozenRequest) {
          setManualProfileId(frozenRequest.imageProfileId);
          setManualWorkflowId(frozenRequest.executionTarget.kind === 'comfy-workflow'
            ? frozenRequest.executionTarget.workflowTemplateId
            : '');
        }
        setEdits(recovered.tasks.map((task) => ({
          shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
          positivePrompt: task.draft?.positivePrompt ?? task.submittedRequest?.positivePrompt ?? '',
          negativePrompt: task.draft?.negativePrompt ?? task.submittedRequest?.negativePrompt ?? ''
        })));
        setExpanded(true);
      } else {
        setDraft(undefined);
        setEdits([]);
        setStages({});
        setNotice('');
      }
    }
    return loaded;
  }, [configuration.repository, configuration.saveId, entry.text, entry.turnId]);

  useEffect(() => {
    setSelectedReferenceImageIds([]);
    void reload(true).catch((caught) => setError(formatStorySceneError(caught)));
    return () => {
      reloadRequestIdRef.current += 1;
      executionControllerRef.current?.abort();
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [configuration.revision, reload]);

  useEffect(() => {
    let active = true;
    void automationRepository.load().then((settings) => {
      if (!active) return;
      setAutomationSettings(settings);
      setMaxScenes(settings.sceneMaxPerTurn);
    }, () => undefined);
    return () => { active = false; };
  }, [automationRepository]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    void listManualImageRoutingOptions(profiles).then((options) => {
      if (!active) return;
      setManualProfiles(options.profiles);
      setManualWorkflows(options.workflows);
      setManualProfileId((current) => options.profiles.some((profile) => profile.profileId === current) ? current : '');
      setManualWorkflowId((current) => options.workflows.some((workflow) => workflow.workflowTemplateId === current) ? current : '');
      setManualRoutingError('');
    }, (caught) => active && setManualRoutingError(formatStorySceneError(caught)));
    return () => { active = false; };
  }, [expanded, profiles]);

  const visualsByBlock = (() => {
    const map = new Map<number, React.ReactNode[]>();
    for (const image of images) {
      const nodes = map.get(image.blockIndex) ?? [];
      nodes.push(
        <figure className="story-scene-image" key={image.shotId}>
          <img src={image.url} alt={image.sceneSummary} width={image.asset.width} height={image.asset.height} />
          <figcaption>{image.sceneSummary}</figcaption>
          <button type="button" onClick={() => setOriginalImageId(image.asset.imageId)}>查看原图</button>
          {automationSettings.sceneMode !== 'off' ? (
            <button
              type="button"
              disabled={busy || executing || Boolean(draft?.tasks.some((task) => (
                ['awaiting-confirmation', 'queued', 'submitting', 'remote-pending', 'downloading', 'persisting'].includes(task.status)
              )))}
              onClick={() => {
                setExpanded(true);
                prepareShotRegeneration(image.shotId);
              }}
            >重新生成此图</button>
          ) : null}
        </figure>
      );
      map.set(image.blockIndex, nodes);
    }
    return map;
  })();

  const run = (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    void operation().catch((caught) => setError(formatStorySceneError(caught))).finally(() => setBusy(false));
  };

  function prepareShotRegeneration(shotId: string) {
    run(async () => {
      const routing = await resolveManualImageRouting({
        profileRepository: profiles,
        credentialRepository: credentials,
        profileId: manualProfileId,
        workflowTemplateId: manualWorkflowId || undefined
      });
      const loaded = snapshot ?? await reload();
      const sourceTask = Object.values(loaded.tasks)
        .filter((task) => task.status === 'succeeded' && task.intent.type === 'scene-image' && task.intent.shotId === shotId)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (!sourceTask || sourceTask.intent.type !== 'scene-image') throw new Error('找不到这张场景图的成功冻结请求。');
      const sourcePlan = loaded.scenePlans[sourceTask.intent.scenePlanId];
      if (!sourcePlan) throw new Error('找不到这张场景图的冻结场景计划。');
      const execution = await createBuiltInSceneDraftExecutionConfig({
        profile: routing.profile,
        credential: routing.credential,
        workflow: routing.workflow,
        preset: await generationPresets.get(routing.profile.profileId, 'narrative-scene')
      });
      const selectedReferenceAssets = selectedReferenceImageIds.map((imageId) => {
        const asset = loaded.assets[imageId];
        if (!asset) throw new Error(`参考图 ${imageId} 已不存在，请重新选择。`);
        return asset;
      });
      const referenceCapability = resolveReferenceImageCapability({
        profile: routing.profile,
        workflow: routing.workflow,
        generationParameters: execution.generationParameters
      });
      const referenceImages = snapshotReferenceAssets(selectedReferenceAssets, referenceCapability);
      const created = await createSceneShotRegenerationDraft({
        repository: configuration.repository,
        sourcePlan,
        sourceShotId: shotId,
        sourceTask,
        execution,
        referenceImages,
        referenceImageTransport: referenceImages.length ? referenceCapability.transport : { kind: 'none' }
      });
      setDraft(created);
      setEdits(created.tasks.map((task) => ({
        shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
        positivePrompt: task.draft?.positivePrompt ?? '',
        negativePrompt: task.draft?.negativePrompt ?? ''
      })));
      setNotice('已沿用原图的冻结提示词，并套用本次明确选择的图片档案；确认前不会调用图片供应商，成功后才替换原图。');
      await reload();
      configuration.onRepositoryChanged?.();
    });
  }

  const planScenes = () => run(async () => {
    if (!entry.visualContext) {
      throw new Error('这个旧回合没有冻结的场景上下文，不能安全地套用当前地点和人物；请在新回合使用场景图。');
    }
    if (displayOperation === 'replace-group' && !images.length) {
      throw new Error('当前回合没有正在显示的场景图，不能整组替换；请先使用追加新镜头。');
    }
    const routing = await resolveManualImageRouting({
      profileRepository: profiles,
      credentialRepository: credentials,
      profileId: manualProfileId,
      workflowTemplateId: manualWorkflowId || undefined
    });
    let converter: ImagePromptConversionProbe | null | undefined;
    try {
      converter = configuration.createPromptConversion?.();
    } catch {
      throw new Error('提示词转换 API 尚未配置，请先前往文生图设置或功能配置。');
    }
    if (!converter) throw new Error('提示词转换 API 尚未配置。');
    const loaded = snapshot ?? await reload();
    const blocks = await createStoryVisualBlocks(entry.turnId, entry.text);
    const actors = projectAnchoredActorsForScenePlanning({
      actors: configuration.actors,
      anchors: Object.values(loaded.characterAnchors),
      priorityActorIds: [
        ...entry.visualContext.presentActorIds,
        ...Object.values(entry.dialogueSpeakerActorIds ?? {})
      ]
    });
    const planningInput: TurnScenePlanningInput = {
      sourceTurnId: entry.turnId,
      sourceStoryTextHash: await hashStoryText(entry.text),
      mode: 'manual',
      requestedMaxScenes: maxScenes,
      storyText: entry.text,
      ...(entry.summaryText?.trim() ? { summaryText: entry.summaryText } : {}),
      blocks,
      frozenContext: entry.visualContext,
      actors,
      ...(instruction.trim() ? { manualInstruction: instruction.trim() } : {})
    };
    const planningOutput = await converter.planTurnScenes(planningInput);
    if (!planningOutput.shots.length) {
      setDraft(undefined);
      setEdits([]);
      setExpanded(true);
      setNotice('提示词转换 API 判断本回合没有适合成图的镜头；没有创建图片任务，也没有调用图片供应商。');
      return;
    }
    const world: VisualWorldContext = {
      year: configuration.worldYear,
      region: '香港',
      visualStyle: '香港犯罪剧情写实电影感'
    };
    const actorMap = new Map(actors.map((actor) => [actor.actorId, actor]));
    const promptOutputs = [];
    for (const shot of planningOutput.shots) {
      const participants = shot.knownActorIds.map((actorId) => {
        const actor = actorMap.get(actorId);
        if (!actor) throw new Error(`镜头引用了未冻结锚点的角色 ${actorId}。`);
        return {
          ...actor,
          sceneSpecificAppearance: shot.actorVisualStates.find((state) => state.actorId === actorId)?.sceneSpecificAppearance
        };
      });
      promptOutputs.push(await converter.generateSceneShotPrompt({
        shot,
        participants,
        world,
        ...(instruction.trim() ? { oneTimeInstruction: instruction.trim() } : {})
      }));
    }
    const execution = await createBuiltInSceneDraftExecutionConfig({
      profile: routing.profile,
      credential: routing.credential,
      workflow: routing.workflow,
      preset: await generationPresets.get(routing.profile.profileId, 'narrative-scene')
    });
    const selectedReferenceAssets = selectedReferenceImageIds.map((imageId) => {
      const asset = loaded.assets[imageId];
      if (!asset) throw new Error(`参考图 ${imageId} 已不存在，请重新选择。`);
      return asset;
    });
    const referenceCapability = resolveReferenceImageCapability({
      profile: routing.profile,
      workflow: routing.workflow,
      generationParameters: execution.generationParameters
    });
    const referenceImages = snapshotReferenceAssets(selectedReferenceAssets, referenceCapability);
    const [templateSettings, pngStyleSettings] = await Promise.all([
      templates.load(),
      pngStyles.load()
    ]);
    const created = await createManualScenePlanDraft({
      repository: configuration.repository,
      saveId: configuration.saveId,
      planningInput,
      planningOutput,
      promptOutputs,
      world,
      execution,
      referenceImages,
      referenceImageTransport: referenceImages.length ? referenceCapability.transport : { kind: 'none' },
      displayOperation,
      oneTimeInstruction: instruction,
      modifiers: templateSettings.modifiers,
      styleModifiers: resolveSelectedImageStyleModifiers(
        templateSettings.stylePresets,
        templateSettings.styleSelection,
        'narrative-scene'
      ),
      pngStyleSettings,
      renderPrompt: async ({ semanticPrompt, execution: promptExecution }) => {
        const dialect = templateSettings.dialectPresets.find(
          (preset) => preset.dialectPresetId === promptExecution.promptDialectPresetId
        );
        if (!dialect) {
          throw new Error(`生成预设引用了不存在的模型提示词格式：${promptExecution.promptDialectPresetId}`);
        }
        const output = await converter.renderProviderPrompt(
          createProviderPromptRenderInput(semanticPrompt, dialect)
        );
        return compileFormattedProviderPrompt(semanticPrompt, dialect, output);
      }
    });
    setDraft(created);
    setEdits(created.tasks.map((task) => ({
      shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
      positivePrompt: task.draft?.positivePrompt ?? '',
      negativePrompt: task.draft?.negativePrompt ?? ''
    })));
    setExpanded(true);
    setNotice(displayOperation === 'replace-group'
      ? `已规划 ${created.tasks.length} 张整组替换图；旧图会保留到全组成功，尚未调用图片供应商。`
      : `已规划 ${created.tasks.length} 张追加场景图并生成最终提示词；尚未调用图片供应商。`);
    await reload();
    configuration.onRepositoryChanged?.();
  });

  const confirmPrompts = () => run(async () => {
    if (!draft || !draft.tasks.every((task) => task.status === 'awaiting-confirmation')) {
      throw new Error('当前没有等待确认的场景图提示词。');
    }
    const confirmed = await confirmManualScenePlan({ repository: configuration.repository, draft, edits });
    setDraft(confirmed);
    setNotice('最终提示词已冻结并加入队列；仍未调用图片供应商，请点击“开始生成”。');
    await reload();
  });

  const execute = async () => {
    if (!draft || !draft.tasks.every((task) => task.status === 'queued')) {
      setError('当前没有已确认、可执行的场景图任务。');
      return;
    }
    const controller = new AbortController();
    executionControllerRef.current = controller;
    setExecuting(true);
    setError('');
    setStages({});
    const operation = draft.plan.displayOperation ?? 'append';
    setNotice(operation === 'replace-group'
      ? '正在生成整组替换图；全组成功前继续显示旧图。'
      : operation === 'replace-shot'
        ? '正在重新生成单图；成功前继续显示原图。'
        : '正在执行已冻结请求；成功图片会追加到本回合，失败不影响正文和已有图片。');
    try {
      await executeConfirmedScenePlan({
        repository: configuration.repository,
        confirmed: draft,
        executor,
        signal: controller.signal,
        onTaskStage: (taskId, stage) => setStages((current) => ({ ...current, [taskId]: stage }))
      });
      const loaded = await reload();
      const tasks = draft.tasks.map((task) => loaded.tasks[task.taskId]).filter(Boolean);
      const failures = tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').length;
      setDraft({ plan: draft.plan, tasks });
      setNotice(failures
        ? operation === 'replace-group'
          ? `整组替换未完成：${tasks.length - failures} 张成功，${failures} 张失败或取消；旧组继续显示，可只重试失败镜头。`
          : operation === 'replace-shot'
            ? '单图重生失败或取消；原图继续显示，可按冻结请求重试。'
            : `本批次已结束：${tasks.length - failures} 张成功，${failures} 张失败或取消；已有图片和正文未受影响。`
        : operation === 'replace-group'
          ? '整组替换全部成功，正文已一次切换到新组。'
          : operation === 'replace-shot'
            ? '单图重生成功，正文中的原图已在原位置替换。'
            : '本批次场景图全部完成并追加到对应正文位置。');
      configuration.onRepositoryChanged?.();
    } catch (caught) {
      setError(formatStorySceneError(caught));
    } finally {
      if (executionControllerRef.current === controller) executionControllerRef.current = null;
      setExecuting(false);
    }
  };

  const cancelPreview = () => run(async () => {
    if (draft) await cancelManualScenePlanDraft({ repository: configuration.repository, draft });
    setDraft(undefined);
    setEdits([]);
    setNotice('已取消预览；没有调用图片供应商。');
    await reload();
  });

  const retryFailed = () => run(async () => {
    if (!draft) throw new Error('当前没有可重试的场景计划。');
    const retry = await createFailedSceneRetryDraft({
      repository: configuration.repository,
      plan: draft.plan,
      failedTasks: draft.tasks
    });
    setDraft(retry);
    setEdits(retry.tasks.map((task) => ({
      shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
      positivePrompt: task.draft?.positivePrompt ?? '',
      negativePrompt: task.draft?.negativePrompt ?? ''
    })));
    setNotice('失败镜头已按上次冻结请求重新进入提示词预览；确认前仍不会调用图片供应商。');
    await reload();
  });

  const turnTasks = snapshot ? Object.values(snapshot.tasks).filter((task) => (
    task.intent.type === 'scene-image' && task.intent.turnId === entry.turnId
  )).sort((left, right) => right.createdAt.localeCompare(left.createdAt)) : [];
  const selectedManualProfile = manualProfiles.find((profile) => profile.profileId === manualProfileId);
  const selectedManualWorkflow = manualWorkflows.find(
    (workflow) => workflow.workflowTemplateId === manualWorkflowId
  );
  const referenceCandidates = snapshot
    ? Object.values(snapshot.assets)
      .filter((asset) => (
        asset.source !== 'builtin' && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType)
      ))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    : [];
  const referenceCapability = resolveReferenceImageCapability({
    profile: selectedManualProfile,
    workflow: selectedManualWorkflow
  });
  const originalImage = originalImageId
    ? images.find((image) => image.asset.imageId === originalImageId)
    : undefined;
  const manualRoutingLocked = busy || executing || Boolean(draft?.tasks.some((task) =>
    ['awaiting-confirmation', 'queued', 'submitting', 'remote-pending', 'downloading', 'persisting'].includes(task.status)
  ));

  return (
    <>
      <StoryEntryBody
        entry={entry}
        visualsByBlock={visualsByBlock}
        actors={configuration.actors}
        actorIdAliases={configuration.actorIdAliases}
        dialogueAvatars={dialogueAvatars}
      />
      <section className="story-scene-tools" aria-label={`${entry.turnId} 场景图`}>
        {automationSettings.sceneMode === 'off' ? (
          <>
            <span>场景图已关闭</span>
            <button type="button" onClick={configuration.onOpenSettings}>文生图设置</button>
          </>
        ) : (
        <>
        <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
          {expanded ? '收起场景图工具' : '生成场景图'}
        </button>
        {images.length ? <span>{images.length} 张已显示</span> : null}
        {expanded ? (
          <div className="story-scene-workspace">
            {!entry.visualContext ? <p className="story-scene-warning">旧回合缺少冻结视觉上下文，已禁用生成以避免错绑当前地点或人物。</p> : null}
            {snapshot?.storySceneDisplayStates[entry.turnId]?.pendingReplacement ? (
              <p className="story-scene-warning">替换任务仍在结算；正文继续显示旧图，只有满足冻结替换条件后才会切换。</p>
            ) : null}
            <div className="story-scene-plan-controls">
              <label>
                本次图片档案
                <select
                  aria-label="手动场景图图片档案"
                  value={manualProfileId}
                  onChange={(event) => {
                    setManualProfileId(event.target.value);
                    setManualWorkflowId('');
                    setSelectedReferenceImageIds([]);
                    setDraft(undefined);
                    setEdits([]);
                  }}
                  disabled={manualRoutingLocked}
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
                    aria-label="手动场景图 ComfyUI API 工作流"
                    value={manualWorkflowId}
                    onChange={(event) => {
                      setManualWorkflowId(event.target.value);
                      setSelectedReferenceImageIds([]);
                      setDraft(undefined);
                      setEdits([]);
                    }}
                    disabled={manualRoutingLocked}
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
              <label>
                显示方式
                <select
                  aria-label="场景图显示方式"
                  value={displayOperation}
                  onChange={(event) => setDisplayOperation(event.target.value as 'append' | 'replace-group')}
                  disabled={busy || executing}
                >
                  <option value="append">追加新镜头（保留当前图片）</option>
                  <option value="replace-group" disabled={!images.length}>整组替换（全组成功才切换）</option>
                </select>
              </label>
              <label>
                本次最多
                <select value={maxScenes} onChange={(event) => setMaxScenes(Number(event.target.value))} disabled={busy || executing}>
                  {[1, 2, 3, 4].map((value) => <option value={value} key={value}>{value} 张</option>)}
                </select>
              </label>
              <label>
                本次额外要求（最高优先）
                <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={2} maxLength={4000} disabled={busy || executing} />
              </label>
              <div className="story-scene-actions">
                <button type="button" onClick={planScenes} disabled={busy || executing || !entry.visualContext}>规划并预览提示词</button>
                <button type="button" onClick={configuration.onOpenSettings}>文生图设置</button>
              </div>
              <p className="muted">选择会冻结到本次场景草稿；不会自动改用其他档案或工作流。</p>
              {manualRoutingError ? <p className="story-scene-error" role="alert">{manualRoutingError}</p> : null}
            </div>
            <fieldset className="story-scene-reference-picker">
              <legend>本次实际发送的参考图（可选）</legend>
              <p className="muted">
                {referenceCapability.supported
                  ? `${referenceCapability.label}。${referenceCapability.reason}`
                  : referenceCapability.reason}
                {' '}角色锚点图片与正文现有图片都不会自动发送；游戏内置美术不在候选中。
              </p>
              {referenceCandidates.length ? (
                <div className="story-scene-reference-grid">
                  {referenceCandidates.map((asset) => (
                    <label key={asset.imageId}>
                      <input
                        type="checkbox"
                        checked={selectedReferenceImageIds.includes(asset.imageId)}
                        disabled={manualRoutingLocked || !referenceCapability.supported}
                        onChange={(event) => {
                          setSelectedReferenceImageIds((current) => {
                            if (!event.target.checked) {
                              return current.filter((imageId) => imageId !== asset.imageId);
                            }
                            if (current.length >= referenceCapability.maxImages) {
                              setError(`当前参考图协议最多允许 ${referenceCapability.maxImages} 张。`);
                              return current;
                            }
                            setError('');
                            return [...current, asset.imageId];
                          });
                          setDraft(undefined);
                          setEdits([]);
                        }}
                      />
                      <span>
                        {asset.imageId} · {asset.originPurpose ?? '未分类'} · {asset.width}×{asset.height}
                      </span>
                    </label>
                  ))}
                </div>
              ) : <p className="muted">当前存档没有可发送的 PNG、JPEG 或 WebP 玩家资产。</p>}
            </fieldset>
            {draft?.tasks.map((task, index) => {
              const shotId = task.intent.type === 'scene-image' ? task.intent.shotId : '';
              const shot = draft.plan.shots.find((candidate) => candidate.shotId === shotId);
              const edit = edits.find((candidate) => candidate.shotId === shotId);
              return (
                <article className="story-scene-prompt-card" key={task.taskId}>
                  <h4>场景 {index + 1}</h4>
                  <small>显示操作：{draft.plan.displayOperation === 'replace-group'
                    ? '整组替换'
                    : draft.plan.displayOperation === 'replace-shot'
                      ? '单图重生'
                      : '追加新镜头'}</small>
                  <p>{shot?.sceneSummary}</p>
                  <small>放置于正文第 {(shot?.placement.blockIndex ?? 0) + 1} 段 · 人物 {shot?.knownActorIds.join('、') || '无稳定角色绑定'}</small>
                  {task.draft ? (
                    <div className="character-prompt-execution-summary" aria-label={`场景 ${index + 1} 执行摘要`}>
                      <dl>
                        <div><dt>图片档案</dt><dd>{task.draft.imageProfileId} / {task.draft.providerType}</dd></div>
                        <div><dt>执行目标</dt><dd>{sceneExecutionTargetLabel(task)}</dd></div>
                        <div><dt>目标画幅</dt><dd>{task.draft.targetAspectRatio}</dd></div>
                        <div><dt>模型提示词格式</dt><dd>{task.draft.promptDialectPresetId}</dd></div>
                        <div><dt>负向词传输</dt><dd>{negativePromptModeLabels[task.draft.negativePromptMode]}</dd></div>
                        <div><dt>传输兼容性</dt><dd>{task.draft.transportCompatibility === 'compatible' ? '已验证可执行' : '旧任务未记录'}</dd></div>
                        <div><dt>参考图片</dt><dd>{task.intent.type === 'scene-image' && task.intent.referenceImageIds.length
                          ? task.intent.referenceImageIds.join('、') : '无'}</dd></div>
                        <div><dt>参考图传输</dt><dd>{task.draft.referenceImageTransport.kind}</dd></div>
                        <div><dt>稳定角色</dt><dd>{shot?.knownActorIds.join('、') || '无'}</dd></div>
                        <div><dt>人物装扮来源</dt><dd>{task.intent.type === 'scene-image' &&
                          task.intent.participantAnchorSnapshots.length
                          ? task.intent.participantAnchorSnapshots.map((participant) => (
                            participant.sceneSpecificAppearance?.trim()
                              ? `${participant.actorId}：本镜头覆盖（${participant.sceneSpecificAppearance}）`
                              : `${participant.actorId}：锚点默认服装`
                          )).join('；')
                          : '无稳定角色'}</dd></div>
                      </dl>
                      {task.draft.referenceImages.length ? (
                        <details>
                          <summary>查看冻结的参考图元数据</summary>
                          <pre>{JSON.stringify(task.draft.referenceImages, null, 2)}</pre>
                        </details>
                      ) : null}
                      <details>
                        <summary>查看本次实际生成参数（不含凭据）</summary>
                        <pre>{sceneExecutionParametersLabel(task)}</pre>
                      </details>
                      <details>
                        <summary>查看语义段、模型格式段与实际传输提示词</summary>
                        <h5>供应商无关语义段</h5>
                        <pre>{JSON.stringify(task.draft.semanticPromptSegments ?? [], null, 2)}</pre>
                        <h5>模型格式转换段</h5>
                        <pre>{JSON.stringify(task.draft.formattedPromptSegments ?? [], null, 2)}</pre>
                        <h5>按当前手动编辑计算的实际传输</h5>
                        <pre>{JSON.stringify(resolveActualTransportPrompts({
                          positive: edit?.positivePrompt ?? '',
                          negative: edit?.negativePrompt ?? ''
                        }, task.draft.negativePromptMode, task.draft.promptDialectFamily), null, 2)}</pre>
                      </details>
                    </div>
                  ) : null}
                  <label>
                    最终正向提示词
                    <textarea
                      rows={6}
                      value={edit?.positivePrompt ?? ''}
                      disabled={task.status !== 'awaiting-confirmation'}
                      onChange={(event) => setEdits((current) => current.map((candidate) => (
                        candidate.shotId === edit?.shotId ? { ...candidate, positivePrompt: event.target.value } : candidate
                      )))}
                    />
                  </label>
                  <label>
                    最终负向提示词
                    <textarea
                      rows={3}
                      value={edit?.negativePrompt ?? ''}
                      disabled={task.status !== 'awaiting-confirmation'}
                      onChange={(event) => setEdits((current) => current.map((candidate) => (
                        candidate.shotId === edit?.shotId ? { ...candidate, negativePrompt: event.target.value } : candidate
                      )))}
                    />
                  </label>
                  <small>状态：{task.status}{stages[task.taskId] ? ` · ${stages[task.taskId]}` : ''}</small>
                </article>
              );
            })}
            {draft?.tasks.some((task) => task.status === 'awaiting-confirmation') ? (
              <div className="story-scene-actions">
                <button type="button" onClick={confirmPrompts} disabled={busy || executing}>确认并冻结提示词</button>
                <button type="button" onClick={cancelPreview} disabled={busy || executing}>取消预览</button>
              </div>
            ) : null}
            {draft?.tasks.length && draft.tasks.every((task) => task.status === 'queued') ? (
              <div className="story-scene-actions">
                <button type="button" onClick={() => void execute()} disabled={executing}>开始生成</button>
              </div>
            ) : null}
            {executing ? <button type="button" onClick={() => executionControllerRef.current?.abort()}>取消本批次</button> : null}
            {draft?.tasks.some((task) => task.status === 'failed') ? (
              <button type="button" onClick={retryFailed} disabled={busy || executing}>重试失败镜头</button>
            ) : null}
            {notice ? <p className="story-scene-notice" role="status">{notice}</p> : null}
            {error ? <p className="story-scene-error" role="alert">{error}</p> : null}
            {hasUnresolvedFailedSceneTask(turnTasks) ? <p className="story-scene-warning">有失败任务。重试会复用原冻结请求；重新规划时由“显示方式”明确决定追加或整组替换。</p> : null}
          </div>
        ) : null}
        </>
        )}
      </section>
      {originalImage ? (
        <VisualAssetOriginalDialog
          repository={configuration.repository}
          asset={originalImage.asset}
          alt={originalImage.sceneSummary}
          onClose={() => setOriginalImageId(undefined)}
        />
      ) : null}
    </>
  );
}
