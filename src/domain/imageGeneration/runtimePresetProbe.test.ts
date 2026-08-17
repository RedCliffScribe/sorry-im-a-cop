import { describe, expect, it } from 'vitest';
import { createBuiltInCharacterDraftExecutionConfig } from './characterVisualWorkflow';
import { prepareRuntimePresetProbe } from './runtimePresetProbe';
import {
  createDefaultImageApiProfile,
  type GeminiImageProfile,
  type OpenAiImagesProfile
} from './profile';
import { createImageGenerationPreset } from './generationPresets';

describe('runtime preset generation probe', () => {
  it('uses the exact built-in task fingerprint and provider request dimensions', async () => {
    const profile = createDefaultImageApiProfile('openai-images') as OpenAiImagesProfile;
    profile.enabled = true;
    profile.apiBaseUrl = 'https://api.openai.com/v1';
    profile.models = [{ modelId: 'gpt-image-1', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-1';
    profile.credentialId = 'credential:openai';
    const credential = {
      credentialId: 'credential:openai',
      label: 'test',
      providerAffinity: 'openai-images' as const,
      material: { kind: 'bearer-token' as const, token: 'test-key' },
      revision: 1,
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z'
    };

    const prepared = await prepareRuntimePresetProbe({
      profile,
      credential,
      preset: { kind: 'character', purpose: 'half-body-medium' },
      pageUrl: 'https://game.example.test/'
    });
    const execution = await createBuiltInCharacterDraftExecutionConfig({
      profile,
      purpose: 'half-body-medium',
      credential: { credentialId: credential.credentialId, revision: credential.revision }
    });

    expect(prepared.executionFingerprint).toBe(execution.executionFingerprint);
    expect(prepared.profile).toMatchObject({
      model: 'gpt-image-1', size: '1024x1536', quality: 'medium',
      outputFormat: 'png', background: 'opaque'
    });
  });

  it('tests the same saved typed preset fingerprint and parameters used by formal tasks', async () => {
    const profile = createDefaultImageApiProfile('openai-images') as OpenAiImagesProfile;
    profile.enabled = true;
    profile.apiBaseUrl = 'https://api.openai.com/v1';
    profile.models = [{ modelId: 'gpt-image-custom', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-custom';
    profile.credentialId = 'credential:custom';
    const credential = {
      credentialId: 'credential:custom', label: 'test', providerAffinity: 'openai-images' as const,
      material: { kind: 'bearer-token' as const, token: 'test-key' }, revision: 1,
      createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const generationPreset = createImageGenerationPreset({
      name: '玩家半身像预设', profileId: profile.profileId, providerType: profile.providerType,
      variantKey: 'half-body-medium', routingTarget: { kind: 'model', modelId: 'gpt-image-custom' },
      targetAspectRatio: '4:3',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 2,
        size: { mode: 'dimensions', width: 1536, height: 1024 },
        quality: 'high', outputFormat: 'webp', outputCompression: 79, background: 'opaque'
      },
      now: '2026-07-23T07:00:00.000Z'
    });

    const prepared = await prepareRuntimePresetProbe({
      profile,
      credential,
      preset: { kind: 'character', purpose: 'half-body-medium' },
      generationPreset,
      pageUrl: 'https://game.example.test/'
    });
    const execution = await createBuiltInCharacterDraftExecutionConfig({
      profile, purpose: 'half-body-medium', preset: generationPreset,
      credential: { credentialId: credential.credentialId, revision: credential.revision }
    });

    expect(prepared.executionFingerprint).toBe(execution.executionFingerprint);
    expect(prepared.profile).toMatchObject({
      model: 'gpt-image-custom', size: '1536x1024', quality: 'high',
      outputFormat: 'webp', outputCompression: 79, n: 2
    });
  });

  it('preserves Gemini 0.5K from the saved preset through the runtime probe profile', async () => {
    const profile = createDefaultImageApiProfile('gemini-image') as GeminiImageProfile;
    profile.enabled = true;
    profile.models = [{ modelId: 'gemini-3.1-flash-image', source: 'manual' }];
    profile.defaultModelId = 'gemini-3.1-flash-image';
    profile.credentialId = 'credential:gemini';
    const credential = {
      credentialId: 'credential:gemini', label: 'test', providerAffinity: 'gemini-image' as const,
      material: { kind: 'api-key-header' as const, apiKey: 'test-key' }, revision: 1,
      createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const generationPreset = createImageGenerationPreset({
      name: 'Gemini 低分辨率半身像预设', profileId: profile.profileId,
      providerType: profile.providerType, variantKey: 'half-body-medium',
      routingTarget: { kind: 'model', modelId: 'gemini-3.1-flash-image' },
      targetAspectRatio: '3:4',
      generationParameters: {
        providerType: 'gemini-image', requestedImageCount: 1,
        aspectRatio: '3:4', imageSize: '0.5K', mimeType: 'image/jpeg'
      },
      now: '2026-07-23T07:30:00.000Z'
    });

    const prepared = await prepareRuntimePresetProbe({
      profile,
      credential,
      preset: { kind: 'character', purpose: 'half-body-medium' },
      generationPreset,
      pageUrl: 'https://game.example.test/'
    });

    expect(prepared.profile).toMatchObject({
      apiMode: 'interactions', model: 'gemini-3.1-flash-image',
      aspectRatio: '3:4', imageSize: '0.5K', mimeType: 'image/jpeg'
    });
  });
});
