import type { ImageProviderType } from '../probe';
import {
  CHARACTER_VISUAL_PURPOSES,
  type CharacterComposition,
  type CharacterVisualPurpose
} from '../promptConversion';

export { CHARACTER_VISUAL_PURPOSES, type CharacterVisualPurpose };

export const VISUAL_PURPOSES = [
  ...CHARACTER_VISUAL_PURPOSES,
  'turn-scene',
  'scene-preset'
] as const;

export type VisualPurpose = (typeof VISUAL_PURPOSES)[number];

/**
 * Optional semantic purpose for tasks that reuse the normal image pipeline but
 * must remain unbound candidates until the player explicitly adopts them.
 */
export const AVG_IMAGE_GENERATION_PURPOSES = [
  'avg_character_portrait',
  'avg_character_outfit',
  'avg_scene_background'
] as const;

export type AvgImageGenerationPurpose = (typeof AVG_IMAGE_GENERATION_PURPOSES)[number];

export type VisualSubjectRef =
  | { type: 'actor'; saveId: string; actorId: string }
  | { type: 'story-turn'; saveId: string; turnId: string; entrySpeaker: 'narrator' }
  | {
      type: 'scene-shot';
      saveId: string;
      turnId: string;
      scenePlanId: string;
      shotId: string;
    };

export interface CharacterVisualAnchor {
  anchorId: string;
  saveId: string;
  actorId: string;
  anchorText: string;
  persistentAdditionalRequirementText?: string;
  source: 'actor-profile-api' | 'image-extraction-api' | 'user-edited';
  sourceImageIds: string[];
  updatedAt: string;
}

export interface StoredSceneShotPlan {
  shotId: string;
  placement: { blockIndex: number; blockHash: string };
  order: number;
  sceneSummary: string;
  knownActorIds: string[];
  actorVisualStates: Array<{ actorId: string; sceneSpecificAppearance?: string }>;
  unboundCharacterDescriptions: string[];
  locationDescription: string;
  actionDescription: string;
  atmosphere: string;
  composition: string;
}

export interface StoredScenePlan {
  planId: string;
  saveId: string;
  sourceTurnId: string;
  sourceStoryTextHash: string;
  mode: 'automatic' | 'manual';
  displayOperation?: 'append' | 'replace-group' | 'replace-shot';
  replacementTargetShotId?: string;
  requestedMaxScenes: number;
  shots: StoredSceneShotPlan[];
  createdAt: string;
}

export interface CharacterImageIntent {
  type: 'character-image';
  intentId: string;
  saveId: string;
  actorId: string;
  purpose: CharacterVisualPurpose;
  anchorSnapshot: string;
  additionalRequirementText: string;
  additionalRequirementMode: 'one-time' | 'persistent' | 'none';
  appearanceSource?: 'anchor-default' | 'additional-requirement-override' | 'legacy-inline';
  anchorSourceImageIds?: string[];
  referenceImageIds: string[];
  generationPurpose?: 'avg_character_portrait' | 'avg_character_outfit';
  generationTargetKey?: string;
  createdAt: string;
}

export interface SceneImageIntent {
  type: 'scene-image';
  intentId: string;
  saveId: string;
  turnId: string;
  scenePlanId: string;
  shotId: string;
  participantAnchorSnapshots: Array<{
    actorId: string;
    anchorText: string;
    persistentAdditionalRequirementText?: string;
    sceneSpecificAppearance?: string;
  }>;
  oneTimeInstruction: string;
  referenceImageIds: string[];
  generationPurpose?: 'avg_scene_background';
  generationTargetKey?: string;
  createdAt: string;
}

export type VisualGenerationIntent = CharacterImageIntent | SceneImageIntent;

export type SeedControl = { mode: 'provider-random' } | { mode: 'fixed'; value: number };

export interface ReferenceImageSnapshot {
  imageId: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  byteLength: number;
  contentHash: string;
}

export type ReferenceImageTransportSnapshot =
  | { kind: 'none' }
  | { kind: 'openai-image-edit'; maxImages: 16 }
  | { kind: 'xai-image-edit'; maxImages: 1 }
  | { kind: 'gemini-multimodal'; maxImages: 3 }
  | { kind: 'alibaba-multimodal'; maxImages: 3 }
  | { kind: 'novelai-img2img'; maxImages: 1; strength: number; noise: number }
  | { kind: 'comfy-upload-workflow'; maxImages: 1 }
  | { kind: 'sd-webui-img2img'; maxImages: 1; denoisingStrength: number };

