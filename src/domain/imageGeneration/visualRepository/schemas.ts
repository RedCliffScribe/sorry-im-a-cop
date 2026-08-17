import { z } from 'zod';
import { IMAGE_PROVIDER_TYPES } from '../probe';
import {
  CHARACTER_CAMERA_ELEVATIONS,
  CHARACTER_VISUAL_PURPOSES,
  CHARACTER_VIEW_ANGLES,
  DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID,
  IMAGE_PROMPT_DIALECT_FAMILIES,
  SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS,
  normalizeCharacterVisualPurpose,
  type CharacterVisualPurpose
} from '../promptConversion';
import {
  IMAGE_GENERATION_TASK_STATUSES,
  VISUAL_PURPOSES,
  VISUAL_REPOSITORY_SCHEMA_VERSION,
  type CharacterImageGenerationBatch,
  type CharacterVisualAnchor,
  type ImageGenerationTask,
  type StorySceneDisplayState,
  type StoredScenePlan,
  type VisualAsset,
  type VisualBinding,
  type VisualPurpose,
  type VisualRepositorySnapshot
} from './types';

const id = z.string().trim().min(1).max(1000);
const text = (maximum: number) => z.string().max(maximum);
const nonEmptyText = (maximum: number) => z.string().trim().min(1).max(maximum);
const timestamp = nonEmptyText(100);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const mimeType = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const positiveInteger = z.number().int().positive().max(100_000);
const imageByteLength = z.number().int().positive().max(64 * 1024 * 1024);
const requestedImageCount = z.number().int().min(1).max(4);
const characterVisualPurposeSchema = z.preprocess(
  normalizeCharacterVisualPurpose,
  z.enum(CHARACTER_VISUAL_PURPOSES)
) as z.ZodType<CharacterVisualPurpose>;
const visualPurposeSchema = z.preprocess(
  normalizeCharacterVisualPurpose,
  z.enum(VISUAL_PURPOSES)
) as z.ZodType<VisualPurpose>;

const seedControlSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('provider-random') }).strict(),
  z.object({ mode: z.literal('fixed'), value: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()
]);

const dimensionsSchema = z.object({ mode: z.literal('dimensions'), width: positiveInteger, height: positiveInteger }).strict();

