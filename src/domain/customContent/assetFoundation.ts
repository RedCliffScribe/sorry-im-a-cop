import type {
  CustomAssetLifecycle,
  CustomCharacterAsset,
  CustomContentRevision,
  CustomContentRevisionRef
} from './assetTypes';

export const DRAFT_CUSTOM_ASSET_LIFECYCLE: CustomAssetLifecycle = Object.freeze({
  generationStatus: 'idle',
  reviewStatus: 'draft',
  availabilityStatus: 'disabled'
});

export const AI_GENERATED_CUSTOM_ASSET_LIFECYCLE: CustomAssetLifecycle =
  Object.freeze({
    generationStatus: 'ready',
    reviewStatus: 'needs_review',
    availabilityStatus: 'disabled'
  });

export const IMPORTED_CUSTOM_ASSET_LIFECYCLE: CustomAssetLifecycle = Object.freeze({
  generationStatus: 'ready',
  reviewStatus: 'needs_review',
  availabilityStatus: 'disabled'
});

export function isCustomAssetEligibleForNewGame(
  lifecycle: CustomAssetLifecycle
): boolean {
  return (
    lifecycle.generationStatus === 'ready' &&
    lifecycle.reviewStatus === 'approved' &&
    lifecycle.availabilityStatus === 'enabled'
  );
}

export function customContentRevisionRefKey(ref: CustomContentRevisionRef): string {
  return `${ref.assetKind}:${ref.assetId}:${ref.revision}:${ref.checksum}`;
}

export function customContentRevisionIdentityKey(
  ref: Pick<CustomContentRevisionRef, 'assetKind' | 'assetId' | 'revision'>
): string {
  return `${ref.assetKind}:${ref.assetId}:${ref.revision}`;
}

export function createCustomContentRevisionRef(
  revision: CustomContentRevision
): CustomContentRevisionRef {
  if ('characterAssetId' in revision) {
    return {
      assetKind: 'character',
      assetId: revision.characterAssetId,
      revision: revision.revision,
      checksum: revision.checksum
    };
  }
  if ('eventGroupId' in revision) {
    return {
      assetKind: 'event_group',
      assetId: revision.eventGroupId,
      revision: revision.revision,
      checksum: revision.checksum
    };
  }
  return {
    assetKind: 'content_project',
    assetId: revision.projectId,
    revision: revision.revision,
    checksum: revision.checksum
  };
}

export function promoteCustomCharacterAssetToGlobal(
  asset: CustomCharacterAsset,
  updatedAt: string
): CustomCharacterAsset {
  return {
    ...asset,
    global: true,
    projectIds: [...asset.projectIds],
    updatedAt
  };
}
