import {
  compileScenePrompt,
  EMPTY_IMAGE_PROMPT_MODIFIERS,
  resolveBuiltInImagePromptDialectFamily,
  resolveActualTransportPrompts,
  resolveDefaultImagePromptDialectPresetId,
  type FormattedProviderPrompt,
  type ImagePromptModifier,
  validateSceneShotPromptOutput,
  validateTurnScenePlanningInputIntegrity,
  validateTurnScenePlanningOutput,
  type ImagePromptModifierSet,
  type SceneShotPromptOutput,
  type SemanticImagePrompt,
  type TurnScenePlanningInput,
  type TurnScenePlanningOutput,
  type VisualWorldContext
} from './promptConversion';
import {
  createConnectionFingerprint,
  createExecutionFingerprint,
  readComfyWorkflowCheckpointName,
  type ComfyWorkflowTemplate,
  type ImageApiCredentialSummary,
  type ImageApiProfile
} from './profile';
import type { CharacterDraftExecutionConfig, CharacterImageExecutor } from './characterVisualWorkflow';
import {
  applyImageGenerationPreset,
  type ImageGenerationPreset
} from './generationPresets';
import {
  appendSceneShots,
  beginSceneReplacement,
  cancelTask,
  createImageGenerationTask,
  failTask,
  markTaskDownloading,
  markTaskPersisting,
  markTaskRemotePending,
  prepareTaskDraft,
  resolveSceneReplacement,
  startTaskAttempt,
  submitTask,
  type ImageGenerationTask,
  type ReferenceImageSnapshot,
  type ReferenceImageTransportSnapshot,
  type StoredScenePlan,
  type StorySceneDisplayState,
  type SubmittedImageRequestSnapshot,
  type VisualImageInput,
  type VisualRepository
} from './visualRepository';
import {
  resolvePngStyleSemanticSegments,
  type PngStyleLibrarySettings
} from './pngStyle';

export const SCENE_VISUAL_EXECUTION_TARGET = { aspectRatio: '16:9' as const, width: 1024, height: 576 };

export interface ScenePromptEdit {
  shotId: string;
  positivePrompt: string;
  negativePrompt: string;
}

