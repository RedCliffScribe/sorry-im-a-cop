import {
  compileCharacterPrompt,
  DEFAULT_CHARACTER_COMPOSITION,
  CHARACTER_VISUAL_PURPOSES,
  EMPTY_IMAGE_PROMPT_MODIFIERS,
  resolveBuiltInImagePromptDialectFamily,
  resolveDefaultImagePromptDialectPresetId,
  resolveActualTransportPrompts,
  type CharacterComposition,
  type CharacterViewPrompt,
  type CharacterVisualPurpose,
  type FormattedProviderPrompt,
  type ImagePromptModifier,
  type ImagePromptModifierSet,
  type SemanticImagePrompt
} from './promptConversion';
import {
  createConnectionFingerprint,
  createExecutionFingerprint,
  readComfyWorkflowCheckpointName,
  type ComfyWorkflowTemplate,
  type ImageApiCredentialSummary,
  type ImageApiProfile
} from './profile';
import {
  prepareTaskDraft,
  cancelTask,
  createFailedPurposeRetryBatch,
  createImageGenerationTask,
  failTask,
  markTaskDownloading,
  markTaskPersisting,
  markTaskRemotePending,
  refreshCharacterBatchStatus,
  startTaskAttempt,
  submitTask,
  type CharacterImageGenerationBatch,
  type CharacterImageIntent,
  type CharacterVisualAnchor,
  type CompiledImageRequestDraftSnapshot,
  type ImageGenerationTask,
  type ReferenceImageSnapshot,
  type ReferenceImageTransportSnapshot,
  type SubmittedImageRequestSnapshot,
  type VisualImageInput,
  type VisualRepository
} from './visualRepository';
import {
  applyImageGenerationPreset,
  type ImageGenerationPreset
} from './generationPresets';
import {
  resolvePngStyleSemanticSegments,
  type PngStyleLibrarySettings
} from './pngStyle';

export type CharacterDraftExecutionConfig = Omit<
  CompiledImageRequestDraftSnapshot,
  | 'intentId'
  | 'positivePrompt'
  | 'negativePrompt'
  | 'characterComposition'
  | 'sourceAnchorHashes'
  | 'compiledAt'
>;

export interface CharacterPromptEdit {
  purpose: CharacterVisualPurpose;
  positivePrompt: string;
  negativePrompt: string;
}

export interface ManualCharacterBatchDraft {
  batch: CharacterImageGenerationBatch;
  tasks: ImageGenerationTask[];
}

export interface CharacterImageExecutionOutput {
  blob: Blob;
  width: number;
  height: number;
}

export interface CharacterImageExecutor {
  generate(task: ImageGenerationTask, context?: CharacterImageExecutionContext): Promise<CharacterImageExecutionOutput[]>;
}

export interface CharacterImageExecutionContext {
  signal?: AbortSignal;
  onStage?: (stage: string) => void;
  onRemoteTask?: (remoteTaskId: string) => void | Promise<void>;
}

export const CHARACTER_VISUAL_EXECUTION_TARGETS: Record<
  CharacterVisualPurpose,
  { aspectRatio: '1:1' | '3:4' | '2:3' | '9:16'; width: number; height: number }