export const imageGenerationDefaultsSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('openai-images'),
    requestedImageCount,
    size: z.discriminatedUnion('mode', [z.object({ mode: z.literal('auto') }).strict(), dimensionsSchema]),
    quality: z.enum(['auto', 'low', 'medium', 'high']),
    outputFormat: z.enum(['png', 'jpeg', 'webp']),
    outputCompression: z.number().int().min(0).max(100).optional(),
    background: z.enum(['auto', 'opaque', 'transparent'])
  }).strict(),
  z.object({
    providerType: z.literal('xai-images'),
    requestedImageCount,
    aspectRatio: z.enum(['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '2:1', '1:2', '19.5:9', '9:19.5', '20:9', '9:20']),
    resolution: z.enum(['1k', '2k'])
  }).strict(),
  z.object({
    providerType: z.literal('gemini-image'),
    requestedImageCount: z.literal(1),
    aspectRatio: nonEmptyText(32),
    imageSize: z.enum(['0.5K', '1K', '2K', '4K']),
    mimeType: z.enum(['image/png', 'image/jpeg'])
  }).strict(),
  z.object({
    providerType: z.literal('alibaba-model-studio'),
    requestedImageCount,
    size: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('provider-default') }).strict(),
      z.object({ mode: z.literal('resolution-tier'), value: z.enum(['1K', '2K', '4K']) }).strict(),
      dimensionsSchema,
      z.object({ mode: z.literal('fixed-preset'), value: nonEmptyText(100) }).strict()
    ]),
    seed: seedControlSchema.optional(),
    watermark: z.enum(['provider-default', 'enabled', 'disabled']),
    promptEnhancement: z.enum(['provider-default', 'enabled', 'disabled']),
    thinkingMode: z.enum(['provider-default', 'enabled', 'disabled'])
  }).strict(),
  z.object({
    providerType: z.literal('novelai-image'),
    requestedImageCount,
    width: positiveInteger,
    height: positiveInteger,
    seed: seedControlSchema,
    sampler: nonEmptyText(200).optional(),
    steps: z.number().int().min(1).max(200).optional(),
    guidanceScale: z.number().min(0).max(100).optional(),
    cfgRescale: z.number().min(0).max(100).optional(),
    noiseSchedule: nonEmptyText(200).optional(),
    qualityToggle: z.boolean().optional(),
    undesiredContentPreset: z.number().int().nonnegative().max(10_000).optional(),
    smea: z.boolean().optional(),
    smeaDynamic: z.boolean().optional(),
    imageToImage: z.object({
      strength: z.number().min(0).max(1),
      noise: z.number().min(0).max(1)
    }).strict().optional()
  }).strict(),
  z.object({
    providerType: z.literal('comfyui-workflow'),
    workflowTemplateId: id,
    overrides: z.object({
      checkpoint: nonEmptyText(500).optional(),
      seed: seedControlSchema.optional(),
      width: positiveInteger.optional(),
      height: positiveInteger.optional(),
      steps: z.number().int().min(1).max(1000).optional(),
      cfg: z.number().min(0).max(1000).optional(),
      sampler: nonEmptyText(200).optional(),
      scheduler: nonEmptyText(200).optional(),
      custom: z.record(
        z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/),
        z.union([z.string().max(2000), z.number().finite(), z.boolean()])
      ).refine((value) => Object.keys(value).length <= 64, 'ComfyUI 自定义覆盖项最多 64 个').optional()
    }).strict()
  }).strict(),
  z.object({
    providerType: z.literal('sd-webui'),
    requestedImageCount,
    width: positiveInteger,
    height: positiveInteger,
    seed: seedControlSchema,
    checkpoint: nonEmptyText(500).optional(),
    samplerName: nonEmptyText(200).optional(),
    scheduler: nonEmptyText(200).optional(),
    steps: z.number().int().min(1).max(1000).optional(),
    cfgScale: z.number().min(0).max(1000).optional(),
    clipSkip: z.number().int().min(1).max(100).optional(),
    restoreFaces: z.boolean().optional(),
    tiling: z.boolean().optional(),
    hiresFix: z.object({
      enabled: z.boolean(),
      scale: z.number().min(1).max(16).optional(),
      upscaler: nonEmptyText(200).optional(),
      secondPassSteps: z.number().int().min(1).max(1000).optional(),
      denoisingStrength: z.number().min(0).max(1).optional()
    }).strict().optional(),
    imageToImage: z.object({
      denoisingStrength: z.number().min(0).max(1)
    }).strict().optional()
  }).strict()
]);

export const visualSubjectRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('actor'), saveId: id, actorId: id }).strict(),
  z.object({
    type: z.literal('story-turn'),
    saveId: id,
    turnId: id,
    entrySpeaker: z.literal('narrator')
  }).strict(),
  z.object({
    type: z.literal('scene-shot'),
    saveId: id,
    turnId: id,
    scenePlanId: id,
    shotId: id
  }).strict()
]);

export const characterVisualAnchorSchema: z.ZodType<CharacterVisualAnchor> = z.object({
  anchorId: id,
  saveId: id,
  actorId: id,
  anchorText: nonEmptyText(8000),
  persistentAdditionalRequirementText: text(4000).optional(),
  source: z.enum(['actor-profile-api', 'image-extraction-api', 'user-edited']),
  sourceImageIds: z.array(id).max(32),
  updatedAt: timestamp
}).strict();

const storedSceneShotPlanSchema = z.object({
  shotId: id,
  placement: z.object({ blockIndex: z.number().int().nonnegative(), blockHash: sha256 }).strict(),
  order: z.number().int().nonnegative(),
  sceneSummary: nonEmptyText(2000),
  knownActorIds: z.array(id).max(30),
  actorVisualStates: z.array(z.object({
    actorId: id,
    sceneSpecificAppearance: text(4000).optional()
  }).strict()).max(30),
  unboundCharacterDescriptions: z.array(nonEmptyText(1000)).max(30),
  locationDescription: nonEmptyText(3000),
  actionDescription: nonEmptyText(3000),
  atmosphere: nonEmptyText(2000),
  composition: nonEmptyText(2000)
}).strict();

