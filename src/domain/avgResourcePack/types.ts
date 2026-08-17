export const STABLE_IDENTITY_KINDS = [
  'era_seed',
  'screen_character',
  'city_power',
  'custom_character'
] as const;

export type StableIdentityKind = (typeof STABLE_IDENTITY_KINDS)[number];

export interface StableIdentityRef {
  worldpackId: string;
  kind: StableIdentityKind;
  canonicalId: string;
}

export type AvgResourcePackType = 'base' | 'extension';

export type AvgImageMediaType = 'image/png' | 'image/webp';

export type AvgAssetAcceptanceStatus =
  | 'generated'
  | 'technical_pass'
  | 'qa_candidate'
  | 'user_accepted';

export interface AvgAssetProvenance {
  status: AvgAssetAcceptanceStatus;
  sourceRecordId?: string;
  userAcceptanceEvidence?: string;
  acceptanceMode?: 'explicit_version' | 'default_scope_acceptance';
}

export interface AvgImageAssetRef {
  assetId: string;
  /** POSIX-style path relative to the root of the resource pack. */
  path: string;
  mediaType: AvgImageMediaType;
  width?: number;
  height?: number;
  byteLength?: number;
  sha256?: string;
  provenance?: AvgAssetProvenance;
}

export interface AvgPortraitVariantEntry {
  /** Stable within an outfit. Allows multiple accepted images for one emotion. */
  variantId: string;
  emotionId: string;
  image: AvgImageAssetRef;
}

export interface AvgPortraitOutfitEntry {
  outfitId: string;
  defaultVariantId: string;
  variants: Record<string, AvgPortraitVariantEntry>;
}

export interface FixedCharacterPortraitEntry {
  stableIdentity: StableIdentityRef;
  portraitSetId: string;
  displayName?: string;
  defaultOutfitId: string;
  outfits: Record<string, AvgPortraitOutfitEntry>;
}

export interface GenericPortraitProfile {
  gender?: string;
  visualAgeBand?: string;
  roleFamily: string;
  roleSubtype?: string;
  roleTier?: string;
  outfitMode?: string;
  bodyBuild?: string;
  demeanor?: string[];
  stableFeatureTags?: string[];
}

export type GenericPortraitReusePolicy =
  | 'unique_per_save'
  | 'limited_reuse'
  | 'background_reusable';

export interface GenericPortraitSetEntry {
  portraitSetId: string;
  displayName?: string;
  profile: GenericPortraitProfile;
  defaultOutfitId: string;
  outfits: Record<string, AvgPortraitOutfitEntry>;
  reusePolicy: GenericPortraitReusePolicy;
  priority?: number;
}

export interface AvgSceneAssetEntry {
  sceneAssetId: string;
  worldpackId: string;
  displayName?: string;
  runtimeSceneIds?: string[];
  runtimePlaceIds?: string[];
  tags: string[];
  image: AvgImageAssetRef;
  priority?: number;
  reusePolicy?: 'specific' | 'generic';
}

export interface AvgFixedCharacterRegistryV1 {
  schemaVersion: 1;
  worldpackId: string;
  entries: FixedCharacterPortraitEntry[];
}

export interface AvgGenericPortraitRegistryV1 {
  schemaVersion: 1;
  worldpackId: string;
  entries: GenericPortraitSetEntry[];
}

export interface AvgSceneRegistryV1 {
  schemaVersion: 1;
  worldpackId: string;
  entries: AvgSceneAssetEntry[];
}

export interface AvgResourcePackOverrideDeclaration {
  fixedCharacters?: string[];
  genericPortraits?: string[];
  scenes?: string[];
}

export interface AvgResourcePackManifestV1 {
  schemaVersion: 1;
  packId: string;
  worldpackId: string;
  version: string;
  displayName: string;
  description?: string;
  styleId?: string;
  packType: AvgResourcePackType;
  targetBasePackId?: string;
  loadOrder?: number;
  compatibleGameVersion?: {
    min?: string;
    max?: string;
  };
  registries: {
    fixedCharacters: string;
    genericPortraits: string;
    scenes: string;
  };
  assetRoot?: string;
  overrides?: AvgResourcePackOverrideDeclaration;
  fallbacks?: {
    sceneAssetId?: string;
  };
}

export interface AvgLoadedResourcePack {
  manifest: AvgResourcePackManifestV1;
  fixedCharacters: AvgFixedCharacterRegistryV1;
  genericPortraits: AvgGenericPortraitRegistryV1;
  scenes: AvgSceneRegistryV1;
}

export type AvgResourceStorageBackend = 'opfs' | 'indexeddb';

export interface InstalledAvgResourcePackRecord extends AvgLoadedResourcePack {
  storageNamespace: string;
  storageBackend: AvgResourceStorageBackend;
  installedAt: string;
  archiveByteLength: number;
  expandedByteLength: number;
  assetCount: number;
  validation: {
    status: 'valid';
    checkedAt: string;
    warnings: string[];
  };
}

export interface AvgResourcePackSelection {
  worldpackId: string;
  basePackId?: string;
  extensionPackIds: string[];
  updatedAt: string;
}

export interface AvgResourcePackInstallProgress {
  phase: 'reading' | 'validating' | 'committing';
  archiveBytesRead: number;
  archiveByteLength: number;
  entriesRead: number;
  currentPath?: string;
}

export interface AvgResourcePackInstallResult {
  record: InstalledAvgResourcePackRecord;
  replacedVersion?: string;
}

export interface AvgResolvedPortraitAsset {
  source: 'user_override' | 'extension' | 'base';
  sourcePackId?: string;
  portraitSetId: string;
  outfitId: string;
  variantId: string;
  emotionId: string;
  image: AvgImageAssetRef;
  fallbackReason?:
    | 'requested_outfit_missing'
    | 'requested_variant_missing'
    | 'requested_emotion_missing';
}

export interface AvgResolvedSceneAsset {
  source: 'user_override' | 'extension' | 'base' | 'fallback';
  sourcePackId?: string;
  entry: AvgSceneAssetEntry;
  matchReason:
    | 'scene_asset_id'
    | 'runtime_scene_id'
    | 'runtime_place_id'
    | 'tags'
    | 'configured_fallback'
    | 'generic_fallback';
}

/**
 * Reserved contract for save-local/player overrides. AVG-001 intentionally does
 * not provide a concrete implementation or a replacement UI.
 */
export interface AvgVisualOverrideRepository {
  getFixedCharacter(identityKey: string): FixedCharacterPortraitEntry | undefined;
  getGenericPortraitSet(portraitSetId: string): GenericPortraitSetEntry | undefined;
  getScene(sceneAssetId: string): AvgSceneAssetEntry | undefined;
}
