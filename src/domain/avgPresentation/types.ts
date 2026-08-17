import type {
  AvgImageAssetRef,
  AvgResolvedPortraitAsset,
  AvgResolvedSceneAsset,
  AvgResourceResolver,
  GenericPortraitReusePolicy
} from '../avgResourcePack';
import type {
  AvgOverrideImageAssetRef,
  AvgOutfitSelection,
  AvgSceneOverrideAnchor,
  AvgVisualOverrideRepository
} from '../avgVisualOverride';
import type { StoryEmotion } from '../runtime/storyBlocks';
import type {
  Actor,
  ActorId,
  RuntimeState,
  StoryEntry,
  TurnId
} from '../runtime/types';
import type {
  AvgEnvironmentDiagnostics,
  AvgEnvironmentVisualState
} from '../avgEnvironment';

export interface AvgActiveResourcePackRef {
  worldpackId: string;
  basePackId: string;
  basePackVersion: string;
  extensionPackIds?: readonly string[];
}

export interface GenericPortraitIdentityProfile {
  gender?: Actor['gender'];
  visualAge?: number;
  visualAgeBand?: string;
  roleFamily?: string;
  roleSubtype?: string;
  roleTier?: string;
  bodyBuild?: string;
  demeanor?: string[];
  stableFeatureTags?: string[];
  roleTags?: string[];
}

export interface AvgGenericPortraitBinding {
  saveId: string;
  actorId: ActorId;
  worldpackId: string;
  basePackId: string;
  portraitSetId: string;
  profileSnapshot?: GenericPortraitIdentityProfile;
  createdAt: string;
  updatedAt: string;
}