export const storedScenePlanSchema: z.ZodType<StoredScenePlan> = z.object({
  planId: id,
  saveId: id,
  sourceTurnId: id,
  sourceStoryTextHash: sha256,
  mode: z.enum(['automatic', 'manual']),
  displayOperation: z.enum(['append', 'replace-group', 'replace-shot']).optional(),
  replacementTargetShotId: id.optional(),
  requestedMaxScenes: z.number().int().min(1).max(4),
  shots: z.array(storedSceneShotPlanSchema).max(4),
  createdAt: timestamp
}).strict().superRefine((value, context) => {
  if (value.shots.length > value.requestedMaxScenes) {
    context.addIssue({ code: 'custom', path: ['shots'], message: '镜头数量超过计划上限' });
  }
  if (value.displayOperation === 'replace-shot' && !value.replacementTargetShotId) {
    context.addIssue({ code: 'custom', path: ['replacementTargetShotId'], message: '单图重生必须冻结被替换的 shotId' });
  }
  if (value.displayOperation !== 'replace-shot' && value.replacementTargetShotId) {
    context.addIssue({ code: 'custom', path: ['replacementTargetShotId'], message: '只有单图重生可以指定被替换的 shotId' });
  }
  const shotIds = new Set<string>();
  value.shots.forEach((shot, index) => {
    if (shotIds.has(shot.shotId)) {
      context.addIssue({ code: 'custom', path: ['shots', index, 'shotId'], message: 'shotId 重复' });
    }
    shotIds.add(shot.shotId);
    if (shot.order !== index) {
      context.addIssue({ code: 'custom', path: ['shots', index, 'order'], message: 'order 必须从 0 连续排列' });
    }
  });
});

const currentCharacterIntentSchema = z.object({
  type: z.literal('character-image'),
  intentId: id,
  saveId: id,
  actorId: id,
  purpose: characterVisualPurposeSchema,
  anchorSnapshot: nonEmptyText(8000),
  additionalRequirementText: text(4000),
  additionalRequirementMode: z.enum(['one-time', 'persistent', 'none']),
  appearanceSource: z.enum([
    'anchor-default',
    'additional-requirement-override',
    'legacy-inline'
  ]).optional(),
  anchorSourceImageIds: z.array(id).max(32).optional(),
  referenceImageIds: z.array(id).max(32),
  generationPurpose: z.enum(['avg_character_portrait', 'avg_character_outfit']).optional(),
  generationTargetKey: nonEmptyText(1000).optional(),
  createdAt: timestamp
}).strict();

const sceneIntentSchema = z.object({
  type: z.literal('scene-image'),
  intentId: id,
  saveId: id,
  turnId: id,
  scenePlanId: id,
  shotId: id,
  participantAnchorSnapshots: z.array(z.object({
    actorId: id,
    anchorText: nonEmptyText(8000),
    persistentAdditionalRequirementText: text(4000).optional(),
    sceneSpecificAppearance: text(4000).optional()
  }).strict()).max(30),
  oneTimeInstruction: text(4000),
  referenceImageIds: z.array(id).max(32),
  generationPurpose: z.literal('avg_scene_background').optional(),
  generationTargetKey: nonEmptyText(1000).optional(),
  createdAt: timestamp
}).strict();

const currentVisualGenerationIntentSchema = z.discriminatedUnion('type', [
  currentCharacterIntentSchema,
  sceneIntentSchema
]);

export const visualGenerationIntentSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const intent = value as Record<string, unknown>;
  if (intent.type !== 'character-image' || intent.anchorSourceImageIds !== undefined) return value;
  return {
    ...intent,
    appearanceSource: intent.appearanceSource ?? 'legacy-inline',
    anchorSourceImageIds: Array.isArray(intent.referenceImageIds) ? [...intent.referenceImageIds] : [],
    referenceImageIds: []
  };
}, currentVisualGenerationIntentSchema);

