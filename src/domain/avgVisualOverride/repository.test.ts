import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IndexedDbAvgVisualOverrideRepository,
  MemoryAvgVisualOverrideRepository
} from './repository';
import type {
  AvgActorVisualOverrideKey,
  AvgSceneVisualOverrideKey,
  AvgValidatedOverrideImage,
  AvgVisualOverrideRepository
} from './types';

const databaseNames: string[] = [];

const actorKey: AvgActorVisualOverrideKey = {
  visualPartitionId: 'chain_a',
  worldpackId: 'hk1988',
  actorId: 'actor_a'
};

const sceneKey: AvgSceneVisualOverrideKey = {
  visualPartitionId: 'chain_a',
  worldpackId: 'hk1988',
  anchor: { type: 'runtime_scene', id: 'scene_cid' }
};

function image(seed: string): AvgValidatedOverrideImage {
  const blob = new Blob([seed], { type: 'image/png' });
  return {
    blob,
    mediaType: 'image/png',
    width: 100,
    height: 200,
    byteLength: blob.size,
    sha256: seed.padEnd(64, '0').slice(0, 64),
    originalFileName: `${seed}.png`
  };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is blocked.`));
  });
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteDatabase));
});

describe.each([
  ['memory', () => new MemoryAvgVisualOverrideRepository() as AvgVisualOverrideRepository],
  ['IndexedDB', () => {
    const name = `avg-override-test-${crypto.randomUUID()}`;
    databaseNames.push(name);
    return new IndexedDbAvgVisualOverrideRepository(name) as AvgVisualOverrideRepository;
  }]
] as const)('%s AVG visual override repository', (_label, createRepository) => {
  it('replaces an actor image atomically and removes the orphaned old Blob', async () => {
    const repository = createRepository();
    const first = await repository.replaceActorOverride(actorKey, image('first'));
    const second = await repository.replaceActorOverride(actorKey, image('second'));

    expect(second.mapping.assetId).not.toBe(first.mapping.assetId);
    expect(await repository.getAssetBlob(first.mapping.assetId)).toBeUndefined();
    expect(await repository.getAssetBlob(second.mapping.assetId)).toBeInstanceOf(Blob);
    expect((await repository.getActorOverride(actorKey))?.mapping.assetId)
      .toBe(second.mapping.assetId);
  });

  it('deduplicates one image across actor and scene mappings and only cleans it after the last reference', async () => {
    const repository = createRepository();
    const source = image('shared');
    const actor = await repository.replaceActorOverride(actorKey, source);
    const scene = await repository.replaceSceneOverride(sceneKey, source);
    expect(scene.mapping.assetId).toBe(actor.mapping.assetId);

    await repository.removeActorOverride(actorKey);
    expect(await repository.getAssetBlob(actor.mapping.assetId)).toBeInstanceOf(Blob);
    await repository.removeSceneOverride(sceneKey);
    expect(await repository.getAssetBlob(actor.mapping.assetId)).toBeUndefined();
  });

  it('isolates independent visual partitions and clears only the requested playthrough', async () => {
    const repository = createRepository();
    await repository.replaceActorOverride(actorKey, image('partition-a'));
    const otherKey = { ...actorKey, visualPartitionId: 'chain_b' };
    await repository.replaceActorOverride(otherKey, image('partition-b'));

    await repository.clearPartition('chain_a');
    expect(await repository.getActorOverride(actorKey)).toBeUndefined();
    expect(await repository.getActorOverride(otherKey)).toBeDefined();
  });

  it('treats the runtime hk_1988 alias as the same worldpack key as hk1988', async () => {
    const repository = createRepository();
    await repository.replaceActorOverride(actorKey, image('alias'));

    expect(await repository.getActorOverride({
      ...actorKey,
      worldpackId: 'hk_1988'
    })).toMatchObject({ status: 'ready' });
  });

  it('round-trips a partition snapshot without touching another partition', async () => {
    const source = createRepository();
    await source.replaceActorOverride(actorKey, image('actor'));
    await source.replaceSceneOverride(sceneKey, image('scene'));
    const snapshot = await source.exportPartition('chain_a');
    const blobs = new Map<string, Blob>();
    for (const asset of snapshot.assets) {
      blobs.set(asset.assetId, (await source.getAssetBlob(asset.assetId))!);
    }

    const destination = createRepository();
    const keepKey = { ...actorKey, visualPartitionId: 'chain_keep' };
    await destination.replaceActorOverride(keepKey, image('keep'));
    await destination.replacePartitionFromArchive(snapshot, blobs);

    expect((await destination.getActorOverride(actorKey))?.status).toBe('ready');
    expect((await destination.getSceneOverride(sceneKey))?.status).toBe('ready');
    expect(await destination.getActorOverride(keepKey)).toBeDefined();
  });

  it('keeps official outfit choices per base pack and one user outfit across pack switches', async () => {
    const repository = createRepository();
    await repository.setActorOutfitSelection(actorKey, {
      type: 'resource_outfit', basePackId: 'pack_a', outfitId: 'formal'
    }, 'pack_a');
    await repository.setActorOutfitSelection(actorKey, {
      type: 'resource_outfit', basePackId: 'pack_b', outfitId: 'casual'
    }, 'pack_b');
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_a')).selection)
      .toEqual({ type: 'resource_outfit', basePackId: 'pack_a', outfitId: 'formal' });
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_b')).selection)
      .toEqual({ type: 'resource_outfit', basePackId: 'pack_b', outfitId: 'casual' });

    const userOutfit = await repository.createUserOutfit(actorKey, {
      displayName: '晚宴装', visualDescription: '酒红色丝绒晚宴装'
    });
    await repository.setActorOutfitSelection(actorKey, {
      type: 'user_outfit', outfitId: userOutfit.outfitId
    }, 'pack_a');
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_b')).selection)
      .toEqual({ type: 'user_outfit', outfitId: userOutfit.outfitId });

    await repository.setActorOutfitSelection(actorKey, { type: 'resource_default' }, 'pack_b');
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_b')).selection)
      .toEqual({ type: 'resource_default' });
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_a')).selection)
      .toEqual({ type: 'resource_outfit', basePackId: 'pack_a', outfitId: 'formal' });
  });

  it('removes a selected user outfit, its mapping and orphan Blob atomically', async () => {
    const repository = createRepository();
    const userOutfit = await repository.createUserOutfit(actorKey, {
      displayName: '便装'
    });
    await repository.setActorOutfitSelection(actorKey, {
      type: 'user_outfit', outfitId: userOutfit.outfitId
    }, 'pack_a');
    const stored = await repository.replaceActorOutfitOverride({
      ...actorKey,
      outfit: { type: 'user_outfit', outfitId: userOutfit.outfitId }
    }, image('outfit-specific'));

    await repository.removeUserOutfit(actorKey, userOutfit.outfitId, 'pack_a');

    expect(await repository.listUserOutfits(actorKey)).toEqual([]);
    expect((await repository.getActorOutfitSelection(actorKey, 'pack_a')).selection)
      .toEqual({ type: 'resource_default' });
    expect(await repository.getActorOutfitOverride({
      ...actorKey,
      outfit: { type: 'user_outfit', outfitId: userOutfit.outfitId }
    })).toBeUndefined();
    expect(await repository.getAssetBlob(stored.mapping.assetId)).toBeUndefined();
  });

  it('round-trips user outfit metadata, selections and outfit-specific images', async () => {
    const source = createRepository();
    const outfit = await source.createUserOutfit(actorKey, {
      displayName: '深色便装', visualDescription: '深灰夹克与高腰长裤'
    });
    await source.setActorOutfitSelection(actorKey, {
      type: 'user_outfit', outfitId: outfit.outfitId
    }, 'pack_a');
    await source.replaceActorOutfitOverride({
      ...actorKey,
      outfit: { type: 'user_outfit', outfitId: outfit.outfitId }
    }, image('portable-outfit'));
    const snapshot = await source.exportPartition('chain_a');
    const blobs = new Map<string, Blob>();
    for (const asset of snapshot.assets) {
      blobs.set(asset.assetId, (await source.getAssetBlob(asset.assetId))!);
    }
    const destination = createRepository();
    await destination.replacePartitionFromArchive(snapshot, blobs);

    expect(await destination.listUserOutfits(actorKey)).toEqual([
      expect.objectContaining({ outfitId: outfit.outfitId, displayName: '深色便装' })
    ]);
    expect((await destination.getActorOutfitSelection(actorKey, 'pack_a')).selection)
      .toEqual({ type: 'user_outfit', outfitId: outfit.outfitId });
    expect((await destination.getActorOutfitOverride({
      ...actorKey,
      outfit: { type: 'user_outfit', outfitId: outfit.outfitId }
    }))?.status).toBe('ready');
  });
});

it('keeps a damaged mapping visible for fail-soft diagnostics and restoration', async () => {
  const repository = new MemoryAvgVisualOverrideRepository();
  const stored = await repository.replaceActorOverride(actorKey, image('damaged'));
  repository.removeAssetForTest(stored.mapping.assetId);
  expect(await repository.getActorOverride(actorKey)).toMatchObject({ status: 'asset_missing' });
  await repository.removeActorOverride(actorKey);
  expect(await repository.getActorOverride(actorKey)).toBeUndefined();
});
