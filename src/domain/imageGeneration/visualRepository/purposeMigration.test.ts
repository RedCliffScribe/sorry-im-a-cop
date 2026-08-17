import { describe, expect, it } from 'vitest';
import {
  characterImageGenerationBatchSchema,
  imageGenerationTaskSchema,
  visualAssetSchema,
  visualBindingSchema
} from './schemas';
import { createPersistingTask, TEST_ANCHOR } from './testFixtures';

describe('legacy character visual purpose migration', () => {
  it('normalizes old task and batch purposes while preserving their content', () => {
    const rawTask = structuredClone(createPersistingTask()) as unknown as {
      intent: {
        purpose: string;
        appearanceSource?: string;
        anchorSourceImageIds?: string[];
        referenceImageIds: string[];
      };
    };
    rawTask.intent.purpose = 'cowboy-medium-full';
    rawTask.intent.referenceImageIds = ['image_used_to_extract_anchor'];
    delete rawTask.intent.appearanceSource;
    delete rawTask.intent.anchorSourceImageIds;
    const migratedIntent = imageGenerationTaskSchema.parse(rawTask).intent;
    expect(migratedIntent).toMatchObject({
      type: 'character-image',
      purpose: 'knee-up-medium-full',
      appearanceSource: 'legacy-inline',
      anchorSourceImageIds: ['image_used_to_extract_anchor'],
      referenceImageIds: []
    });

    const parsedBatch = characterImageGenerationBatchSchema.parse({
      batchId: 'batch_legacy',
      saveId: 'save_a',
      actorId: 'actor_mei',
      anchorSnapshot: TEST_ANCHOR,
      anchorHash: 'a'.repeat(64),
      additionalRequirementText: '',
      additionalRequirementMode: 'none',
      selectedPurposes: ['cowboy-medium-full'],
      source: 'manual-generate',
      status: 'running',
      taskIds: ['task_legacy'],
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:01.000Z'
    });
    expect(parsedBatch.selectedPurposes).toEqual(['knee-up-medium-full']);
  });

  it('normalizes old asset and binding purposes so existing images remain reachable', () => {
    const parsedAsset = visualAssetSchema.parse({
      imageId: 'image_legacy',
      scope: 'save',
      saveId: 'save_a',
      source: 'user-imported',
      originPurpose: 'cowboy-medium-full',
      mimeType: 'image/png',
      width: 768,
      height: 1152,
      byteLength: 1024,
      contentHash: 'b'.repeat(64),
      blobKey: 'blob_legacy',
      createdAt: '2026-07-22T00:00:00.000Z'
    });
    expect(parsedAsset.originPurpose).toBe('knee-up-medium-full');

    const parsedBinding = visualBindingSchema.parse({
      bindingId: 'binding_legacy',
      saveId: 'save_a',
      subject: { type: 'actor', saveId: 'save_a', actorId: 'actor_mei' },
      purpose: 'cowboy-medium-full',
      imageId: 'image_legacy',
      updatedAt: '2026-07-22T00:00:00.000Z'
    });
    expect(parsedBinding.purpose).toBe('knee-up-medium-full');
  });
});