export type ImageGenerationDefaults =
  | {
      providerType: 'openai-images';
      requestedImageCount: number;
      size: { mode: 'auto' } | { mode: 'dimensions'; width: number; height: number };
      quality: 'auto' | 'low' | 'medium' | 'high';
      outputFormat: 'png' | 'jpeg' | 'webp';
      outputCompression?: number;
      background: 'auto' | 'opaque' | 'transparent';
    }
  | {
      providerType: 'xai-images';
      requestedImageCount: number;
      aspectRatio: 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '3:2' | '2:3' | '2:1' | '1:2' | '19.5:9' | '9:19.5' | '20:9' | '9:20';
      resolution: '1k' | '2k';
    }
  | {
      providerType: 'gemini-image';
      requestedImageCount: 1;
      aspectRatio: string;
      imageSize: '0.5K' | '1K' | '2K' | '4K';
      mimeType: 'image/png' | 'image/jpeg';
    }
  | {
      providerType: 'alibaba-model-studio';
      requestedImageCount: number;
      size:
        | { mode: 'provider-default' }
        | { mode: 'resolution-tier'; value: '1K' | '2K' | '4K' }
        | { mode: 'dimensions'; width: number; height: number }
        | { mode: 'fixed-preset'; value: string };
      seed?: SeedControl;
      watermark: 'provider-default' | 'enabled' | 'disabled';
      promptEnhancement: 'provider-default' | 'enabled' | 'disabled';
      thinkingMode: 'provider-default' | 'enabled' | 'disabled';
    }
  | {
      providerType: 'novelai-image';
      requestedImageCount: number;
      width: number;
      height: number;
      seed: SeedControl;
      sampler?: string;
      steps?: number;
      guidanceScale?: number;
      cfgRescale?: number;
      noiseSchedule?: string;
      qualityToggle?: boolean;
      undesiredContentPreset?: number;
      smea?: boolean;
      smeaDynamic?: boolean;
      imageToImage?: {
        strength: number;
        noise: number;
      };
    }
  | {
      providerType: 'comfyui-workflow';
      workflowTemplateId: string;
      overrides: {
        checkpoint?: string;
        seed?: SeedControl;
        width?: number;
        height?: number;
        steps?: number;
        cfg?: number;
        sampler?: string;
        scheduler?: string;
        custom?: Record<string, string | number | boolean>;
      };
    }
  | {
      providerType: 'sd-webui';
      requestedImageCount: number;
      width: number;
      height: number;
      seed: SeedControl;
      checkpoint?: string;
      samplerName?: string;
      scheduler?: string;
      steps?: number;
      cfgScale?: number;
      clipSkip?: number;
      restoreFaces?: boolean;
      tiling?: boolean;
      hiresFix?: {
        enabled: boolean;
        scale?: number;
        upscaler?: string;
        secondPassSteps?: number;
        denoisingStrength?: number;
      };
      imageToImage?: {
        denoisingStrength: number;
      };
    };

export interface CompiledImageRequestDraftSnapshot {
  intentId: string;
  imageProfileId: string;
  providerType: ImageProviderType;
  connectionFingerprint: string;
  executionFingerprint: string;
  imageGenerationPresetId: string;
  imageGenerationPresetRevision: number;
  promptDialectPresetId: string;
  promptDialectFamily?: import('../promptConversion').ImagePromptDialectFamily;
  executionTarget:
    | { kind: 'model'; modelId: string }
    | { kind: 'comfy-workflow'; workflowTemplateId: string; workflowRevision: number; checkpointName?: string };
  characterComposition?: CharacterComposition;
  positivePrompt: string;
  negativePrompt: string;
  semanticPromptSegments?: Array<{
    segmentId: string;
    kind: string;
    priority: number;
    positive: string;
    negative: string;
    required: boolean;
  }>;
  formattedPromptSegments?: Array<{
    segmentId: string;
    positive: string;
    negative: string;
  }>;
  transportPrompt?: string;
  transportNegativePrompt?: string;
  transportNegativeResolution?: 'separate' | 'merged' | 'none' | 'workflow-controlled';
  transportCompatibility?: 'compatible';
  negativePromptMode: 'separate' | 'merged-into-positive' | 'unsupported' | 'workflow-controlled';
  targetAspectRatio: string;
  generationParameters: ImageGenerationDefaults;
  referenceImages: ReferenceImageSnapshot[];
  referenceImageTransport: ReferenceImageTransportSnapshot;
  sourceAnchorHashes: string[];
  compiledAt: string;
}

export interface SubmittedImageRequestSnapshot extends CompiledImageRequestDraftSnapshot {
  requestFingerprint: string;
  submittedAt: string;
  userEdited: boolean;
}

export interface ImageGenerationErrorSummary {
  code: string;
  message: string;
  retriable: boolean;
}

export interface ImageGenerationAttempt {
  attemptNumber: number;
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled';
  error?: ImageGenerationErrorSummary;
}