export interface ManualScenePlanDraft {
  plan: StoredScenePlan;
  tasks: ImageGenerationTask[];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createManualScenePlanDraft(input: {
  repository: Pick<VisualRepository, 'saveScenePlanWithTasks'>;
  saveId: string;
  planningInput: TurnScenePlanningInput;
  planningOutput: TurnScenePlanningOutput;
  world: VisualWorldContext;
  promptOutputs: SceneShotPromptOutput[];
  execution: CharacterDraftExecutionConfig;
  oneTimeInstruction?: string;
  referenceImages?: ReferenceImageSnapshot[];
  referenceImageTransport?: ReferenceImageTransportSnapshot;
  modifiers?: ImagePromptModifierSet;
  styleModifiers?: ImagePromptModifier[];
  pngStyleSettings?: PngStyleLibrarySettings;
  renderPrompt?: (input: {
    semanticPrompt: SemanticImagePrompt;
    execution: CharacterDraftExecutionConfig;
    shotId: string;
  }) => Promise<FormattedProviderPrompt>;
  mode?: StoredScenePlan['mode'];
  displayOperation?: 'append' | 'replace-group';
  taskSource?: ImageGenerationTask['source'];
  submissionMode?: ImageGenerationTask['submissionMode'];
  generationPurpose?: 'avg_scene_background';
  generationTargetKey?: string;
  now?: string;
  createId?: () => string;
}): Promise<ManualScenePlanDraft> {
  const inputIssues = await validateTurnScenePlanningInputIntegrity(input.planningInput);
  const outputIssues = validateTurnScenePlanningOutput(input.planningInput, input.planningOutput);
  if (inputIssues.length || outputIssues.length) throw new Error([...inputIssues, ...outputIssues].join('；'));
  if (input.promptOutputs.length !== input.planningOutput.shots.length) {
    throw new Error('每个场景镜头必须恰好对应一份最终提示词。');
  }

  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const planId = `scene-plan:${createId()}`;
  const actorContexts = new Map(input.planningInput.actors.map((actor) => [actor.actorId, actor]));
  const shots = input.planningOutput.shots.map((shot) => ({ ...shot, shotId: `scene-shot:${createId()}` }));
  const plan: StoredScenePlan = {
    planId,
    saveId: input.saveId,
    sourceTurnId: input.planningInput.sourceTurnId,
    sourceStoryTextHash: input.planningInput.sourceStoryTextHash,
    mode: input.mode ?? 'manual',
    displayOperation: input.displayOperation ?? 'append',
    requestedMaxScenes: input.planningInput.requestedMaxScenes,
    shots,
    createdAt: now
  };

  const tasks: ImageGenerationTask[] = [];
  const referenceImages = structuredClone(input.referenceImages ?? []);
  const referenceImageTransport = referenceImages.length
    ? input.referenceImageTransport
    : { kind: 'none' as const };
  if (referenceImages.length && !referenceImageTransport) {
    throw new Error('场景图已选择参考图，但没有冻结参考图传输协议。');
  }
  for (const [index, shot] of shots.entries()) {
    const output = input.promptOutputs[index]!;
    const participants = shot.knownActorIds.map((actorId) => {
      const actor = actorContexts.get(actorId);
      if (!actor) throw new Error(`场景镜头引用了没有冻结锚点的角色 ${actorId}。`);
      return {
        ...actor,
        sceneSpecificAppearance: shot.actorVisualStates.find((state) => state.actorId === actorId)?.sceneSpecificAppearance
      };
    });
    const promptIssues = validateSceneShotPromptOutput({
      shot,
      participants,
      world: input.world,
      oneTimeInstruction: input.oneTimeInstruction
    }, output);
    if (promptIssues.length) throw new Error(`镜头 ${index + 1}：${promptIssues.join('；')}`);
    const semanticPrompt = compileScenePrompt(
      output,
      input.modifiers ?? EMPTY_IMAGE_PROMPT_MODIFIERS,
      input.styleModifiers,
      input.pngStyleSettings
        ? resolvePngStyleSemanticSegments(
            input.pngStyleSettings,
            'narrative-scene',
            input.execution.promptDialectFamily
          )
        : []
    );
    const formattedPrompt = input.renderPrompt
      ? await input.renderPrompt({ semanticPrompt, execution: input.execution, shotId: shot.shotId })
      : {
          dialectPresetId: input.execution.promptDialectPresetId,
          semanticSegments: structuredClone(semanticPrompt.segments),
          formattedSegments: semanticPrompt.segments.map((segment) => ({
            segmentId: segment.segmentId,
            positive: segment.positive,
            negative: segment.negative
          })),
          positive: semanticPrompt.positive,
          negative: semanticPrompt.negative
        };
    if (formattedPrompt.dialectPresetId !== input.execution.promptDialectPresetId) {
      throw new Error('格式化提示词与生成预设选择的模型提示词格式不一致。');
    }
    const transport = resolveActualTransportPrompts(
      formattedPrompt,
      input.execution.negativePromptMode,
      formattedPrompt.dialectFamily ?? input.execution.promptDialectFamily
    );
    const intentId = `scene-intent:${createId()}`;
    const taskId = `scene-task:${createId()}`;
    const intent = {
      type: 'scene-image' as const,
      intentId,
      saveId: input.saveId,
      turnId: input.planningInput.sourceTurnId,
      scenePlanId: planId,
      shotId: shot.shotId,
      participantAnchorSnapshots: participants.map((participant) => ({
        actorId: participant.actorId,
        anchorText: participant.anchorText,
        ...(participant.persistentAdditionalRequirementText
          ? { persistentAdditionalRequirementText: participant.persistentAdditionalRequirementText }
          : {}),
        ...(participant.sceneSpecificAppearance
          ? { sceneSpecificAppearance: participant.sceneSpecificAppearance }
          : {})
      })),
      oneTimeInstruction: input.oneTimeInstruction?.trim() ?? '',
      referenceImageIds: referenceImages.map((reference) => reference.imageId),
      ...(input.generationPurpose ? { generationPurpose: input.generationPurpose } : {}),
      ...(input.generationTargetKey?.trim()
        ? { generationTargetKey: input.generationTargetKey.trim() }
        : {}),
      createdAt: now
    };
    const compiling = createImageGenerationTask({
      taskId,
      saveId: input.saveId,
      source: input.taskSource ?? 'manual',
      submissionMode: input.submissionMode ?? 'manual',
      intent,
      createdAt: now
    });
    tasks.push(prepareTaskDraft(compiling, {
      ...input.execution,
      intentId,
      positivePrompt: formattedPrompt.positive,
      negativePrompt: formattedPrompt.negative,
      semanticPromptSegments: structuredClone(formattedPrompt.semanticSegments),
      formattedPromptSegments: structuredClone(formattedPrompt.formattedSegments),
      promptDialectFamily: formattedPrompt.dialectFamily ?? input.execution.promptDialectFamily,
      transportPrompt: transport.prompt,
      transportNegativePrompt: transport.negativePrompt,
      transportNegativeResolution: transport.resolution,
      transportCompatibility: 'compatible',
      referenceImages,
      referenceImageTransport: referenceImageTransport ?? { kind: 'none' },
      sourceAnchorHashes: await Promise.all(participants.map((participant) => sha256(participant.anchorText))),
      compiledAt: now
    }, now));
  }
  await input.repository.saveScenePlanWithTasks(plan, tasks);
  return { plan, tasks };
}

export async function confirmManualScenePlan(input: {
  repository: Pick<VisualRepository, 'saveTask'> & Partial<Pick<VisualRepository, 'saveScenePlanWithTasks'>>;
  draft: ManualScenePlanDraft;
  edits: ScenePromptEdit[];
  persistPlanOnConfirmation?: boolean;
  now?: string;
}): Promise<ManualScenePlanDraft> {
  const now = input.now ?? new Date().toISOString();
  const edits = new Map(input.edits.map((edit) => [edit.shotId, edit]));
  const tasks: ImageGenerationTask[] = [];
  for (const task of input.draft.tasks) {
    if (task.intent.type !== 'scene-image' || !task.draft) throw new Error('场景图任务缺少可确认草稿。');
    const edit = edits.get(task.intent.shotId);
    if (!edit?.positivePrompt.trim()) throw new Error('最终正向提示词不能为空。');
    const changed = edit.positivePrompt !== task.draft.positivePrompt || edit.negativePrompt !== task.draft.negativePrompt;
    const transport = resolveActualTransportPrompts({
      positive: edit.positivePrompt.trim(),
      negative: edit.negativePrompt.trim()
    }, task.draft.negativePromptMode, task.draft.promptDialectFamily);
    const visibleDraft = prepareTaskDraft(task, {
      ...task.draft,
      positivePrompt: edit.positivePrompt.trim(),
      negativePrompt: edit.negativePrompt.trim(),
      transportPrompt: transport.prompt,
      transportNegativePrompt: transport.negativePrompt,
      transportNegativeResolution: transport.resolution,
      transportCompatibility: 'compatible'
    }, now);
    const submitted: SubmittedImageRequestSnapshot = {
      ...visibleDraft.draft!,
      requestFingerprint: await sha256(visibleDraft.draft),
      submittedAt: now,
      userEdited: changed
    };
    const queued = submitTask(visibleDraft, submitted, now);
    tasks.push(queued);
  }
  if (input.persistPlanOnConfirmation) {
    if (!input.repository.saveScenePlanWithTasks) {
      throw new Error('当前视觉仓库不支持在确认时原子保存场景计划与任务。');
    }
    await input.repository.saveScenePlanWithTasks(input.draft.plan, tasks);
  } else {
    for (const task of tasks) await input.repository.saveTask(task);
  }
  return { plan: input.draft.plan, tasks };
}

export async function cancelManualScenePlanDraft(input: {
  repository: Pick<VisualRepository, 'saveTask'>;
  draft: ManualScenePlanDraft;
  now?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  for (const task of input.draft.tasks) {
    if (['succeeded', 'failed', 'cancelled'].includes(task.status)) continue;
    await input.repository.saveTask(cancelTask(task, {
      reason: 'user',
      remoteCancellation: 'not-needed',
      cancelledAt: now
    }));
  }
}

export async function createFailedSceneRetryDraft(input: {
  repository: Pick<VisualRepository, 'saveTask'>;
  plan: StoredScenePlan;
  failedTasks: ImageGenerationTask[];
  submissionMode?: ImageGenerationTask['submissionMode'];
  now?: string;
  createId?: () => string;
}): Promise<ManualScenePlanDraft> {
  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const tasks: ImageGenerationTask[] = [];
  for (const failed of input.failedTasks) {
    if (failed.status !== 'failed' || failed.intent.type !== 'scene-image' || !failed.submittedRequest) continue;
    const intentId = `scene-intent:${createId()}`;
    const compiling = createImageGenerationTask({
      taskId: `scene-task:${createId()}`,
      saveId: failed.saveId,
      source: 'retry',
      submissionMode: input.submissionMode ?? 'manual',
      sourceTaskId: failed.taskId,
      intent: { ...failed.intent, intentId, createdAt: now },
      createdAt: now
    });
    const {
      requestFingerprint: _requestFingerprint,
      submittedAt: _submittedAt,
      userEdited: _userEdited,
      ...sourceDraft
    } = failed.submittedRequest;
    const task = prepareTaskDraft(compiling, { ...sourceDraft, intentId, compiledAt: now }, now);
    await input.repository.saveTask(task);
    tasks.push(task);
  }
  if (!tasks.length) throw new Error('当前没有可重试的失败场景图任务。');
  return { plan: input.plan, tasks };
}

export async function createSceneShotRegenerationDraft(input: {
  repository: Pick<VisualRepository, 'saveScenePlanWithTasks'>;
  sourcePlan: StoredScenePlan;
  sourceShotId: string;
  sourceTask: ImageGenerationTask;
  execution: CharacterDraftExecutionConfig;
  referenceImages?: ReferenceImageSnapshot[];
  referenceImageTransport?: ReferenceImageTransportSnapshot;
  taskSource?: ImageGenerationTask['source'];
  displayOperation?: 'replace-shot' | 'append';
  persistDraft?: boolean;
  now?: string;
  createId?: () => string;
}): Promise<ManualScenePlanDraft> {
  if (input.sourceTask.intent.type !== 'scene-image' || input.sourceTask.intent.shotId !== input.sourceShotId) {
    throw new Error('单图重生来源任务与 SceneShot 不一致。');
  }
  const taskSource = input.taskSource ?? 'regenerate';
  if (!input.sourceTask.submittedRequest || (taskSource !== 'reuse-prompt' && input.sourceTask.status !== 'succeeded')) {
    throw new Error('只有已经成功并保存冻结请求的场景图可以单图重生。');
  }
  const sourceShot = input.sourcePlan.shots.find((shot) => shot.shotId === input.sourceShotId);
  if (!sourceShot) throw new Error('找不到被重生的 SceneShot。');

  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const displayOperation = input.displayOperation ?? 'replace-shot';
  const planId = `scene-plan:${createId()}`;
  const shotId = `scene-shot:${createId()}`;
  const intentId = `scene-intent:${createId()}`;
  const taskId = `scene-task:${createId()}`;
  const plan: StoredScenePlan = {
    planId,
    saveId: input.sourcePlan.saveId,
    sourceTurnId: input.sourcePlan.sourceTurnId,
    sourceStoryTextHash: input.sourcePlan.sourceStoryTextHash,
    mode: 'manual',
    displayOperation,
    ...(displayOperation === 'replace-shot' ? { replacementTargetShotId: input.sourceShotId } : {}),
    requestedMaxScenes: 1,
    shots: [{ ...sourceShot, shotId, order: 0 }],
    createdAt: now
  };
  const referenceImages = structuredClone(input.referenceImages ?? []);
  const referenceImageTransport = referenceImages.length
    ? input.referenceImageTransport
    : { kind: 'none' as const };
  if (referenceImages.length && !referenceImageTransport) {
    throw new Error('单图重生已选择参考图，但没有冻结参考图传输协议。');
  }
  const intent = {
    ...input.sourceTask.intent,
    intentId,
    scenePlanId: planId,
    shotId,
    referenceImageIds: referenceImages.map((reference) => reference.imageId),
    createdAt: now
  };
  const compiling = createImageGenerationTask({
    taskId,
    saveId: plan.saveId,
    source: taskSource,
    submissionMode: 'manual',
    sourceTaskId: input.sourceTask.taskId,
    intent,
    createdAt: now
  });
  const {
    requestFingerprint: _requestFingerprint,
    submittedAt: _submittedAt,
    userEdited: _userEdited,
    ...sourceDraft
  } = input.sourceTask.submittedRequest;
  const task = prepareTaskDraft(compiling, {
    ...sourceDraft,
    ...input.execution,
    intentId,
    positivePrompt: input.sourceTask.submittedRequest.positivePrompt,
    negativePrompt: input.sourceTask.submittedRequest.negativePrompt,
    referenceImages,
    referenceImageTransport: referenceImageTransport ?? { kind: 'none' },
    compiledAt: now
  }, now);
  if (input.persistDraft !== false) await input.repository.saveScenePlanWithTasks(plan, [task]);
  return { plan, tasks: [task] };
}

async function executeQueuedSceneTask(input: {
  repository: VisualRepository;
  queued: ImageGenerationTask;
  executor: CharacterImageExecutor;
  signal?: AbortSignal;
  onTaskStage?: (taskId: string, stage: string) => void;
  now: () => string;
  createId: () => string;
}): Promise<void> {
  const { queued } = input;
  if (input.signal?.aborted) {
    await input.repository.saveTask(cancelTask(queued, {
      reason: 'user', remoteCancellation: 'not-needed', cancelledAt: input.now()
    }));
    return;
  }
  let task = startTaskAttempt(queued, input.now());
  await input.repository.saveTask(task);
  try {
    const outputs = await input.executor.generate(task, {
      signal: input.signal,
      onStage: (stage) => input.onTaskStage?.(task.taskId, stage),
      onRemoteTask: async (remoteTaskId) => {
        task = markTaskRemotePending(task, {
          providerType: task.submittedRequest!.providerType,
          remoteTaskId,
          submittedAt: input.now()
        }, input.now());
        await input.repository.saveTask(task);
      }
    });
    if (!outputs.length) throw new Error('图片执行器没有返回图片。');
    const images: VisualImageInput[] = outputs.map((output) => {
      const id = input.createId();
      return {
        imageId: `scene-image:${id}`,
        blobKey: `scene-blob:${id}`,
        blob: output.blob,
        width: output.width,
        height: output.height
      };
    });
    if (input.signal?.aborted) {
      task = cancelTask(task, {
        reason: 'user',
        remoteCancellation: task.remoteHandle ? 'requested-unconfirmed' : 'unsupported',
        cancelledAt: input.now()
      });
      await input.repository.saveTask(task);
      await input.repository.persistLateTaskImages(task.saveId, task.taskId, images, input.now());
      return;
    }
    task = markTaskDownloading(task, input.now());
    await input.repository.saveTask(task);
    task = markTaskPersisting(task, input.now());
    await input.repository.saveTask(task);
    await input.repository.completeTaskWithImages(task.saveId, task.taskId, images, input.now());
  } catch (error) {
    const cancelled = input.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
    if (cancelled) {
      await input.repository.saveTask(cancelTask(task, {
        reason: 'user',
        remoteCancellation: task.remoteHandle ? 'requested-unconfirmed' : 'unsupported',
        cancelledAt: input.now()
      }));
    } else {
      await input.repository.saveTask(failTask(task, {
        code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code : 'generation-failed',
        message: error instanceof Error ? error.message : '图片生成失败。',
        retriable: error && typeof error === 'object' && 'retriable' in error && typeof error.retriable === 'boolean'
          ? error.retriable : true
      }, input.now()));
    }
  }
}

export async function executeConfirmedScenePlan(input: {
  repository: VisualRepository;
  confirmed: ManualScenePlanDraft;
  executor: CharacterImageExecutor;
  updateStorySceneDisplay?: boolean;
  signal?: AbortSignal;
  concurrency?: number;
  onTaskStage?: (taskId: string, stage: string) => void;
  now?: () => string;
  createId?: () => string;
}): Promise<StorySceneDisplayState> {
  if (input.confirmed.tasks.length === 0) {
    throw new Error('场景计划没有可执行的图片任务。');
  }
  const concurrency = Math.max(1, Math.min(4, Math.trunc(input.concurrency ?? 1)));
  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.createId ?? (() => crypto.randomUUID());
  let snapshot = await input.repository.loadSnapshot(input.confirmed.plan.saveId);
  let displayState = snapshot.storySceneDisplayStates[input.confirmed.plan.sourceTurnId] ?? {
    saveId: input.confirmed.plan.saveId,
    turnId: input.confirmed.plan.sourceTurnId,
    activeShotIds: [],
    updatedAt: now()
  };
  const updateStorySceneDisplay = input.updateStorySceneDisplay ?? true;
  const operation = input.confirmed.plan.displayOperation ?? 'append';
  if (updateStorySceneDisplay && displayState.pendingReplacement && displayState.pendingReplacement.scenePlanId !== input.confirmed.plan.planId) {
    throw new Error('当前回合已有另一项待决替换，不能开始新的场景显示操作。');
  }
  if (updateStorySceneDisplay && operation !== 'append') {
    const targets = operation === 'replace-shot'
      ? [input.confirmed.plan.replacementTargetShotId ?? '']
      : [...displayState.activeShotIds];
    displayState = beginSceneReplacement(
      displayState,
      input.confirmed.plan.planId,
      operation,
      input.confirmed.plan.shots.map((shot) => shot.shotId),
      targets,
      now()
    );
    await input.repository.saveStorySceneDisplayState(displayState);
  }

  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, input.confirmed.tasks.length) }, async () => {
    while (cursor < input.confirmed.tasks.length) {
      const queued = input.confirmed.tasks[cursor++];
      if (!queued) return;
      await executeQueuedSceneTask({
        repository: input.repository,
        queued,
        executor: input.executor,
        signal: input.signal,
        onTaskStage: input.onTaskStage,
        now,
        createId
      });
    }
  });
  await Promise.all(workers);

  snapshot = await input.repository.loadSnapshot(input.confirmed.plan.saveId);
  if (!updateStorySceneDisplay) return displayState;
  displayState = snapshot.storySceneDisplayStates[input.confirmed.plan.sourceTurnId] ?? displayState;
  const currentBatchTasks = input.confirmed.tasks
    .map((task) => snapshot.tasks[task.taskId])
    .filter((task): task is ImageGenerationTask => Boolean(task));
  const successfulCurrentShotIds = currentBatchTasks.flatMap((task) => (
    task.status === 'succeeded' && task.intent.type === 'scene-image' ? [task.intent.shotId] : []
  ));
  if (operation === 'append') {
    displayState = appendSceneShots({
      current: displayState,
      saveId: input.confirmed.plan.saveId,
      turnId: input.confirmed.plan.sourceTurnId,
      shotIds: successfulCurrentShotIds,
      updatedAt: now()
    });
  } else {
    const succeededAcrossPlan = new Set(Object.values(snapshot.tasks).flatMap((task) => (
      task.status === 'succeeded' && task.intent.type === 'scene-image' && task.intent.scenePlanId === input.confirmed.plan.planId
        ? [task.intent.shotId]
        : []
    )));
    displayState = resolveSceneReplacement({
      current: displayState,
      succeededShotIds: input.confirmed.plan.shots
        .map((shot) => shot.shotId)
        .filter((shotId) => succeededAcrossPlan.has(shotId)),
      allTasksTerminal: currentBatchTasks.every((task) => ['succeeded', 'failed', 'cancelled'].includes(task.status)),
      updatedAt: now()
    });
  }
  await input.repository.saveStorySceneDisplayState(displayState);
  return displayState;
}

