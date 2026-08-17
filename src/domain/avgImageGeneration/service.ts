import {
  createBuiltInCharacterDraftExecutionConfig,
  createManualCharacterBatchDraft,
  confirmManualCharacterBatch,
  executeConfirmedCharacterBatch,
  type CharacterImageExecutor
} from '../imageGeneration/characterVisualWorkflow';
import {
  createBuiltInSceneDraftExecutionConfig,
  createManualScenePlanDraft,
  confirmManualScenePlan,
  executeConfirmedScenePlan
} from '../imageGeneration/sceneVisualWorkflow';
import type { ImageGenerationPresetRepository } from '../imageGeneration/generationPresets';
import type { PngStyleRepository } from '../imageGeneration/pngStyle';
import {
  compileFormattedProviderPrompt,
  createStoryVisualBlocks,
  resolveSelectedImageStyleModifiers,
  type ImagePromptTemplateRepository,
  type SemanticImagePrompt
} from '../imageGeneration/promptConversion';
import {
  listManualImageRoutingOptions,
  resolveManualImageRouting,
  type ImageCredentialRepository,
  type ImageProfileRepository
} from '../imageGeneration/profile';
import type { VisualRepository, VisualAsset } from '../imageGeneration/visualRepository';
import { buildAvgPortraitPromptParts, buildAvgScenePromptParts } from './promptContext';
import type {
  AvgImageGenerationCandidate,
  AvgImageGenerationRequestOptions,
  AvgImageGenerationRoutingOptions,
  AvgPortraitGenerationContext,
  AvgSceneGenerationContext
} from './types';

export interface AvgImageGenerationServiceDependencies {
  visualRepository: VisualRepository;
  profileRepository: ImageProfileRepository;
  credentialRepository: ImageCredentialRepository;
  promptTemplateRepository: ImagePromptTemplateRepository;
  generationPresetRepository: ImageGenerationPresetRepository;
  pngStyleRepository: PngStyleRepository;
  executor: CharacterImageExecutor;
  onRepositoryChanged?: () => void;
}