export const compiledImageRequestDraftSchema = z.object({
  intentId: id,
  imageProfileId: id,
  providerType: z.enum(IMAGE_PROVIDER_TYPES),
  connectionFingerprint: id,
  executionFingerprint: id,
  imageGenerationPresetId: id,
  imageGenerationPresetRevision: z.number().int().nonnegative(),
  promptDialectPresetId: id.optional().default(DEFAULT_IMAGE_PROMPT_DIALECT_PRESET_ID),
  promptDialectFamily: z.enum(IMAGE_PROMPT_DIALECT_FAMILIES).optional(),
  executionTarget: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('model'), modelId: id }).strict(),
    z.object({
      kind: z.literal('comfy-workflow'),
      workflowTemplateId: id,
      workflowRevision: z.number().int().nonnegative(),
      checkpointName: nonEmptyText(500).optional()
    }).strict()
  ]),
  characterComposition: z.object({
    viewAngle: z.enum(CHARACTER_VIEW_ANGLES),
    cameraElevation: z.enum(CHARACTER_CAMERA_ELEVATIONS)
  }).strict().optional(),
  positivePrompt: nonEmptyText(100_000),
  negativePrompt: text(100_000),
  semanticPromptSegments: z.array(z.object({
    segmentId: id,
    kind: z.enum(SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS),
    priority: z.number().int().min(0).max(100),
    positive: text(20_000),
    negative: text(20_000),
    required: z.boolean(),
    renderPolicy: z.enum(['transform', 'preserve-literal']).optional(),
    provenance: z.object({
      kind: z.literal('png-style'),
      presetId: id,
      imageHash: sha256,
      parserVersion: z.number().int().min(1).max(10_000)
    }).strict().optional()
  }).strict()).max(200).optional(),
  formattedPromptSegments: z.array(z.object({
    segmentId: id,
    positive: text(20_000),
    negative: text(20_000)
  }).strict()).max(200).optional(),
  transportPrompt: nonEmptyText(100_000).optional(),
  transportNegativePrompt: text(100_000).optional(),
  transportNegativeResolution: z.enum(['separate', 'merged', 'none', 'workflow-controlled']).optional(),
  transportCompatibility: z.literal('compatible').optional(),
  negativePromptMode: z.enum(['separate', 'merged-into-positive', 'unsupported', 'workflow-controlled']),
  targetAspectRatio: nonEmptyText(32),
  generationParameters: imageGenerationDefaultsSchema,
  referenceImages: z.array(z.object({
    imageId: id,
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
    width: positiveInteger,
    height: positiveInteger,
    byteLength: imageByteLength,
    contentHash: sha256
  }).strict()).max(16).optional().default([]),
  referenceImageTransport: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).strict(),
    z.object({ kind: z.literal('openai-image-edit'), maxImages: z.literal(16) }).strict(),
    z.object({ kind: z.literal('xai-image-edit'), maxImages: z.literal(1) }).strict(),
    z.object({ kind: z.literal('gemini-multimodal'), maxImages: z.literal(3) }).strict(),
    z.object({ kind: z.literal('alibaba-multimodal'), maxImages: z.literal(3) }).strict(),
    z.object({
      kind: z.literal('novelai-img2img'),
      maxImages: z.literal(1),
      strength: z.number().min(0).max(1),
      noise: z.number().min(0).max(1)
    }).strict(),
    z.object({ kind: z.literal('comfy-upload-workflow'), maxImages: z.literal(1) }).strict(),
    z.object({
      kind: z.literal('sd-webui-img2img'),
      maxImages: z.literal(1),
      denoisingStrength: z.number().min(0).max(1)
    }).strict()
  ]).optional().default({ kind: 'none' }),
  sourceAnchorHashes: z.array(sha256).max(30),
  compiledAt: timestamp
}).strict().superRefine((draft, context) => {
  if (draft.providerType !== draft.generationParameters.providerType) {
    context.addIssue({ code: 'custom', path: ['generationParameters', 'providerType'], message: '参数供应商与任务供应商不一致' });
  }
  if (draft.providerType === 'comfyui-workflow' && draft.executionTarget.kind !== 'comfy-workflow') {
    context.addIssue({ code: 'custom', path: ['executionTarget'], message: 'ComfyUI 必须使用工作流执行目标' });
  }
  if (draft.providerType !== 'comfyui-workflow' && draft.executionTarget.kind !== 'model') {
    context.addIssue({ code: 'custom', path: ['executionTarget'], message: '非 ComfyUI 供应商必须使用模型执行目标' });
  }
  if (draft.referenceImages.length === 0 && draft.referenceImageTransport.kind !== 'none') {
    context.addIssue({ code: 'custom', path: ['referenceImageTransport'], message: '没有参考图时传输类型必须为 none' });
  }
  if (draft.referenceImages.length > 0 && draft.referenceImageTransport.kind === 'none') {
    context.addIssue({ code: 'custom', path: ['referenceImageTransport'], message: '已选择参考图时必须冻结传输类型' });
  }
  if (
    draft.referenceImageTransport.kind !== 'none' &&
    draft.referenceImages.length > draft.referenceImageTransport.maxImages
  ) {
    context.addIssue({ code: 'custom', path: ['referenceImages'], message: '参考图数量超过冻结传输协议上限' });
  }
  if (Boolean(draft.semanticPromptSegments) !== Boolean(draft.formattedPromptSegments)) {
    context.addIssue({ code: 'custom', path: ['formattedPromptSegments'], message: '语义段与格式化段必须成对保存' });
  }
  if (draft.semanticPromptSegments && draft.formattedPromptSegments) {
    const semanticIds = draft.semanticPromptSegments.map((segment) => segment.segmentId);
    const formattedIds = draft.formattedPromptSegments.map((segment) => segment.segmentId);
    if (
      new Set(semanticIds).size !== semanticIds.length ||
      semanticIds.length !== formattedIds.length ||
      semanticIds.some((segmentId, index) => segmentId !== formattedIds[index])
    ) {
      context.addIssue({ code: 'custom', path: ['formattedPromptSegments'], message: '格式化段必须与语义段 ID 一一对应且顺序相同' });
    }
  }
  if (draft.transportPrompt && !draft.transportNegativeResolution) {
    context.addIssue({ code: 'custom', path: ['transportNegativeResolution'], message: '保存实际传输提示词时必须记录负向处理方式' });
  }
  if (draft.promptDialectFamily === 'novelai' && draft.negativePromptMode !== 'separate') {
    context.addIssue({
      code: 'custom',
      path: ['negativePromptMode'],
      message: 'NovelAI 渲染方案必须使用独立负向提示词通道'
    });
  }
});

