import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IMAGE_PROVIDER_TYPES, type ImageGenerationVerificationRecord } from '../probe';
import { createDefaultImageApiProfile } from './defaults';
import {
  createComfyWorkflowHash,
  createConnectionFingerprint,
  createConnectionFingerprintInput,
  createExecutionFingerprint
} from './fingerprints';
import { comfyWorkflowTemplateSchema, imageApiProfileSchema } from './schemas';
import { hasMatchingRuntimeGenerationEvidence, type ImageApiCredentialSummary } from './types';

const NOW = '2026-07-23T00:00:00.000Z';

describe('image API profile contracts and fingerprints', () => {
  it('creates seven strict defaults without embedding credential material', () => {
    const profiles = IMAGE_PROVIDER_TYPES.map((providerType, index) =>
      createDefaultImageApiProfile(providerType, `profile-${index}`, NOW)
    );

    expect(profiles.map((profile) => profile.providerType)).toEqual(IMAGE_PROVIDER_TYPES);
    profiles.forEach((profile) => {
      expect(imageApiProfileSchema.parse(profile)).toEqual(profile);
      expect(JSON.stringify(profile)).not.toMatch(/apiKey|password|bearer-token|token/);
    });
  });

  it('rejects arbitrary provider fields, unknown default models, and incomplete workspace addressing', () => {
    const openAi = createDefaultImageApiProfile('openai-images', 'openai', NOW);
    expect(imageApiProfileSchema.safeParse({
      ...openAi,
      config: { ...openAi.config, arbitraryJson: { header: 'secret' } }
    }).success).toBe(false);
    expect(imageApiProfileSchema.safeParse({ ...openAi, defaultModelId: 'missing' }).success).toBe(false);

    const alibaba = createDefaultImageApiProfile('alibaba-model-studio', 'alibaba', NOW);
    expect(imageApiProfileSchema.safeParse({
      ...alibaba,
      config: { ...alibaba.config, endpointMode: 'workspace-domain', workspaceId: undefined }
    }).success).toBe(false);
  });

  it('keeps display-only changes out of connection fingerprints and invalidates on credential revision', async () => {
    const profile = createDefaultImageApiProfile('gemini-image', 'gemini', NOW);
    profile.credentialId = 'credential-gemini';
    const credential: ImageApiCredentialSummary = {
      credentialId: 'credential-gemini',
      label: 'Gemini Key',
      providerAffinity: 'gemini-image',
      materialKind: 'api-key-header',
      maskedHint: '••••test',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW
    };
    const original = await createConnectionFingerprint(profile, credential);
    const displayOnly = await createConnectionFingerprint(
      { ...profile, name: '重命名', enabled: true, revision: 9, updatedAt: '2026-07-23T01:00:00.000Z' },
      credential
    );
    const rotated = await createConnectionFingerprint(profile, { ...credential, revision: 2 });

    expect(displayOnly).toBe(original);
    expect(rotated).not.toBe(original);
    expect(JSON.stringify(createConnectionFingerprintInput(profile, credential))).not.toContain('••••test');
  });

  it('separates execution targets and workflow hashes from connection identity', async () => {
    const connectionFingerprint = 'connection';
    const first = await createExecutionFingerprint({ connectionFingerprint, modelId: 'model-a', presetRevision: 1 });
    const second = await createExecutionFingerprint({ connectionFingerprint, modelId: 'model-b', presetRevision: 1 });
    const workflowHash = await createComfyWorkflowHash({
      apiWorkflow: { '1': { class_type: 'Text', inputs: { text: '' } } },
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      outputNodeIds: ['1']
    });
    const comfy = await createExecutionFingerprint({ connectionFingerprint, presetRevision: 1, workflowHash });

    expect(first).not.toBe(second);
    expect(comfy).not.toBe(first);
    expect(workflowHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('validates typed player-exposed ComfyUI inputs and includes them in workflow identity', async () => {
    const base = {
      workflowTemplateId: 'workflow',
      name: '可调工作流',
      apiWorkflow: {
        '1': { class_type: 'Text', inputs: { text: '' } },
        '2': { class_type: 'KSampler', inputs: { denoise: 0.55, mode: 'balanced' } }
      },
      workflowHash: 'a'.repeat(64),
      bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
      exposedParameters: [{
        key: 'denoise',
        label: '重绘幅度',
        binding: { nodeId: '2', inputName: 'denoise' },
        valueType: 'number',
        min: 0,
        max: 1,
        step: 0.01
      }],
      outputNodeIds: ['2'],
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW
    } as const;
    expect(comfyWorkflowTemplateSchema.safeParse(base).success).toBe(true);
    expect(comfyWorkflowTemplateSchema.safeParse({
      ...base,
      exposedParameters: [{ ...base.exposedParameters[0], binding: base.bindings.positivePrompt }]
    }).success).toBe(false);
    expect(comfyWorkflowTemplateSchema.safeParse({
      ...base,
      exposedParameters: [{ ...base.exposedParameters[0], valueType: 'boolean' }]
    }).success).toBe(false);

    const withoutParameter = await createComfyWorkflowHash({
      apiWorkflow: base.apiWorkflow,
      bindings: base.bindings,
      outputNodeIds: base.outputNodeIds.slice()
    });
    const withParameter = await createComfyWorkflowHash({
      apiWorkflow: base.apiWorkflow,
      bindings: base.bindings,
      exposedParameters: base.exposedParameters.slice(),
      outputNodeIds: base.outputNodeIds.slice()
    });
    expect(withParameter).not.toBe(withoutParameter);
  });

  it('invalidates execution identity when a preset or its critical parameters change', async () => {
    const base = {
      connectionFingerprint: 'connection',
      modelId: 'model-a',
      presetId: 'character-half-body',
      presetRevision: 1,
      executionParameters: { width: 768, height: 1024 }
    };
    const original = await createExecutionFingerprint(base);
    const differentPurpose = await createExecutionFingerprint({ ...base, presetId: 'character-full-body' });
    const differentSize = await createExecutionFingerprint({
      ...base,
      executionParameters: { width: 576, height: 1024 }
    });

    expect(differentPurpose).not.toBe(original);
    expect(differentSize).not.toBe(original);
  });

  it('unlocks automation only for a matching runtime real-passed record', () => {
    const base: ImageGenerationVerificationRecord = {
      verificationId: 'verification',
      scope: 'runtime-profile',
      profileId: 'profile',
      providerType: 'openai-images',
      verdict: 'real-passed',
      adapterRevision: 'p1-a',
      executionFingerprint: 'execution-current',
      environment: 'pages-browser',
      startedAt: NOW,
      completedAt: NOW,
      completedStages: ['local-validation', 'authentication', 'submit', 'download', 'decode', 'blob-persist'],
      safeSummary: '真实图片生成探针通过。'
    };

    expect(hasMatchingRuntimeGenerationEvidence([base], 'profile', 'execution-current')).toBe(true);
    expect(hasMatchingRuntimeGenerationEvidence([{ ...base, verdict: 'mock-passed' }], 'profile', 'execution-current')).toBe(false);
    expect(hasMatchingRuntimeGenerationEvidence([{ ...base, scope: 'project-adapter' }], 'profile', 'execution-current')).toBe(false);
    expect(hasMatchingRuntimeGenerationEvidence([base], 'profile', 'execution-old')).toBe(false);
  });
});