function shortKey(value: string): string {
  return value.trim().slice(0, 140) || 'unknown';
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function renderLocally(semanticPrompt: SemanticImagePrompt, dialect: Parameters<typeof compileFormattedProviderPrompt>[1]) {
  return compileFormattedProviderPrompt(semanticPrompt, dialect, {
    segments: semanticPrompt.segments
      .filter((segment) => segment.renderPolicy !== 'preserve-literal')
      .map((segment) => ({
        segmentId: segment.segmentId,
        positive: segment.positive,
        negative: segment.negative
      }))
  });
}

function modelOrWorkflowLabel(
  profile: Awaited<ReturnType<typeof resolveManualImageRouting>>['profile'],
  workflow: Awaited<ReturnType<typeof resolveManualImageRouting>>['workflow']
): string {
  if (workflow) return workflow.name;
  if ('defaultModelId' in profile && profile.defaultModelId) {
    return profile.models.find((item) => item.modelId === profile.defaultModelId)?.displayName
      ?? profile.defaultModelId;
  }
  return profile.name;
}

function requestsTrueAlpha(asset: VisualAsset): boolean {
  const request = asset.submittedRequest;
  return request?.generationParameters.providerType === 'openai-images'
    && request.generationParameters.background === 'transparent';
}

export class AvgImageGenerationService {
  constructor(private readonly dependencies: AvgImageGenerationServiceDependencies) {}

  listRoutingOptions(): Promise<AvgImageGenerationRoutingOptions> {
    return listManualImageRoutingOptions(this.dependencies.profileRepository);
  }

  private async candidateFromTask(input: {
    saveId: string;
    taskId: string;
    purpose: AvgImageGenerationCandidate['purpose'];
    targetKey: string;
    profileName: string;
    providerType: AvgImageGenerationCandidate['providerType'];
    modelOrWorkflowLabel: string;
  }): Promise<AvgImageGenerationCandidate> {
    const snapshot = await this.dependencies.visualRepository.loadSnapshot(input.saveId);
    const task = snapshot.tasks[input.taskId];
    if (!task || task.status !== 'succeeded' || !task.submittedRequest) {
      const message = task?.error?.message ?? '图片生成没有产生可用候选图。';
      throw new Error(message);
    }
    const asset = Object.values(snapshot.assets)
      .filter((candidate) => candidate.sourceTaskId === task.taskId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (!asset) throw new Error('生图任务完成，但候选图片记录缺失。');
    const blob = await this.dependencies.visualRepository.getBlob(asset.blobKey);
    if (!blob) throw new Error('生图任务完成，但候选图片文件缺失。');
    return {
      purpose: input.purpose,
      targetKey: input.targetKey,
      taskId: task.taskId,
      asset,
      blob,
      profileId: task.submittedRequest.imageProfileId,
      profileName: input.profileName,
      providerType: input.providerType,
      modelOrWorkflowLabel: input.modelOrWorkflowLabel,
      positivePrompt: task.submittedRequest.positivePrompt,
      negativePrompt: task.submittedRequest.negativePrompt,
      targetAspectRatio: task.submittedRequest.targetAspectRatio,
      transparencyMode: requestsTrueAlpha(asset) ? 'requested' : 'prompt-only'
    };
  }

  async findLatestCandidate(
    saveId: string,
    purpose: AvgImageGenerationCandidate['purpose'],
    targetKey: string
  ): Promise<AvgImageGenerationCandidate | undefined> {
    const snapshot = await this.dependencies.visualRepository.loadSnapshot(saveId);
    const task = Object.values(snapshot.tasks)
      .filter((candidate) =>
        candidate.status === 'succeeded'
        && candidate.intent.generationPurpose === purpose
        && candidate.intent.generationTargetKey === targetKey
        && candidate.submittedRequest
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
    if (!task?.submittedRequest) return undefined;
    const profile = await this.dependencies.profileRepository.getProfile(task.submittedRequest.imageProfileId);
    if (!profile) return undefined;
    const workflow = task.submittedRequest.executionTarget.kind === 'comfy-workflow'
      ? await this.dependencies.profileRepository.getWorkflowTemplate(task.submittedRequest.executionTarget.workflowTemplateId)
      : undefined;
    return this.candidateFromTask({
      saveId,
      taskId: task.taskId,
      purpose,
      targetKey,
      profileName: profile.name,
      providerType: profile.providerType,
      modelOrWorkflowLabel: modelOrWorkflowLabel(profile, workflow ?? undefined)
    });
  }

  async generatePortrait(
    saveId: string,
    context: AvgPortraitGenerationContext,
    options: AvgImageGenerationRequestOptions
  ): Promise<AvgImageGenerationCandidate> {
    const generationPurpose = context.generationPurpose === 'outfit'
      ? 'avg_character_outfit' as const
      : 'avg_character_portrait' as const;
    const routing = await resolveManualImageRouting({
      profileRepository: this.dependencies.profileRepository,
      credentialRepository: this.dependencies.credentialRepository,
      profileId: options.profileId,
      workflowTemplateId: options.workflowTemplateId
    });
    const [promptSettings, pngStyleSettings, preset] = await Promise.all([
      this.dependencies.promptTemplateRepository.load(),
      this.dependencies.pngStyleRepository.load(),
      this.dependencies.generationPresetRepository.get(routing.profile.profileId, 'full-body')
    ]);
    const execution = await createBuiltInCharacterDraftExecutionConfig({
      ...routing,
      purpose: 'full-body',
      preset
    });
    const dialect = promptSettings.dialectPresets.find(
      (candidate) => candidate.dialectPresetId === execution.promptDialectPresetId
    );
    if (!dialect) throw new Error('当前图片档案缺少匹配的提示词格式。');
    const prompt = buildAvgPortraitPromptParts(context, options.additionalInstruction);
    const now = new Date().toISOString();
    const draft = await createManualCharacterBatchDraft({
      repository: this.dependencies.visualRepository,
      anchor: {
        anchorId: `avg-character-anchor:${context.actorId}`,
        saveId,
        actorId: context.actorId,
        anchorText: prompt.anchorText,
        source: 'actor-profile-api',
        sourceImageIds: [],
        updatedAt: now
      },
      views: [{
        purpose: 'full-body',
        basePositive: prompt.basePositive,
        baseNegative: prompt.baseNegative,
        appearanceSource: 'anchor-default',
        resolvedAppearancePositive: prompt.appearancePositive,
        resolvedAdditionalPositive: prompt.additionalPositive,
        resolvedAdditionalNegative: prompt.additionalNegative
      }],
      purposes: ['full-body'],
      additionalRequirementText: options.additionalInstruction?.trim() ?? '',
      additionalRequirementMode: options.additionalInstruction?.trim() ? 'one-time' : 'none',
      execution,
      modifiers: promptSettings.modifiers,
      styleModifiers: resolveSelectedImageStyleModifiers(
        promptSettings.stylePresets,
        promptSettings.styleSelection,
        'character'
      ),
      pngStyleSettings,
      renderPrompt: async ({ semanticPrompt }) => renderLocally(semanticPrompt, dialect),
      generationPurpose,
      generationTargetKey: context.targetKey,
      taskSource: 'manual',
      submissionMode: 'manual',
      batchSource: 'manual-generate'
    });
    const confirmed = await confirmManualCharacterBatch({
      repository: this.dependencies.visualRepository,
      draft,
      edits: [{
        purpose: 'full-body',
        positivePrompt: draft.tasks[0]!.draft!.positivePrompt,
        negativePrompt: draft.tasks[0]!.draft!.negativePrompt
      }]
    });
    await executeConfirmedCharacterBatch({
      repository: this.dependencies.visualRepository,
      confirmed,
      executor: this.dependencies.executor,
      signal: options.signal,
      onTaskStage: (_taskId, stage) => options.onStage?.(stage)
    });
    this.dependencies.onRepositoryChanged?.();
    return this.candidateFromTask({
      saveId,
      taskId: confirmed.tasks[0]!.taskId,
      purpose: generationPurpose,
      targetKey: context.targetKey,
      profileName: routing.profile.name,
      providerType: routing.profile.providerType,
      modelOrWorkflowLabel: modelOrWorkflowLabel(routing.profile, routing.workflow)
    });
  }

  async generateScene(
    saveId: string,
    context: AvgSceneGenerationContext,
    options: AvgImageGenerationRequestOptions
  ): Promise<AvgImageGenerationCandidate> {
    const routing = await resolveManualImageRouting({
      profileRepository: this.dependencies.profileRepository,
      credentialRepository: this.dependencies.credentialRepository,
      profileId: options.profileId,
      workflowTemplateId: options.workflowTemplateId
    });
    const [promptSettings, pngStyleSettings, preset] = await Promise.all([
      this.dependencies.promptTemplateRepository.load(),
      this.dependencies.pngStyleRepository.load(),
      this.dependencies.generationPresetRepository.get(routing.profile.profileId, 'narrative-scene')
    ]);
    const execution = await createBuiltInSceneDraftExecutionConfig({ ...routing, preset });
    const dialect = promptSettings.dialectPresets.find(
      (candidate) => candidate.dialectPresetId === execution.promptDialectPresetId
    );
    if (!dialect) throw new Error('当前图片档案缺少匹配的提示词格式。');
    const prompt = buildAvgScenePromptParts(context, options.additionalInstruction);
    const blockText = prompt.stableDescription || context.locationName;
    const blockHash = await sha256Text(blockText);
    const turnId = `avg-scene:${shortKey(context.targetKey)}`;
    const blocks = await createStoryVisualBlocks(turnId, blockText);
    const stableBlock = blocks[0];
    if (!stableBlock) throw new Error('当前地点缺少可用于场景候选图的稳定描述。');
    const planningInput = {
      sourceTurnId: turnId,
      sourceStoryTextHash: blockHash,
      mode: 'manual' as const,
      requestedMaxScenes: 1,
      storyText: blockText,
      blocks,
      frozenContext: {
        timeDescription: 'reusable base time',
        locationDescription: prompt.stableDescription || context.locationName,
        presentActorIds: []
      },
      actors: [],
      ...(options.additionalInstruction?.trim()
        ? { manualInstruction: options.additionalInstruction.trim() }
        : {})
    };
    const planningOutput = {
      shots: [{
        placement: { blockIndex: stableBlock.blockIndex, blockHash: stableBlock.blockHash },
        order: 0,
        sceneSummary: `Reusable AVG background for ${context.locationName}`,
        knownActorIds: [],
        actorVisualStates: [],
        unboundCharacterDescriptions: [],
        locationDescription: prompt.stableDescription || context.locationName,
        actionDescription: 'No plot-specific action; reusable empty stage.',
        atmosphere: 'Neutral base atmosphere without fixed time or weather.',
        composition: 'Landscape 16:9 AVG background with clean sprite placement zones.'
      }]
    };
    const sceneModifiers = {
      ...promptSettings.modifiers,
      narrativeScene: prompt.modifiers.narrativeScene
    };
    const draft = await createManualScenePlanDraft({
      repository: this.dependencies.visualRepository,
      saveId,
      planningInput,
      planningOutput,
      world: { year: context.worldYear, region: context.district || context.worldpackId, visualStyle: 'AVG reusable background' },
      promptOutputs: [{
        basePositive: prompt.basePositive,
        baseNegative: prompt.baseNegative,
        participantResolutions: [],
        resolvedOneTimePositive: prompt.additionalPositive,
        resolvedOneTimeNegative: prompt.additionalNegative
      }],
      execution,
      oneTimeInstruction: options.additionalInstruction?.trim() ?? '',
      modifiers: sceneModifiers,
      styleModifiers: resolveSelectedImageStyleModifiers(
        promptSettings.stylePresets,
        promptSettings.styleSelection,
        'narrative-scene'
      ),
      pngStyleSettings,
      renderPrompt: async ({ semanticPrompt }) => renderLocally(semanticPrompt, dialect),
      generationPurpose: 'avg_scene_background',
      generationTargetKey: context.targetKey,
      taskSource: 'manual',
      submissionMode: 'manual',
      mode: 'manual'
    });
    const confirmed = await confirmManualScenePlan({
      repository: this.dependencies.visualRepository,
      draft,
      edits: [{
        shotId: draft.tasks[0]!.intent.type === 'scene-image'
          ? draft.tasks[0]!.intent.shotId
          : '',
        positivePrompt: draft.tasks[0]!.draft!.positivePrompt,
        negativePrompt: draft.tasks[0]!.draft!.negativePrompt
      }]
    });
    await executeConfirmedScenePlan({
      repository: this.dependencies.visualRepository,
      confirmed,
      executor: this.dependencies.executor,
      updateStorySceneDisplay: false,
      signal: options.signal,
      concurrency: 1,
      onTaskStage: (_taskId, stage) => options.onStage?.(stage)
    });
    this.dependencies.onRepositoryChanged?.();
    return this.candidateFromTask({
      saveId,
      taskId: confirmed.tasks[0]!.taskId,
      purpose: 'avg_scene_background',
      targetKey: context.targetKey,
      profileName: routing.profile.name,
      providerType: routing.profile.providerType,
      modelOrWorkflowLabel: modelOrWorkflowLabel(routing.profile, routing.workflow)
    });
  }
}