export const submittedImageRequestSchema = compiledImageRequestDraftSchema.extend({
  requestFingerprint: id,
  submittedAt: timestamp,
  userEdited: z.boolean()
}).strict();

export const imageGenerationErrorSummarySchema = z.object({
  code: id,
  message: nonEmptyText(1200),
  retriable: z.boolean()
}).strict();

const imageGenerationAttemptSchema = z.object({
  attemptNumber: z.number().int().positive(),
  startedAt: timestamp,
  finishedAt: timestamp.optional(),
  outcome: z.enum(['running', 'succeeded', 'failed', 'cancelled']),
  error: imageGenerationErrorSummarySchema.optional()
}).strict();

const remoteHandleSchema = z.object({
  providerType: z.enum(IMAGE_PROVIDER_TYPES),
  remoteTaskId: id,
  submittedAt: timestamp,
  lastCheckedAt: timestamp.optional()
}).strict();

const cancellationSchema = z.object({
  reason: z.enum(['user', 'save-switched', 'turn-invalidated', 'actor-removed', 'profile-changed', 'app-shutdown']),
  remoteCancellation: z.enum(['not-needed', 'confirmed', 'requested-unconfirmed', 'unsupported']),
  cancelledAt: timestamp
}).strict();

export const imageGenerationTaskSchema: z.ZodType<ImageGenerationTask> = z.object({
  taskId: id,
  saveId: id,
  source: z.enum(['manual', 'automatic', 'retry', 'regenerate', 'reuse-prompt']),
  submissionMode: z.enum(['manual', 'automatic']),
  sourceTaskId: id.optional(),
  intent: visualGenerationIntentSchema,
  status: z.enum(IMAGE_GENERATION_TASK_STATUSES),
  draft: compiledImageRequestDraftSchema.optional(),
  submittedRequest: submittedImageRequestSchema.optional(),
  attempts: z.array(imageGenerationAttemptSchema).max(100),
  remoteHandle: remoteHandleSchema.optional(),
  resultImageIds: z.array(id).max(32),
  primaryImageId: id.optional(),
  error: imageGenerationErrorSummarySchema.optional(),
  cancellation: cancellationSchema.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
  finishedAt: timestamp.optional()
}).strict().superRefine((task, context) => {
  if (task.intent.saveId !== task.saveId) {
    context.addIssue({ code: 'custom', path: ['intent', 'saveId'], message: '意图 saveId 与任务不一致' });
  }
  if (task.draft && task.draft.intentId !== task.intent.intentId) {
    context.addIssue({ code: 'custom', path: ['draft', 'intentId'], message: '草稿 intentId 与任务不一致' });
  }
  if (task.submittedRequest && task.submittedRequest.intentId !== task.intent.intentId) {
    context.addIssue({ code: 'custom', path: ['submittedRequest', 'intentId'], message: '提交快照 intentId 与任务不一致' });
  }
  const requiresSubmission = ['queued', 'submitting', 'remote-pending', 'downloading', 'persisting', 'succeeded'].includes(task.status);
  if (requiresSubmission && !task.submittedRequest) {
    context.addIssue({ code: 'custom', path: ['submittedRequest'], message: '当前任务状态必须存在不可变提交快照' });
  }
  if (task.status === 'awaiting-confirmation' && (task.submissionMode !== 'manual' || !task.draft || task.submittedRequest)) {
    context.addIssue({ code: 'custom', path: ['status'], message: '等待确认只允许手动草稿且不得已经提交' });
  }
  if (task.status === 'succeeded' && (!task.resultImageIds.length || !task.primaryImageId || !task.resultImageIds.includes(task.primaryImageId))) {
    context.addIssue({ code: 'custom', path: ['resultImageIds'], message: '成功任务必须至少有一张结果且 primaryImageId 属于结果' });
  }
  if (task.status === 'succeeded' && !task.finishedAt) {
    context.addIssue({ code: 'custom', path: ['finishedAt'], message: '成功任务必须有结束时间' });
  }
  if (task.status === 'failed' && (!task.error || !task.finishedAt)) {
    context.addIssue({ code: 'custom', path: ['error'], message: '失败任务必须保存错误和结束时间' });
  }
  if (task.status === 'cancelled' && (!task.cancellation || !task.finishedAt)) {
    context.addIssue({ code: 'custom', path: ['cancellation'], message: '取消任务必须保存取消信息和结束时间' });
  }
  if (['failed', 'cancelled'].includes(task.status) && (task.resultImageIds.length || task.primaryImageId)) {
    context.addIssue({ code: 'custom', path: ['resultImageIds'], message: '失败或取消任务不得产生已绑定结果图片' });
  }
  if (!['succeeded', 'failed', 'cancelled'].includes(task.status) && task.finishedAt) {
    context.addIssue({ code: 'custom', path: ['finishedAt'], message: '非终态任务不得有结束时间' });
  }
  task.attempts.forEach((attempt, index) => {
    if (attempt.attemptNumber !== index + 1) {
      context.addIssue({ code: 'custom', path: ['attempts', index, 'attemptNumber'], message: 'attemptNumber 必须连续' });
    }
    if (attempt.outcome === 'running' && attempt.finishedAt) {
      context.addIssue({ code: 'custom', path: ['attempts', index], message: '运行中 attempt 不得有结束时间' });
    }
    if (attempt.outcome !== 'running' && !attempt.finishedAt) {
      context.addIssue({ code: 'custom', path: ['attempts', index], message: '终态 attempt 必须有结束时间' });
    }
  });
});

