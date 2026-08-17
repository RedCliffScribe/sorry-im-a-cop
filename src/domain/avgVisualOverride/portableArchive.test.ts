import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MemoryAvgVisualOverrideRepository } from './repository';
import {
  createPortableAvgOverrideArchive,
  parsePortableAvgOverrideArchive,
  rebaseAvgOverrideArchive
} from './portableArchive';
import type { AvgValidatedOverrideImage } from './types';

async function image(seed: string): Promise<AvgValidatedOverrideImage> {
  const blob = new Blob([seed], { type: 'image/png' });
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return {
    blob,
    mediaType: 'image/png',
    width: 10,
    height: 20,
    byteLength: blob.size,
    sha256: Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(''),
    source: 'image_generation',
    sourceTaskId: `task_${seed}`
  };
}

describe('portable AVG override archive', () => {
  it('exports only player override mappings and Blobs, validates them, and safely rebases repeated imports', async () => {
    const repository = new MemoryAvgVisualOverrideRepository();
    await repository.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'actor_a'
    }, await image('portrait'));
    await repository.replaceSceneOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988',
      anchor: { type: 'runtime_place', id: 'place_a' }
    }, await image('scene'));
    const outfit = await repository.createUserOutfit({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'actor_a'
    }, { displayName: '晚宴装', visualDescription: '酒红色丝绒晚宴装' });
    await repository.setActorOutfitSelection({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'actor_a'
    }, { type: 'user_outfit', outfitId: outfit.outfitId }, 'fixture_base');
    await repository.replaceActorOutfitOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'actor_a',
      outfit: { type: 'user_outfit', outfitId: outfit.outfitId }
    }, await image('outfit'));
    const snapshot = await repository.exportPartition('chain_a');
    const archive = await createPortableAvgOverrideArchive(
      snapshot,
      (assetId) => repository.getAssetBlob(assetId),
      '2026-08-10T00:00:00.000Z'
    );
    const parsed = await parsePortableAvgOverrideArchive(archive);
    const rebased = rebaseAvgOverrideArchive(parsed, 'chain_imported');
    const destination = new MemoryAvgVisualOverrideRepository();
    await destination.replacePartitionFromArchive(rebased.snapshot, rebased.blobs);

    expect(rebased.snapshot.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.actorOverrides[0]?.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.sceneOverrides[0]?.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.userOutfits[0]?.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.outfitSelections[0]?.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.outfitOverrides[0]?.visualPartitionId).toBe('chain_imported');
    expect(rebased.snapshot.assets.every((asset) => asset.assetId.includes('chain_imported')))
      .toBe(true);
    expect((await destination.exportPartition('chain_imported')).assets).toHaveLength(3);
    expect((await destination.getActorOverride({
      visualPartitionId: 'chain_imported', worldpackId: 'hk1988', actorId: 'actor_a'
    }))?.asset).toMatchObject({ source: 'image_generation', sourceTaskId: 'task_portrait' });
  });

  it('imports a version 1 embedded archive as resource-default with empty outfit metadata', async () => {
    const snapshot = {
      visualPartitionId: 'legacy_chain',
      actorOverrides: [],
      sceneOverrides: [],
      assets: []
    };
    const archive = zipSync({
      'snapshot.json': strToU8(JSON.stringify(snapshot)),
      'manifest.json': strToU8(JSON.stringify({
        format: 'sorry-im-a-cop-v2-avg-overrides',
        version: 1,
        exportedAt: '2026-08-10T00:00:00.000Z',
        visualPartitionId: 'legacy_chain',
        snapshotPath: 'snapshot.json',
        images: []
      }))
    });

    const parsed = await parsePortableAvgOverrideArchive(archive);
    expect(parsed.snapshot).toMatchObject({
      visualPartitionId: 'legacy_chain',
      userOutfits: [],
      outfitSelections: [],
      outfitOverrides: []
    });
  });
});
