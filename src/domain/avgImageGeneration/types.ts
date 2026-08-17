import type { AvgSceneOverrideAnchor } from '../avgVisualOverride';
import type { AvgSceneExposure } from '../avgEnvironment';
import type { ImageApiProfile, ComfyWorkflowTemplate } from '../imageGeneration/profile';
import type { VisualAsset } from '../imageGeneration/visualRepository';

export interface AvgPortraitGenerationContext {
  worldpackId: string;
  worldYear: number;
  actorId: string;
  targetKey: string;
  identityLabel: string;
  gender?: string;
  visualAge?: string;
  appearance?: string;
  bodyDescription?: string;
  roleDescription?: string;
  clothingDescription?: string;
  stableIdentityKey?: string;
  generationPurpose?: 'portrait' | 'outfit';
  outfitId?: string;
  outfitDisplayName?: string;
  outfitDescription?: string;
}

export interface AvgSceneGenerationContext {
  worldpackId: string;
  worldYear: number;
  targetKey: string;
  anchor: AvgSceneOverrideAnchor;
  locationName: string;
  district?: string;
  placeType?: string;
  stableDescription?: string;
  publicKnowledge?: string;
  streetAddress?: string;
  roadAnchors?: string[];
  historicalNote?: string;
  exposure?: AvgSceneExposure;
  stableSceneTags?: string[];
}

export interface AvgImageGenerationRoutingOptions {
  profiles: ImageApiProfile[];
  workflows: ComfyWorkflowTemplate[];
}

export interface AvgImageGenerationCandidate {
  purpose:
    | 'avg_character_portrait'
    | 'avg_character_outfit'
    | 'avg_scene_background';
  targetKey: string;
  taskId: string;
  asset: VisualAsset;
  blob: Blob;
  profileId: string;
  profileName: string;
  providerType: ImageApiProfile['providerType'];
  modelOrWorkflowLabel: string;
  positivePrompt: string;
  negativePrompt: string;
  targetAspectRatio: string;
  transparencyMode: 'requested' | 'prompt-only';
}

export interface AvgImageGenerationRequestOptions {
  profileId: string;
  workflowTemplateId?: string;
  additionalInstruction?: string;
  signal?: AbortSignal;
  onStage?: (stage: string) => void;
}