export const characterImageGenerationBatchSchema: z.ZodType<CharacterImageGenerationBatch> = z.object({
  batchId: id,
  sourceBatchId: id.optional(),
  saveId: id,
  actorId: id,
  anchorSnapshot: nonEmptyText(8000),
  anchorHash: sha256,
  additionalRequirementText: text(4000),
  additionalRequirementMode: z.enum(['one-time', 'persistent', 'none']),
  selectedPurposes: z.array(characterVisualPurposeSchema).min(1).max(4),
  source: z.enum([
    'manual-generate',
    'manual-after-anchor-save',
    'manual-retry-failed',
    'manual-reuse-prompt',
    'automatic-new-actor'
  ]),
  status: z.enum(['compiling', 'awaiting-confirmation', 'running', 'partially-succeeded', 'succeeded', 'failed', 'cancelled']),
  taskIds: z.array(id).min(1).max(4),
  createdAt: timestamp,
  updatedAt: timestamp
}).strict().superRefine((batch, context) => {
  if (new Set(batch.selectedPurposes).size !== batch.selectedPurposes.length) {
    context.addIssue({ code: 'custom', path: ['selectedPurposes'], message: '批次景别不得重复' });
  }
  if (new Set(batch.taskIds).size !== batch.taskIds.length || batch.taskIds.length !== batch.selectedPurposes.length) {
    context.addIssue({ code: 'custom', path: ['taskIds'], message: '批次任务必须与景别一一对应' });
  }
});

