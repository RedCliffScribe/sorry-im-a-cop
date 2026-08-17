import { describe, expect, it } from 'vitest';
import { imageGenerationVerificationRecordSchema } from './schemas';
import { IMAGE_PROVIDER_TYPES } from './types';

function createRecord() {
  return {
    verificationId: 'verification_1',
    scope: 'project-adapter' as const,
    profileId: 'profile_1',
    providerType: 'openai-images' as const,
    verdict: 'mock-passed' as const,
    adapterRevision: 'adapter-v1',
    executionFingerprint: 'execution_1',
    environment: 'test-runner' as const,
    startedAt: '2026-07-22T00:00:00.000Z',
    completedAt: '2026-07-22T00:00:01.000Z',
    durationMs: 1_000,
    completedStages: [
      'local-validation',
      'authentication',
      'submit',
      'download',
      'decode',
      'blob-persist'
    ] as const,
    providerRequestId: 'request-1',
    safeSummary: '模拟协议探针通过。',
    probeArtifactId: 'artifact_1'
  };
}

describe('image probe schemas', () => {
  it('freezes exactly the seven first-release provider identifiers', () => {
    expect(IMAGE_PROVIDER_TYPES).toEqual([
      'openai-images',
      'xai-images',
      'gemini-image',
      'alibaba-model-studio',
      'novelai-image',
      'comfyui-workflow',
      'sd-webui'
    ]);
  });

  it('accepts a project mock pass with a complete Blob evidence stage', () => {
    expect(imageGenerationVerificationRecordSchema.safeParse(createRecord()).success).toBe(true);
  });

  it('rejects mock-passed as runtime evidence', () => {
    const parsed = imageGenerationVerificationRecordSchema.safeParse({
      ...createRecord(),
      scope: 'runtime-profile'
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a real verdict produced by the test runner', () => {
    const parsed = imageGenerationVerificationRecordSchema.safeParse({
      ...createRecord(),
      verdict: 'real-passed'
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects passed evidence without the Blob persistence stage', () => {
    const parsed = imageGenerationVerificationRecordSchema.safeParse({
      ...createRecord(),
      completedStages: ['local-validation', 'authentication', 'submit', 'download', 'decode']
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects invalid elapsed time and oversized provider request identifiers', () => {
    expect(imageGenerationVerificationRecordSchema.safeParse({ ...createRecord(), durationMs: -1 }).success).toBe(false);
    expect(imageGenerationVerificationRecordSchema.safeParse({
      ...createRecord(),
      providerRequestId: 'x'.repeat(201)
    }).success).toBe(false);
  });
});
