import { describe, expect, it } from 'vitest';
import { createDefaultImageApiProfile, type ComfyWorkflowTemplate, type ImageApiProfile } from './profile';
import {
  resolveReferenceImageCapability,
  snapshotReferenceAssets
} from './referenceImageTransport';
import { compiledImageRequestDraftSchema } from './visualRepository/schemas';
import { createDraft } from './visualRepository/testFixtures';
import type { VisualAsset } from './visualRepository/types';

const now = '2026-07-26T00:00:00.000Z';

function enabledProfile(providerType: ImageApiProfile['providerType']): ImageApiProfile {
  return {
    ...createDefaultImageApiProfile(providerType, `profile-${providerType}`, now),
    enabled: true
  } as ImageApiProfile;
}

function asset(patch: Partial<VisualAsset> = {}): VisualAsset {
  return {
    imageId: 'image-reference',
    scope: 'save',
    saveId: 'save-a',
    source: 'generated',
    mimeType: 'image/png',
    width: 640,
    height: 960,
    byteLength: 8,
    contentHash: 'a'.repeat(64),
    blobKey: 'blob-reference',
    createdAt: now,
    ...patch
  };
}

describe('reference image capability matrix', () => {
  it('freezes the supported transport and conservative maximum for all seven providers', () => {
    const comfyWorkflow: ComfyWorkflowTemplate = {
      workflowTemplateId: 'workflow-reference',
      name: 'img2img',
      apiWorkflow: {
        '1': { class_type: 'Text', inputs: { text: '' } },
        '2': { class_type: 'LoadImage', inputs: { image: '' } },
        '9': { class_type: 'Output', inputs: {} }
      },
      workflowHash: 'a'.repeat(64),
      bindings: {
        positivePrompt: { nodeId: '1', inputName: 'text' },
        referenceImage: { nodeId: '2', inputName: 'image' }
      },
      outputNodeIds: ['9'],
      revision: 1,
      createdAt: now,
      updatedAt: now
    };
    const alibaba = enabledProfile('alibaba-model-studio');
    if (alibaba.providerType !== 'alibaba-model-studio') throw new Error('profile mismatch');
    alibaba.config.protocolVariant = 'multimodal-generation-sync';

    const cases = [
      { profile: enabledProfile('openai-images'), expected: ['openai-image-edit', 16] },
      { profile: enabledProfile('xai-images'), expected: ['xai-image-edit', 1] },
      { profile: enabledProfile('gemini-image'), expected: ['gemini-multimodal', 3] },
      { profile: alibaba, expected: ['alibaba-multimodal', 3] },
      { profile: enabledProfile('novelai-image'), expected: ['novelai-img2img', 1] },
      { profile: enabledProfile('comfyui-workflow'), workflow: comfyWorkflow, expected: ['comfy-upload-workflow', 1] },
      { profile: enabledProfile('sd-webui'), expected: ['sd-webui-img2img', 1] }
    ] as const;

    for (const testCase of cases) {
      const capability = resolveReferenceImageCapability(testCase);
      expect(capability.supported).toBe(true);
      expect([capability.transport.kind, capability.maxImages]).toEqual(testCase.expected);
    }
  });

  it('rejects protocol variants whose edit contract is not frozen', () => {
    const openAiCompatible = enabledProfile('openai-images');
    if (openAiCompatible.providerType !== 'openai-images') throw new Error('profile mismatch');
    openAiCompatible.config.apiVariant = 'openai-compatible';

    const alibabaAsync = enabledProfile('alibaba-model-studio');
    if (alibabaAsync.providerType !== 'alibaba-model-studio') throw new Error('profile mismatch');
    alibabaAsync.config.protocolVariant = 'image-generation-async';
    const comfyWithoutBinding = enabledProfile('comfyui-workflow');

    expect(resolveReferenceImageCapability({ profile: openAiCompatible }).supported).toBe(false);
    expect(resolveReferenceImageCapability({ profile: alibabaAsync }).supported).toBe(false);
    expect(resolveReferenceImageCapability({ profile: comfyWithoutBinding }).supported).toBe(false);
  });
});

describe('reference image snapshot boundary', () => {
  const openAiCapability = resolveReferenceImageCapability({ profile: enabledProfile('openai-images') });

  it('freezes only player assets with provider-safe image formats', () => {
    expect(snapshotReferenceAssets([asset()], openAiCapability)).toEqual([{
      imageId: 'image-reference',
      mimeType: 'image/png',
      width: 640,
      height: 960,
      byteLength: 8,
      contentHash: 'a'.repeat(64)
    }]);
    expect(() => snapshotReferenceAssets([asset({ source: 'builtin' })], openAiCapability))
      .toThrow('游戏内置美术');
    expect(() => snapshotReferenceAssets([asset({ mimeType: 'image/gif' })], openAiCapability))
      .toThrow('格式不受当前传输层支持');
  });

  it('migrates old frozen requests to an explicit no-reference state and rejects inconsistent new snapshots', () => {
    const legacy = structuredClone(createDraft('intent-legacy')) as unknown as Record<string, unknown>;
    delete legacy.referenceImages;
    delete legacy.referenceImageTransport;
    expect(compiledImageRequestDraftSchema.parse(legacy)).toMatchObject({
      referenceImages: [],
      referenceImageTransport: { kind: 'none' }
    });

    const inconsistent = {
      ...createDraft('intent-inconsistent'),
      referenceImages: [{
        imageId: 'image-reference',
        mimeType: 'image/png',
        width: 640,
        height: 960,
        byteLength: 8,
        contentHash: 'a'.repeat(64)
      }],
      referenceImageTransport: { kind: 'none' }
    };
    expect(compiledImageRequestDraftSchema.safeParse(inconsistent).success).toBe(false);
  });

  it('accepts a real-size reference image instead of applying the dimension limit to bytes', () => {
    const draft = {
      ...createDraft('intent-real-size-reference'),
      referenceImages: [{
        imageId: 'image-reference',
        mimeType: 'image/png',
        width: 1216,
        height: 832,
        byteLength: 851_122,
        contentHash: 'a'.repeat(64)
      }],
      referenceImageTransport: { kind: 'comfy-upload-workflow', maxImages: 1 }
    };

    expect(compiledImageRequestDraftSchema.safeParse(draft).success).toBe(true);
  });
});
