import type { ActorId } from '../runtime/types';

export const AVG_OVERRIDE_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp'
] as const;

export type AvgOverrideImageMediaType = (typeof AVG_OVERRIDE_IMAGE_MEDIA_TYPES)[number];

export type AvgPortraitOverrideScope =
  | 'actor_all_variants'
  | 'actor_outfit_all_variants';

export interface AvgActorVisualOverrideKey {
  visualPartitionId: string;
  worldpackId: string;
  actorId: ActorId;
}

export type AvgOutfitSelection =
  | { type: 'resource_default' }
  | { type: 'resource_outfit'; basePackId: string; outfitId: string }
  | { type: 'user_outfit'; outfitId: string };

export type AvgOutfitOverrideTarget =
  | { type: 'resource_outfit'; basePackId: string; outfitId: string }
  | { type: 'user_outfit'; outfitId: string };

export interface AvgUserOutfitDefinition {
  outfitId: string;
  visualPartitionId: string;
  worldpackId: string;
  actorId: ActorId;
  displayName: string;
  visualDescription?: string;
  semanticTags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AvgUserOutfitDraft {
  displayName: string;
  visualDescription?: string;
  semanticTags?: string[];
}

export interface AvgActorOutfitSelectionState {
  visualPartitionId: string;
  worldpackId: string;
  actorId: ActorId;
  activeUserOutfitId?: string;
  resourceOutfitIdsByBasePack: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface AvgActorOutfitSelectionLookup {
  selection: AvgOutfitSelection;
  state?: AvgActorOutfitSelectionState;
  status: 'ready' | 'user_outfit_missing';
  missingUserOutfitId?: string;
}

export interface AvgActorOutfitVisualOverrideKey extends AvgActorVisualOverrideKey {
  outfit: AvgOutfitOverrideTarget;
}

export type AvgSceneOverrideAnchor =
  | { type: 'runtime_scene'; id: string }
  | { type: 'runtime_place'; id: string };

export interface AvgSceneVisualOverrideKey {
  visualPartitionId: string;
  worldpackId: string;
  anchor: AvgSceneOverrideAnchor;
}

export interface AvgOverrideAssetMetadata {
  assetId: string;
  visualPartitionId: string;
  mediaType: AvgOverrideImageMediaType;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  source?: 'manual_upload' | 'image_generation';
  sourceTaskId?: string;
  originalFileName?: string;
  createdAt: string;
}

export interface AvgValidatedOverrideImage {
  blob: Blob;
  mediaType: AvgOverrideImageMediaType;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
  source?: 'manual_upload' | 'image_generation';
  sourceTaskId?: string;
  originalFileName?: string;
}

export interface AvgActorVisualOverride {
  visualPartitionId: string;
  worldpackId: string;
  actorId: ActorId;
  scope: 'actor_all_variants';
  assetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvgActorOutfitVisualOverride {
  visualPartitionId: string;
  worldpackId: string;
  actorId: ActorId;
  scope: 'actor_outfit_all_variants';
  outfit: AvgOutfitOverrideTarget;
  assetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvgSceneVisualOverride {
  visualPartitionId: string;
  worldpackId: string;
  anchor: AvgSceneOverrideAnchor;
  assetId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvgActorVisualOverrideLookup {
  mapping: AvgActorVisualOverride;
  asset?: AvgOverrideAssetMetadata;
  status: 'ready' | 'asset_missing';
}

export interface AvgActorOutfitVisualOverrideLookup {
  mapping: AvgActorOutfitVisualOverride;
  asset?: AvgOverrideAssetMetadata;
  status: 'ready' | 'asset_missing';
}

export interface AvgSceneVisualOverrideLookup {
  mapping: AvgSceneVisualOverride;
  asset?: AvgOverrideAssetMetadata;
  status: 'ready' | 'asset_missing';
}

export interface AvgVisualOverridePartitionSnapshot {
  visualPartitionId: string;
  actorOverrides: AvgActorVisualOverride[];
  sceneOverrides: AvgSceneVisualOverride[];
  userOutfits: AvgUserOutfitDefinition[];
  outfitSelections: AvgActorOutfitSelectionState[];
  outfitOverrides: AvgActorOutfitVisualOverride[];
  assets: AvgOverrideAssetMetadata[];
}

export interface AvgVisualOverrideRepository {
  getActorOverride(key: AvgActorVisualOverrideKey): Promise<AvgActorVisualOverrideLookup | undefined>;
  getSceneOverride(key: AvgSceneVisualOverrideKey): Promise<AvgSceneVisualOverrideLookup | undefined>;
  listUserOutfits(key: AvgActorVisualOverrideKey): Promise<AvgUserOutfitDefinition[]>;
  createUserOutfit(
    key: AvgActorVisualOverrideKey,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition>;
  updateUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    draft: AvgUserOutfitDraft
  ): Promise<AvgUserOutfitDefinition>;
  removeUserOutfit(
    key: AvgActorVisualOverrideKey,
    outfitId: string,
    activeBasePackId?: string
  ): Promise<void>;
  getActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    basePackId: string
  ): Promise<AvgActorOutfitSelectionLookup>;
  setActorOutfitSelection(
    key: AvgActorVisualOverrideKey,
    selection: AvgOutfitSelection,
    activeBasePackId: string
  ): Promise<AvgActorOutfitSelectionLookup>;
  getActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey
  ): Promise<AvgActorOutfitVisualOverrideLookup | undefined>;
  replaceActorOutfitOverride(
    key: AvgActorOutfitVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorOutfitVisualOverrideLookup>;
  removeActorOutfitOverride(key: AvgActorOutfitVisualOverrideKey): Promise<void>;
  getAssetBlob(assetId: string): Promise<Blob | undefined>;
  replaceActorOverride(
    key: AvgActorVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgActorVisualOverrideLookup>;
  replaceSceneOverride(
    key: AvgSceneVisualOverrideKey,
    image: AvgValidatedOverrideImage
  ): Promise<AvgSceneVisualOverrideLookup>;
  removeActorOverride(key: AvgActorVisualOverrideKey): Promise<void>;
  removeSceneOverride(key: AvgSceneVisualOverrideKey): Promise<void>;
  exportPartition(visualPartitionId: string): Promise<AvgVisualOverridePartitionSnapshot>;
  replacePartitionFromArchive(
    snapshot: AvgVisualOverridePartitionSnapshot,
    blobs: ReadonlyMap<string, Blob>
  ): Promise<void>;
  clearPartition(visualPartitionId: string): Promise<void>;
  clearAll(): Promise<void>;
}

/** Runtime-only renderable reference. It is never written to a Resource Pack registry. */
export interface AvgOverrideImageAssetRef {
  kind: 'save_override';
  assetId: string;
  mediaType: AvgOverrideImageMediaType;
  width: number;
  height: number;
  byteLength: number;
  sha256: string;
}

export function toAvgOverrideImageAssetRef(
  asset: AvgOverrideAssetMetadata
): AvgOverrideImageAssetRef {
  return {
    kind: 'save_override',
    assetId: asset.assetId,
    mediaType: asset.mediaType,
    width: asset.width,
    height: asset.height,
    byteLength: asset.byteLength,
    sha256: asset.sha256
  };
}

export function isAvgOverrideImageAssetRef(value: unknown): value is AvgOverrideImageAssetRef {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'save_override'
  );
}