export const visualAssetSchema: z.ZodType<VisualAsset> = z.object({
  imageId: id,
  scope: z.enum(['save', 'global']),
  saveId: id.optional(),
  source: z.enum(['generated', 'user-imported', 'preset-pack', 'builtin']),
  originSubject: visualSubjectRefSchema.optional(),
  originPurpose: visualPurposeSchema.optional(),
  sourceTaskId: id.optional(),
  lateResultOfTaskId: id.optional(),
  mimeType,
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  contentHash: sha256,
  blobKey: id,
  createdAt: timestamp,
  submittedRequest: submittedImageRequestSchema.optional()
}).strict().superRefine((asset, context) => {
  if (asset.scope === 'save' && !asset.saveId) {
    context.addIssue({ code: 'custom', path: ['saveId'], message: '存档图片必须有 saveId' });
  }
  if (asset.scope === 'global' && asset.saveId) {
    context.addIssue({ code: 'custom', path: ['saveId'], message: '全局图片不得绑定 saveId' });
  }
  if (asset.source === 'generated' && (!asset.sourceTaskId || !asset.submittedRequest)) {
    context.addIssue({ code: 'custom', path: ['sourceTaskId'], message: '生成图片必须保存任务和提交快照' });
  }
});

export const visualBindingSchema: z.ZodType<VisualBinding> = z.object({
  bindingId: id,
  saveId: id,
  subject: visualSubjectRefSchema,
  purpose: visualPurposeSchema,
  variantKey: id.optional(),
  imageId: id,
  updatedAt: timestamp
}).strict().superRefine((binding, context) => {
  if (binding.subject.saveId !== binding.saveId) {
    context.addIssue({ code: 'custom', path: ['subject', 'saveId'], message: '绑定主体 saveId 不一致' });
  }
});

export const storySceneDisplayStateSchema: z.ZodType<StorySceneDisplayState> = z.object({
  saveId: id,
  turnId: id,
  activeShotIds: z.array(id).max(100),
  pendingReplacement: z.object({
    scenePlanId: id,
    shotIds: z.array(id).min(1).max(4),
    operation: z.enum(['replace-group', 'replace-shot']).optional(),
    targetShotIds: z.array(id).min(1).max(100).optional()
  }).strict().optional(),
  updatedAt: timestamp
}).strict().superRefine((state, context) => {
  if (new Set(state.activeShotIds).size !== state.activeShotIds.length) {
    context.addIssue({ code: 'custom', path: ['activeShotIds'], message: '当前显示 shotId 不得重复' });
  }
  if (state.pendingReplacement && new Set(state.pendingReplacement.shotIds).size !== state.pendingReplacement.shotIds.length) {
    context.addIssue({ code: 'custom', path: ['pendingReplacement', 'shotIds'], message: '待替换 shotId 不得重复' });
  }
  if (state.pendingReplacement?.targetShotIds && new Set(state.pendingReplacement.targetShotIds).size !== state.pendingReplacement.targetShotIds.length) {
    context.addIssue({ code: 'custom', path: ['pendingReplacement', 'targetShotIds'], message: '待替换目标 shotId 不得重复' });
  }
});