function selectedModel(profile: Exclude<ImageApiProfile, { providerType: 'comfyui-workflow' }>): string {
  const selected = profile.defaultModelId && profile.models.some((model) => model.modelId === profile.defaultModelId)
    ? profile.defaultModelId : profile.models[0]?.modelId;
  if (!selected) throw new Error('当前图片档案还没有可用模型。');
  return selected;
}

interface SceneDraftExecutionConfigInput {
  profile: ImageApiProfile;
  credential?: Pick<ImageApiCredentialSummary, 'credentialId' | 'revision'>;
  workflow?: ComfyWorkflowTemplate;
  preset?: ImageGenerationPreset;
}

async function createBuiltInSceneDraftExecutionConfigBase(
  input: Omit<SceneDraftExecutionConfigInput, 'preset'>
): Promise<CharacterDraftExecutionConfig> {
  const { profile } = input;
  if (!profile.enabled) throw new Error('当前图片档案尚未启用。');
  const connectionFingerprint = await createConnectionFingerprint(profile, input.credential);
  const presetRevision = 1;
  const presetId = `builtin-scene-landscape:${profile.providerType}`;
  const target = SCENE_VISUAL_EXECUTION_TARGET;
  const promptDialectPresetId = resolveDefaultImagePromptDialectPresetId(
    profile.providerType,
    profile.providerType === 'comfyui-workflow'
      ? readComfyWorkflowCheckpointName(input.workflow)
      : selectedModel(profile)
  );
  const common = {
    imageProfileId: profile.profileId,
    providerType: profile.providerType,
    connectionFingerprint,
    imageGenerationPresetId: presetId,
    imageGenerationPresetRevision: presetRevision,
    promptDialectPresetId,
    promptDialectFamily: resolveBuiltInImagePromptDialectFamily(promptDialectPresetId),
    targetAspectRatio: target.aspectRatio,
    referenceImages: [] as ReferenceImageSnapshot[],
    referenceImageTransport: { kind: 'none' }
  } as const;

  if (profile.providerType === 'comfyui-workflow') {
    const workflow = input.workflow;
    if (!workflow) throw new Error('当前 ComfyUI 档案还没有可用 API 工作流。');
    return {
      ...common,
      executionFingerprint: await createExecutionFingerprint({
        connectionFingerprint, presetId, presetRevision, workflowHash: workflow.workflowHash,
        executionParameters: { ...target, promptDialectPresetId }
      }),
      executionTarget: {
        kind: 'comfy-workflow', workflowTemplateId: workflow.workflowTemplateId, workflowRevision: workflow.revision
      },
      negativePromptMode: workflow.bindings.negativePrompt ? 'separate' : 'workflow-controlled',
      generationParameters: {
        providerType: 'comfyui-workflow', workflowTemplateId: workflow.workflowTemplateId,
        overrides: { width: target.width, height: target.height, seed: { mode: 'provider-random' } }
      }
    };
  }

  const modelId = selectedModel(profile);
  const executionFingerprint = await createExecutionFingerprint({
    connectionFingerprint, modelId, presetId, presetRevision,
    executionParameters: { ...target, promptDialectPresetId }
  });
  const executionTarget = { kind: 'model' as const, modelId };
  switch (profile.providerType) {
    case 'openai-images':
      return {
        ...common, executionFingerprint, executionTarget,
        negativePromptMode: profile.config.compatibilityOverrides?.negativePromptMode === 'unsupported'
          ? 'unsupported' : 'merged-into-positive',
        generationParameters: {
          providerType: 'openai-images', requestedImageCount: 1,
          size: { mode: 'dimensions', width: 1536, height: 1024 }, quality: 'medium',
          outputFormat: 'png', background: 'opaque'
        }
      };
    case 'xai-images':
      return { ...common, executionFingerprint, executionTarget, negativePromptMode: 'merged-into-positive',
        generationParameters: { providerType: 'xai-images', requestedImageCount: 1, aspectRatio: '16:9', resolution: '1k' } };
    case 'gemini-image':
      return { ...common, executionFingerprint, executionTarget, negativePromptMode: 'merged-into-positive',
        generationParameters: { providerType: 'gemini-image', requestedImageCount: 1, aspectRatio: '16:9', imageSize: '1K', mimeType: 'image/png' } };
    case 'alibaba-model-studio':
      return { ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: { providerType: 'alibaba-model-studio', requestedImageCount: 1,
          size: { mode: 'dimensions', width: target.width, height: target.height }, seed: { mode: 'provider-random' },
          watermark: 'provider-default', promptEnhancement: 'provider-default', thinkingMode: 'provider-default' } };
    case 'novelai-image':
      return { ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: { providerType: 'novelai-image', requestedImageCount: 1,
          width: target.width, height: target.height, seed: { mode: 'provider-random' } } };
    case 'sd-webui':
      return { ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: { providerType: 'sd-webui', requestedImageCount: 1,
          width: target.width, height: target.height, seed: { mode: 'provider-random' }, checkpoint: modelId } };
  }
}

export async function createBuiltInSceneDraftExecutionConfig(
  input: SceneDraftExecutionConfigInput
): Promise<CharacterDraftExecutionConfig> {
  const base = await createBuiltInSceneDraftExecutionConfigBase(input);
  return input.preset
    ? applyImageGenerationPreset({
      base,
      profile: input.profile,
      variantKey: 'narrative-scene',
      preset: input.preset,
      workflow: input.workflow
    })
    : base;
}
