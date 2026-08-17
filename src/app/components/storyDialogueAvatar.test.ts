import { describe, expect, it } from 'vitest';
import type { VisualAsset, VisualRepositorySnapshot } from '../../domain/imageGeneration/visualRepository';
import { findActorDialogueAvatarAsset } from './storyDialogueAvatar';

function asset(imageId: string, purpose: VisualAsset['originPurpose']): VisualAsset {
  return {
    imageId,
    scope: 'save',
    saveId: 'save_1',
    source: 'generated',
    originPurpose: purpose,
    mimeType: 'image/png',
    width: 512,
    height: 512,
    byteLength: 4,
    contentHash: imageId,
    blobKey: `blob_${imageId}`,
    createdAt: '2026-07-23T00:00:00.000Z'
  };
}

function snapshot(): VisualRepositorySnapshot {
  const avatar = asset('avatar', 'avatar-close-up');
  const half = asset('half', 'half-body-medium');
  return {
    schemaVersion: 1,
    saveId: 'save_1',
    characterAnchors: {},
    scenePlans: {},
    tasks: {},
    characterBatches: {},
    assets: { avatar, half },
    bindings: {
      avatar: { bindingId: 'avatar', saveId: 'save_1', subject: { type: 'actor', saveId: 'save_1', actorId: 'npc_1' }, purpose: 'avatar-close-up', imageId: 'avatar', updatedAt: '2026-07-23T00:00:00.000Z' },
      half: { bindingId: 'half', saveId: 'save_1', subject: { type: 'actor', saveId: 'save_1', actorId: 'npc_1' }, purpose: 'half-body-medium', imageId: 'half', updatedAt: '2026-07-23T00:00:00.000Z' }
    },
    storySceneDisplayStates: {}
  };
}

describe('dialogue avatar fallback', () => {
  it('prefers the dedicated avatar over larger character views', () => {
    expect(findActorDialogueAvatarAsset(snapshot(), 'npc_1')?.imageId).toBe('avatar');
  });

  it('falls back to the half-body image when the avatar binding is absent', () => {
    const value = snapshot();
    delete value.bindings.avatar;
    expect(findActorDialogueAvatarAsset(value, 'npc_1')?.imageId).toBe('half');
  });

  it('finds an old visual binding through an authoritative actor id alias', () => {
    const value = snapshot();
    value.bindings.avatar.subject = {
      type: 'actor',
      saveId: 'save_1',
      actorId: 'npc_temporary_1'
    };

    expect(findActorDialogueAvatarAsset(value, 'npc_1', {
      npc_temporary_1: 'npc_1'
    })?.imageId).toBe('avatar');
  });
});