const recordOf = <T>(schema: z.ZodType<T>) => z.record(z.string(), schema);

export const visualRepositorySnapshotSchema: z.ZodType<VisualRepositorySnapshot> = z.object({
  schemaVersion: z.literal(VISUAL_REPOSITORY_SCHEMA_VERSION),
  saveId: id,
  characterAnchors: recordOf(characterVisualAnchorSchema),
  scenePlans: recordOf(storedScenePlanSchema),
  tasks: recordOf(imageGenerationTaskSchema),
  characterBatches: recordOf(characterImageGenerationBatchSchema),
  assets: recordOf(visualAssetSchema),
  bindings: recordOf(visualBindingSchema),
  storySceneDisplayStates: recordOf(storySceneDisplayStateSchema)
}).strict().superRefine((snapshot, context) => {
  const checkRecord = <T extends { saveId: string }>(
    name: string,
    record: Record<string, T>,
    idOf: (value: T) => string
  ) => {
    for (const [key, value] of Object.entries(record)) {
      if (key !== idOf(value)) context.addIssue({ code: 'custom', path: [name, key], message: '记录键与内部 ID 不一致' });
      if (value.saveId !== snapshot.saveId) context.addIssue({ code: 'custom', path: [name, key, 'saveId'], message: '记录属于其他存档' });
    }
  };
  checkRecord('characterAnchors', snapshot.characterAnchors, (value) => value.anchorId);
  checkRecord('scenePlans', snapshot.scenePlans, (value) => value.planId);
  checkRecord('tasks', snapshot.tasks, (value) => value.taskId);
  checkRecord('characterBatches', snapshot.characterBatches, (value) => value.batchId);
  checkRecord('bindings', snapshot.bindings, (value) => value.bindingId);
  checkRecord('storySceneDisplayStates', snapshot.storySceneDisplayStates, (value) => value.turnId);
  for (const [key, asset] of Object.entries(snapshot.assets)) {
    if (key !== asset.imageId) context.addIssue({ code: 'custom', path: ['assets', key], message: '记录键与 imageId 不一致' });
    if (asset.scope !== 'save' || asset.saveId !== snapshot.saveId) {
      context.addIssue({ code: 'custom', path: ['assets', key, 'saveId'], message: '存档分区只能包含本存档图片' });
    }
  }
  for (const [key, binding] of Object.entries(snapshot.bindings)) {
    if (!snapshot.assets[binding.imageId]) {
      context.addIssue({ code: 'custom', path: ['bindings', key, 'imageId'], message: '绑定引用不存在的图片' });
    }
  }
  for (const [key, batch] of Object.entries(snapshot.characterBatches)) {
    for (const taskId of batch.taskIds) {
      const task = snapshot.tasks[taskId];
      if (!task || task.saveId !== batch.saveId) {
        context.addIssue({ code: 'custom', path: ['characterBatches', key, 'taskIds'], message: '批次引用不存在的任务' });
      }
    }
  }
});

export function createEmptyVisualRepositorySnapshot(saveId: string): VisualRepositorySnapshot {
  return visualRepositorySnapshotSchema.parse({
    schemaVersion: VISUAL_REPOSITORY_SCHEMA_VERSION,
    saveId,
    characterAnchors: {},
    scenePlans: {},
    tasks: {},
    characterBatches: {},
    assets: {},
    bindings: {},
    storySceneDisplayStates: {}
  });
}

export function parseVisualRepositorySnapshot(value: unknown): VisualRepositorySnapshot {
  return visualRepositorySnapshotSchema.parse(value);
}
