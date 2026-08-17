import { describe, expect, it } from 'vitest';
import {
  AI_GENERATED_CUSTOM_ASSET_LIFECYCLE,
  createCustomContentRevisionRef,
  customContentRevisionIdentityKey,
  customContentRevisionRefKey,
  isCustomAssetEligibleForNewGame,
  promoteCustomCharacterAssetToGlobal
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomContentProjectRevision
} from './assetTypes';

describe('custom content asset foundation', () => {
  it('requires every lifecycle gate before an asset becomes a new-game candidate', () => {
    expect(isCustomAssetEligibleForNewGame(
      AI_GENERATED_CUSTOM_ASSET_LIFECYCLE
    )).toBe(false);
    expect(isCustomAssetEligibleForNewGame({
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    })).toBe(true);
  });

  it('promotes a project character without changing its identity or revision lineage', () => {
    const source: CustomCharacterAsset = {
      characterAssetId: 'character_1',
      latestRevision: 3,
      revisionCount: 3,
      global: false,
      projectIds: ['project_1'],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    };

    const promoted = promoteCustomCharacterAssetToGlobal(
      source,
      '2026-07-26T01:00:00.000Z'
    );

    expect(promoted).toEqual({
      ...source,
      global: true,
      updatedAt: '2026-07-26T01:00:00.000Z'
    });
    expect(promoted.characterAssetId).toBe(source.characterAssetId);
    expect(promoted.latestRevision).toBe(source.latestRevision);
    expect(promoted.projectIds).not.toBe(source.projectIds);
    expect(source.global).toBe(false);
  });

  it('creates stable revision keys without relying on titles or names', () => {
    const revision: CustomContentProjectRevision = {
      projectId: 'project_1',
      revision: 2,
      checksum: 'checksum_2',
      title: '项目标题',
      summary: '项目摘要',
      conversionMode: 'structural_adaptation',
      characterAssetIds: [],
      eventGroupIds: [],
      deployments: [],
      sourceDocumentIds: [],
      lifecycle: {
        generationStatus: 'ready',
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      }
    };
    const ref = createCustomContentRevisionRef(revision);

    expect(ref).toEqual({
      assetKind: 'content_project',
      assetId: 'project_1',
      revision: 2,
      checksum: 'checksum_2'
    });
    expect(customContentRevisionIdentityKey(ref)).toBe(
      'content_project:project_1:2'
    );
    expect(customContentRevisionRefKey(ref)).toBe(
      'content_project:project_1:2:checksum_2'
    );
  });
});