> = {
  'avatar-close-up': { aspectRatio: '1:1', width: 1024, height: 1024 },
  'half-body-medium': { aspectRatio: '3:4', width: 768, height: 1024 },
  'knee-up-medium-full': { aspectRatio: '2:3', width: 768, height: 1152 },
  'full-body': { aspectRatio: '9:16', width: 576, height: 1024 }
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function assertViewSet(views: CharacterViewPrompt[], purposes: CharacterVisualPurpose[]): void {
  const requested = new Set(purposes);
  const received = new Set(views.map((view) => view.purpose));
  if (received.size !== views.length) throw new Error('提示词转换结果包含重复人物图用途。');
  if (purposes.some((purpose) => !received.has(purpose))) throw new Error('提示词转换结果缺少已选择的人物图用途。');
  if (views.some((view) => !requested.has(view.purpose))) throw new Error('提示词转换结果包含未选择的人物图用途。');
}

export async function createManualCharacterBatchDraft(input: {
  repository: Pick<VisualRepository, 'saveCharacterBatchWithTasks'>;
  anchor: CharacterVisualAnchor;
  views: CharacterViewPrompt[];
  purposes: CharacterVisualPurpose[];
  additionalRequirementText: string;
  additionalRequirementMode: 'one-time' | 'persistent' | 'none';
  referenceImages?: ReferenceImageSnapshot[];
  referenceImageTransport?:
    | ReferenceImageTransportSnapshot
    | Partial<Record<CharacterVisualPurpose, ReferenceImageTransportSnapshot>>;
  execution: CharacterDraftExecutionConfig | Record<CharacterVisualPurpose, CharacterDraftExecutionConfig>;
  compositions?: Partial<Record<CharacterVisualPurpose, CharacterComposition>>;
  modifiers?: ImagePromptModifierSet;
  styleModifiers?: ImagePromptModifier[];
  pngStyleSettings?: PngStyleLibrarySettings;
  renderPrompt?: (input: {
    semanticPrompt: SemanticImagePrompt;
    execution: CharacterDraftExecutionConfig;
    purpose: CharacterVisualPurpose;
  }) => Promise<FormattedProviderPrompt>;
  taskSource?: ImageGenerationTask['source'];
  submissionMode?: ImageGenerationTask['submissionMode'];
  batchSource?: CharacterImageGenerationBatch['source'];
  generationPurpose?: CharacterImageIntent['generationPurpose'];
  generationTargetKey?: string;
  now?: string;
  createId?: () => string;
}): Promise<ManualCharacterBatchDraft> {
  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const purposes = CHARACTER_VISUAL_PURPOSES.filter((purpose) => input.purposes.includes(purpose));
  if (!purposes.length || purposes.length !== new Set(input.purposes).size) {
    throw new Error('至少选择一种且不得重复的人物图用途。');
  }
  assertViewSet(input.views, purposes);
  const anchorHash = await sha256(input.anchor.anchorText);
  const batchId = `character-batch:${createId()}`;
  const tasks = await Promise.all(purposes.map(async (purpose) => {
    const intentId = `character-intent:${createId()}`;
    const taskId = `character-task:${createId()}`;
    const composition = input.compositions?.[purpose] ?? DEFAULT_CHARACTER_COMPOSITION;
    const execution = 'avatar-close-up' in input.execution ? input.execution[purpose] : input.execution;
    const semanticPrompt = compileCharacterPrompt(
      input.views.find((view) => view.purpose === purpose)!,
      input.modifiers ?? EMPTY_IMAGE_PROMPT_MODIFIERS,
      input.styleModifiers,
      composition,
      input.additionalRequirementMode,
      input.pngStyleSettings
        ? resolvePngStyleSemanticSegments(
            input.pngStyleSettings,
            'character',
            execution.promptDialectFamily
          )
        : []
    );
    const referenceImages = structuredClone(input.referenceImages ?? []);
    const selectedTransport = input.referenceImageTransport && 'kind' in input.referenceImageTransport
      ? input.referenceImageTransport
      : input.referenceImageTransport?.[purpose];
    const referenceImageTransport = referenceImages.length
      ? selectedTransport
      : { kind: 'none' as const };
    if (referenceImages.length && !referenceImageTransport) {
      throw new Error(`人物图 ${purpose} 已选择参考图，但没有冻结参考图传输协议。`);
    }
    const formattedPrompt = input.renderPrompt
      ? await input.renderPrompt({ semanticPrompt, execution, purpose })
      : {
          dialectPresetId: execution.promptDialectPresetId,
          semanticSegments: structuredClone(semanticPrompt.segments),
          formattedSegments: semanticPrompt.segments.map((segment) => ({
            segmentId: segment.segmentId,
            positive: segment.positive,
            negative: segment.negative
          })),
          positive: semanticPrompt.positive,
          negative: semanticPrompt.negative
        };
    if (formattedPrompt.dialectPresetId !== execution.promptDialectPresetId) {
      throw new Error('格式化提示词与生成预设选择的模型提示词格式不一致。');
    }
    const transport = resolveActualTransportPrompts(
      formattedPrompt,
      execution.negativePromptMode,
      formattedPrompt.dialectFamily ?? execution.promptDialectFamily
    );
    const intent: CharacterImageIntent = {
      type: 'character-image' as const,
      intentId,
      saveId: input.anchor.saveId,
      actorId: input.anchor.actorId,
      purpose,
      anchorSnapshot: input.anchor.anchorText,
      additionalRequirementText: input.additionalRequirementText.trim(),
      additionalRequirementMode: input.additionalRequirementMode,
      appearanceSource: input.views.find((view) => view.purpose === purpose)!.appearanceSource ?? 'legacy-inline',
      anchorSourceImageIds: [...input.anchor.sourceImageIds],
      referenceImageIds: referenceImages.map((reference) => reference.imageId),
      ...(input.generationPurpose ? { generationPurpose: input.generationPurpose } : {}),
      ...(input.generationTargetKey?.trim()
        ? { generationTargetKey: input.generationTargetKey.trim() }
        : {}),
      createdAt: now
    };
    const compiling = createImageGenerationTask({
      taskId,
      saveId: input.anchor.saveId,
      source: input.taskSource ?? 'manual',
      submissionMode: input.submissionMode ?? 'manual',
      intent,
      createdAt: now
    });
    return prepareTaskDraft(compiling, {
      ...execution,
      intentId,
      characterComposition: structuredClone(composition),
      positivePrompt: formattedPrompt.positive,
      negativePrompt: formattedPrompt.negative,
      semanticPromptSegments: structuredClone(formattedPrompt.semanticSegments),
      formattedPromptSegments: structuredClone(formattedPrompt.formattedSegments),
      promptDialectFamily: formattedPrompt.dialectFamily ?? execution.promptDialectFamily,
      transportPrompt: transport.prompt,
      transportNegativePrompt: transport.negativePrompt,
      transportNegativeResolution: transport.resolution,
      transportCompatibility: 'compatible',
      referenceImages,
      referenceImageTransport: referenceImageTransport ?? { kind: 'none' },
      sourceAnchorHashes: [anchorHash],
      compiledAt: now
    }, now);
  }));
  const batch: CharacterImageGenerationBatch = {
    batchId,
    saveId: input.anchor.saveId,
    actorId: input.anchor.actorId,
    anchorSnapshot: input.anchor.anchorText,
    anchorHash,
    additionalRequirementText: input.additionalRequirementText.trim(),
    additionalRequirementMode: input.additionalRequirementMode,
    selectedPurposes: purposes,
    source: input.batchSource ?? 'manual-generate',
    status: 'awaiting-confirmation',
    taskIds: tasks.map((task) => task.taskId),
    createdAt: now,
    updatedAt: now
  };
  await input.repository.saveCharacterBatchWithTasks(batch, tasks);
  return { batch, tasks };
}

export async function confirmManualCharacterBatch(input: {
  repository: Pick<VisualRepository, 'saveCharacterBatchWithTasks'>;
  draft: ManualCharacterBatchDraft;
  edits: CharacterPromptEdit[];
  now?: string;
}): Promise<ManualCharacterBatchDraft> {
  const now = input.now ?? new Date().toISOString();
  const edits = new Map(input.edits.map((edit) => [edit.purpose, edit]));
  const tasks: ImageGenerationTask[] = [];
  for (const task of input.draft.tasks) {
    if (task.intent.type !== 'character-image' || !task.draft) throw new Error('人物图任务缺少可确认草稿。');
    const edit = edits.get(task.intent.purpose);
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
    tasks.push(submitTask(visibleDraft, submitted, now));
  }
  const batch: CharacterImageGenerationBatch = {
    ...input.draft.batch,
    status: 'running',
    updatedAt: now
  };
  await input.repository.saveCharacterBatchWithTasks(batch, tasks);
  return { batch, tasks };
}

export async function createFailedCharacterBatchRetryDraft(input: {
  repository: Pick<VisualRepository, 'saveCharacterBatchWithTasks'>;
  previousBatch: CharacterImageGenerationBatch;
  tasksById: Record<string, ImageGenerationTask>;
  now?: string;
  createId?: () => string;
}): Promise<ManualCharacterBatchDraft> {
  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const created = createFailedPurposeRetryBatch({
    previousBatch: input.previousBatch,
    tasksById: input.tasksById,
    batchId: `character-batch:${createId()}`,
    taskIdForPurpose: () => `character-task:${createId()}`,
    intentIdForPurpose: () => `character-intent:${createId()}`,
    createdAt: now
  });
  const tasks = created.tasks.map((task) => {
    const source = task.sourceTaskId ? input.tasksById[task.sourceTaskId] : undefined;
    if (!source?.submittedRequest) throw new Error('失败任务缺少可复用的已确认请求快照。');
    const {
      requestFingerprint: _requestFingerprint,
      submittedAt: _submittedAt,
      userEdited: _userEdited,
      ...sourceDraft
    } = source.submittedRequest;
    return prepareTaskDraft(task, {
      ...sourceDraft,
      intentId: task.intent.intentId,
      compiledAt: now
    }, now);
  });
  const batch: CharacterImageGenerationBatch = {
    ...created.batch,
    status: 'awaiting-confirmation',
    updatedAt: now
  };
  await input.repository.saveCharacterBatchWithTasks(batch, tasks);
  return { batch, tasks };
}

export async function createCharacterPromptReuseDraft(input: {
  sourceTask: ImageGenerationTask;
  execution: CharacterDraftExecutionConfig;
  now?: string;
  createId?: () => string;
}): Promise<ManualCharacterBatchDraft> {
  if (input.sourceTask.intent.type !== 'character-image' || !input.sourceTask.submittedRequest) {
    throw new Error('只有保留了人物意图与已提交请求快照的图片才能沿用提示词。');
  }
  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? (() => crypto.randomUUID());
  const intentId = `character-intent:${createId()}`;
  const taskId = `character-task:${createId()}`;
  const batchId = `character-batch:${createId()}`;
  const intent = {
    ...structuredClone(input.sourceTask.intent),
    intentId,
    anchorSourceImageIds: [...(input.sourceTask.intent.anchorSourceImageIds ?? [])],
    referenceImageIds: [],
    createdAt: now
  };
  const compiling = createImageGenerationTask({
    taskId,
    saveId: input.sourceTask.saveId,
    source: 'reuse-prompt',
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
    referenceImages: [],
    referenceImageTransport: { kind: 'none' },
    sourceAnchorHashes: [...input.sourceTask.submittedRequest.sourceAnchorHashes],
    compiledAt: now
  }, now);
  const batch: CharacterImageGenerationBatch = {
    batchId,
    saveId: input.sourceTask.saveId,
    actorId: intent.actorId,
    anchorSnapshot: intent.anchorSnapshot,
    anchorHash: input.sourceTask.submittedRequest.sourceAnchorHashes[0] ?? await sha256(intent.anchorSnapshot),
    additionalRequirementText: intent.additionalRequirementText,
    additionalRequirementMode: intent.additionalRequirementMode,
    selectedPurposes: [intent.purpose],
    source: 'manual-reuse-prompt',
    status: 'awaiting-confirmation',
    taskIds: [taskId],
    createdAt: now,
    updatedAt: now
  };
  return { batch, tasks: [task] };
}

export async function executeConfirmedCharacterBatch(input: {
  repository: VisualRepository;
  confirmed: ManualCharacterBatchDraft;
  executor: CharacterImageExecutor;
  signal?: AbortSignal;
  onTaskStage?: (taskId: string, stage: string) => void;
  now?: () => string;
  createId?: () => string;
}): Promise<CharacterImageGenerationBatch> {
  const now = input.now ?? (() => new Date().toISOString());
  const createId = input.createId ?? (() => crypto.randomUUID());
  for (const queued of input.confirmed.tasks) {
    if (input.signal?.aborted) {
      await input.repository.saveTask(cancelTask(queued, {
        reason: 'user',
        remoteCancellation: 'not-needed',
        cancelledAt: now()
      }));
      continue;
    }
    let task = startTaskAttempt(queued, now());
    await input.repository.saveTask(task);
    try {
      const outputs = await input.executor.generate(task, {
        signal: input.signal,
        onStage: (stage) => input.onTaskStage?.(task.taskId, stage),
        onRemoteTask: async (remoteTaskId) => {
          task = markTaskRemotePending(task, {
            providerType: task.submittedRequest!.providerType,
            remoteTaskId,
            submittedAt: now()
          }, now());
          await input.repository.saveTask(task);
        }
      });
      if (!outputs.length) throw new Error('图片执行器没有返回图片。');
      const images: VisualImageInput[] = outputs.map((output) => {
        const id = createId();
        return {
          imageId: `character-image:${id}`,
          blobKey: `character-blob:${id}`,
          blob: output.blob,
          width: output.width,
          height: output.height
        };
      });
      if (input.signal?.aborted) {
        task = cancelTask(task, {
          reason: 'user',
          remoteCancellation: task.remoteHandle ? 'requested-unconfirmed' : 'unsupported',
          cancelledAt: now()
        });
        await input.repository.saveTask(task);
        await input.repository.persistLateTaskImages(task.saveId, task.taskId, images, now());
        continue;
      }
      task = markTaskDownloading(task, now());
      await input.repository.saveTask(task);
      task = markTaskPersisting(task, now());
      await input.repository.saveTask(task);
      await input.repository.completeTaskWithImages(task.saveId, task.taskId, images, now());
    } catch (error) {
      const cancelled = input.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
      if (cancelled) {
        if (task.status !== 'cancelled') {
          await input.repository.saveTask(cancelTask(task, {
            reason: 'user',
            remoteCancellation: task.remoteHandle ? 'requested-unconfirmed' : 'unsupported',
            cancelledAt: now()
          }));
        }
      } else {
        await input.repository.saveTask(failTask(task, {
          code: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
            ? error.code : 'generation-failed',
          message: error instanceof Error ? error.message : '图片生成失败。',
          retriable: error && typeof error === 'object' && 'retriable' in error && typeof error.retriable === 'boolean'
            ? error.retriable : true
        }, now()));
      }
    }
  }
  const snapshot = await input.repository.loadSnapshot(input.confirmed.batch.saveId);
  const batch = refreshCharacterBatchStatus(input.confirmed.batch, snapshot.tasks, now());
  await input.repository.saveCharacterBatch(batch);
  return batch;
}

function selectedModel(profile: Exclude<ImageApiProfile, { providerType: 'comfyui-workflow' }>): string {
  const selected = profile.defaultModelId && profile.models.some((model) => model.modelId === profile.defaultModelId)
    ? profile.defaultModelId
    : profile.models[0]?.modelId;
  if (!selected) throw new Error('当前图片档案还没有可用模型。');
  return selected;
}

interface CharacterDraftExecutionConfigInput {
  profile: ImageApiProfile;
  purpose: CharacterVisualPurpose;
  credential?: Pick<ImageApiCredentialSummary, 'credentialId' | 'revision'>;
  workflow?: ComfyWorkflowTemplate;
  preset?: ImageGenerationPreset;
}

async function createBuiltInCharacterDraftExecutionConfigBase(
  input: Omit<CharacterDraftExecutionConfigInput, 'preset'>
): Promise<CharacterDraftExecutionConfig> {
  const { profile } = input;
  if (!profile.enabled) throw new Error('当前图片档案尚未启用。');
  const connectionFingerprint = await createConnectionFingerprint(profile, input.credential);
  const presetRevision = 1;
  const target = CHARACTER_VISUAL_EXECUTION_TARGETS[input.purpose];
  const presetId = `builtin-character-${input.purpose}:${profile.providerType}`;
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
        connectionFingerprint,
        presetId,
        presetRevision,
        workflowHash: workflow.workflowHash,
        executionParameters: { ...target, promptDialectPresetId }
      }),
      executionTarget: {
        kind: 'comfy-workflow',
        workflowTemplateId: workflow.workflowTemplateId,
        workflowRevision: workflow.revision
      },
      negativePromptMode: workflow.bindings.negativePrompt ? 'separate' : 'workflow-controlled',
      generationParameters: {
        providerType: 'comfyui-workflow',
        workflowTemplateId: workflow.workflowTemplateId,
        overrides: { width: target.width, height: target.height, seed: { mode: 'provider-random' } }
      }
    };
  }

  const modelId = selectedModel(profile);
  const executionFingerprint = await createExecutionFingerprint({
    connectionFingerprint,
    modelId,
    presetId,
    presetRevision,
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
          size: input.purpose === 'avatar-close-up'
            ? { mode: 'dimensions', width: 1024, height: 1024 }
            : { mode: 'dimensions', width: 1024, height: 1536 },
          quality: 'medium',
          outputFormat: 'png', background: 'opaque'
        }
      };
    case 'xai-images':
      return {
        ...common, executionFingerprint, executionTarget, negativePromptMode: 'merged-into-positive',
        generationParameters: { providerType: 'xai-images', requestedImageCount: 1, aspectRatio: target.aspectRatio, resolution: '1k' }
      };
    case 'gemini-image':
      return {
        ...common, executionFingerprint, executionTarget, negativePromptMode: 'merged-into-positive',
        generationParameters: { providerType: 'gemini-image', requestedImageCount: 1, aspectRatio: target.aspectRatio, imageSize: '1K', mimeType: 'image/png' }
      };
    case 'alibaba-model-studio':
      return {
        ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: {
          providerType: 'alibaba-model-studio', requestedImageCount: 1,
          size: { mode: 'dimensions', width: target.width, height: target.height }, seed: { mode: 'provider-random' },
          watermark: 'provider-default', promptEnhancement: 'provider-default', thinkingMode: 'provider-default'
        }
      };
    case 'novelai-image':
      return {
        ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: {
          providerType: 'novelai-image', requestedImageCount: 1, width: target.width, height: target.height,
          seed: { mode: 'provider-random' }
        }
      };
    case 'sd-webui':
      return {
        ...common, executionFingerprint, executionTarget, negativePromptMode: 'separate',
        generationParameters: {
          providerType: 'sd-webui', requestedImageCount: 1, width: target.width, height: target.height,
          seed: { mode: 'provider-random' }, checkpoint: modelId
        }
      };
  }
}

export async function createBuiltInCharacterDraftExecutionConfig(
  input: CharacterDraftExecutionConfigInput
): Promise<CharacterDraftExecutionConfig> {
  const base = await createBuiltInCharacterDraftExecutionConfigBase(input);
  return input.preset
    ? applyImageGenerationPreset({
      base,
      profile: input.profile,
      variantKey: input.purpose,
      preset: input.preset,
      workflow: input.workflow
    })
    : base;
}