export interface RemoteImageTaskHandle {
  providerType: ImageProviderType;
  remoteTaskId: string;
  submittedAt: string;
  lastCheckedAt?: string;
}

export interface ImageTaskCancellation {
  reason:
    | 'user'
    | 'save-switched'
    | 'turn-invalidated'
    | 'actor-removed'
    | 'profile-changed'
    | 'app-shutdown';
  remoteCancellation: 'not-needed' | 'confirmed' | 'requested-unconfirmed' | 'unsupported';
  cancelledAt: string;
}

export const IMAGE_GENERATION_TASK_STATUSES = [
  'compiling',
  'awaiting-confirmation',
  'queued',
  'submitting',
  'remote-pending',
  'downloading',
  'persisting',
  'succeeded',
  'failed',
  'cancelled'
] as const;

export type ImageGenerationTaskStatus = (typeof IMAGE_GENERATION_TASK_STATUSES)[number];

export interface ImageGenerationTask {
  taskId: string;
  saveId: string;
  source: 'manual' | 'automatic' | 'retry' | 'regenerate' | 'reuse-prompt';
  submissionMode: 'manual' | 'automatic';
  sourceTaskId?: string;
  intent: VisualGenerationIntent;
  status: ImageGenerationTaskStatus;
  draft?: CompiledImageRequestDraftSnapshot;
  submittedRequest?: SubmittedImageRequestSnapshot;
  attempts: ImageGenerationAttempt[];
  remoteHandle?: RemoteImageTaskHandle;
  resultImageIds: string[];
  primaryImageId?: string;
  error?: ImageGenerationErrorSummary;
  cancellation?: ImageTaskCancellation;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface CharacterImageGenerationBatch {
  batchId: string;
  sourceBatchId?: string;
  saveId: string;
  actorId: string;
  anchorSnapshot: string;
  anchorHash: string;
  additionalRequirementText: string;
  additionalRequirementMode: 'one-time' | 'persistent' | 'none';
  selectedPurposes: CharacterVisualPurpose[];
  source:
    | 'manual-generate'
    | 'manual-after-anchor-save'
    | 'manual-retry-failed'
    | 'manual-reuse-prompt'
    | 'automatic-new-actor';
  status:
    | 'compiling'
    | 'awaiting-confirmation'
    | 'running'
    | 'partially-succeeded'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VisualAsset {
  imageId: string;
  scope: 'save' | 'global';
  saveId?: string;
  source: 'generated' | 'user-imported' | 'preset-pack' | 'builtin';
  originSubject?: VisualSubjectRef;
  originPurpose?: VisualPurpose;
  sourceTaskId?: string;
  lateResultOfTaskId?: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width: number;
  height: number;
  byteLength: number;
  contentHash: string;
  blobKey: string;
  createdAt: string;
  submittedRequest?: SubmittedImageRequestSnapshot;
}

export interface VisualBinding {
  bindingId: string;
  saveId: string;
  subject: VisualSubjectRef;
  purpose: VisualPurpose;
  variantKey?: string;
  imageId: string;
  updatedAt: string;
}

export interface StorySceneDisplayState {
  saveId: string;
  turnId: string;
  activeShotIds: string[];
  pendingReplacement?: {
    scenePlanId: string;
    shotIds: string[];
    operation?: 'replace-group' | 'replace-shot';
    targetShotIds?: string[];
  };
  updatedAt: string;
}

export const VISUAL_REPOSITORY_SCHEMA_VERSION = 1 as const;

export interface VisualRepositorySnapshot {
  schemaVersion: typeof VISUAL_REPOSITORY_SCHEMA_VERSION;
  saveId: string;
  characterAnchors: Record<string, CharacterVisualAnchor>;
  scenePlans: Record<string, StoredScenePlan>;
  tasks: Record<string, ImageGenerationTask>;
  characterBatches: Record<string, CharacterImageGenerationBatch>;
  assets: Record<string, VisualAsset>;
  bindings: Record<string, VisualBinding>;
  storySceneDisplayStates: Record<string, StorySceneDisplayState>;
}

export interface VisualImageInput {
  imageId: string;
  blobKey: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface UserVisualImageImport extends VisualImageInput {
  saveId: string;
  createdAt: string;
  originSubject?: VisualSubjectRef;
  originPurpose?: VisualPurpose;
  bindAsCurrent?: boolean;
}

export interface UserVisualImageImportResult {
  asset: VisualAsset;
  created: boolean;
  binding?: VisualBinding;
}

export interface PortableVisualBlob {
  imageId: string;
  blobKey: string;
  blob: Blob;
}

export interface VisualArchiveData {
  snapshot: VisualRepositorySnapshot;
  blobs: PortableVisualBlob[];
}