export interface AvgGenericPortraitBindingRepository {
  get(
    saveId: string,
    actorId: ActorId,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding | undefined>;
  listForSavePack(
    saveId: string,
    worldpackId: string,
    basePackId: string
  ): Promise<AvgGenericPortraitBinding[]>;
  bindIfAvailable(
    binding: AvgGenericPortraitBinding,
    reusePolicy: GenericPortraitReusePolicy
  ): Promise<boolean>;
  remove(
    saveId: string,
    actorId: ActorId,
    worldpackId: string,
    basePackId: string
  ): Promise<void>;
  clearSave(saveId: string): Promise<void>;
}

export interface ResolvedAvgPortrait {
  actorId: ActorId;
  source: 'fixed' | 'generic_bound' | 'generic_new' | 'save_override';
  resourceSource?: AvgResolvedPortraitAsset['source'];
  sourcePackId?: string;
  portraitSetId: string;
  outfitId: string;
  requestedEmotion: StoryEmotion;
  resolvedVariantId: string;
  asset: AvgImageAssetRef | AvgOverrideImageAssetRef;
  fallbackChain: string[];
}

export interface ResolvedAvgScene {
  sceneAssetId: string;
  asset: AvgImageAssetRef | AvgOverrideImageAssetRef;
  tags: readonly string[];
  resourceSource?: AvgResolvedSceneAsset['source'];
  sourcePackId?: string;
  matchType:
    | 'runtime_scene_id'
    | 'runtime_place_id'
    | 'explicit_alias'
    | 'tag_match'
    | 'generic'
    | 'fallback'
    | 'save_override';
  score?: number;
}

export interface AvgEnvironmentPresentationContext {
  timeDescription?: string;
  weatherDescription?: string;
  locationDescription?: string;
}

export type AvgPlayerPortraitMode = 'hidden' | 'show';

/**
 * Describes whether the resolved portrait is the active speaker or a visually
 * de-emphasized person who remains present while narration/player thought is
 * presented. This is presentation-only state.
 */
export type AvgPortraitStageMode = 'active' | 'receded';

export interface AvgPresentationFrame {
  blockIndex: number;
  blockType: 'narration' | 'dialogue' | 'inner_monologue';
  speakerActorId?: ActorId;
  speakerLabel?: string;
  portrait: ResolvedAvgPortrait | null;
  portraitStageMode?: AvgPortraitStageMode;
  scene: ResolvedAvgScene | null;
  environment?: AvgEnvironmentPresentationContext;
  changeFlags: {
    portraitChanged: boolean;
    portraitVariantChanged: boolean;
    portraitStageChanged: boolean;
    sceneChanged: boolean;
  };
}

/**
 * Ephemeral renderer hand-off between adjacent StoryEntry sequences.
 * This is derived presentation state only and must not be persisted into
 * RuntimeState, StoryEntry, or the save archive.
 */
export interface AvgPresentationCarryState {
  sceneAssetId?: string;
  sceneImageAssetId?: string;
  primaryPortrait?: ResolvedAvgPortrait;
  primaryPortraitStageMode?: AvgPortraitStageMode;
}

export interface AvgPortraitResolutionDiagnostic {
  blockIndex: number;
  actorId?: ActorId;
  stableIdentityKey?: string;
  source:
    | 'fixed'
    | 'generic-existing-binding'
    | 'generic-new-binding'
    | 'save-override'
    | 'unresolved';
  portraitSetId?: string;
  requestedEmotion?: StoryEmotion;
  outfitSelection?: AvgOutfitSelection;
  requestedOutfitId?: string;
  resolvedOutfitId?: string;
  fallbackChain?: string[];
  resolvedVariant?: string;
  genericScore?: number;
  genericProfile?: GenericPortraitIdentityProfile;
  speakerNotPresent?: boolean;
  overrideLookupKey?: string;
  outfitOverrideLookupKey?: string;
  outfitOverrideFound?: boolean;
  outfitOverrideAssetId?: string;
  outfitOverrideValid?: boolean;
  overrideFound?: boolean;
  overrideAssetId?: string;
  overrideValid?: boolean;
  underlyingSource?: ResolvedAvgPortrait['source'] | 'none';
  finalSource?: ResolvedAvgPortrait['source'] | 'none';
  reasons: string[];
}

export interface AvgSceneResolutionDiagnostic {
  runtimeSceneId?: string;
  runtimePlaceId?: string;
  inputTags: string[];
  resolvedSceneAssetId?: string;
  matchType?: ResolvedAvgScene['matchType'];
  score?: number;
  fallbackReason?: string;
  overrideAnchor?: AvgSceneOverrideAnchor;
  overrideFound?: boolean;
  overrideAssetId?: string;
  overrideValid?: boolean;
  underlyingResolvedSceneAssetId?: string;
  finalSource?: 'save_override' | 'resource_pack' | 'none';
}

export interface AvgPresentationDiagnostics {
  portraits: AvgPortraitResolutionDiagnostic[];
  scene: AvgSceneResolutionDiagnostic;
  environment: AvgEnvironmentDiagnostics;
  warnings: string[];
}

export interface AvgPresentationSequence {
  storyEntryTurnId: TurnId;
  scene: ResolvedAvgScene | null;
  environment: AvgEnvironmentVisualState;
  frames: AvgPresentationFrame[];
  finalPresentation: AvgPresentationCarryState;
  diagnostics?: AvgPresentationDiagnostics;
}

export interface AvgScenePresentationInput {
  runtimeSceneId?: string;
  runtimePlaceId?: string;
  tags?: readonly string[];
  absentActorIds?: readonly ActorId[];
}

export interface AvgGenericPortraitProfileAdapter {
  buildProfile(actor: Actor): Partial<GenericPortraitIdentityProfile>;
}

export interface ResolveAvgPresentationInput {
  saveId: string;
  storyEntry: StoryEntry;
  runtimeState: RuntimeState;
  resourceResolver?: AvgResourceResolver;
  activePack?: AvgActiveResourcePackRef;
  bindingRepository?: AvgGenericPortraitBindingRepository;
  overrideRepository?: AvgVisualOverrideRepository;
  genericProfileAdapter?: AvgGenericPortraitProfileAdapter;
  sceneInput?: AvgScenePresentationInput;
  previousPresentation?: AvgPresentationCarryState;
  playerPortraitMode?: AvgPlayerPortraitMode;
  includeDiagnostics?: boolean;
}
