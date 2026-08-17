import { describe, expect, it } from 'vitest';
import { createImageProbeEvidenceBundle, serializeImageProbeEvidenceBundle } from './evidenceExport';
import type { ImageGenerationVerificationRecord, ImageProbeArtifact } from './types';

function record(): ImageGenerationVerificationRecord {
  return {
    verificationId: 'verification-1',
    scope: 'runtime-profile',
    profileId: 'profile-1',
    providerType: 'openai-images',
    verdict: 'real-passed',
    adapterRevision: 'p1-r',
    connectionFingerprint: 'connection-fingerprint',
    executionFingerprint: 'execution-fingerprint',
    environment: 'local-browser',
    startedAt: '2026-07-23T00:00:00.000Z',
    completedAt: '2026-07-23T00:00:01.250Z',
    durationMs: 1_250,
    completedStages: ['local-validation', 'authentication', 'submit', 'download', 'decode', 'blob-persist'],
    providerRequestId: 'request?token=private-value',
    safeSummary: '通过 Authorization: Bearer should-not-export',
    networkFailure: undefined,
    probeArtifactId: 'artifact-1'
  };
}

function artifact(): ImageProbeArtifact {
  const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
  return {
    artifactId: 'artifact-1',
    verificationId: 'verification-1',
    profileId: 'profile-1',
    providerType: 'openai-images',
    executionFingerprint: 'execution-fingerprint',
    createdAt: '2026-07-23T00:00:01.250Z',
    mimeType: 'image/png',
    byteLength: blob.size,
    width: 1,
    height: 1,
    blob
  };
}

describe('image probe evidence export', () => {
  it('exports only strict, sanitized records and artifact metadata without image bytes', () => {
    const bundle = createImageProbeEvidenceBundle({
      profileId: 'profile-1',
      providerType: 'openai-images',
      records: [record()],
      latestArtifact: artifact(),
      exportedAt: '2026-07-23T01:00:00.000Z'
    });
    const serialized = serializeImageProbeEvidenceBundle(bundle);

    expect(bundle.records[0]).toMatchObject({ durationMs: 1_250, providerRequestId: 'request?token=[REDACTED]' });
    expect(serialized).toContain('execution-fingerprint');
    expect(serialized).toContain('image-probe-evidence-v1');
    expect(serialized).not.toContain('private-value');
    expect(serialized).not.toContain('should-not-export');
    expect(serialized).not.toContain('"blob"');
  });

  it('exports a structured network failure without full URLs or query secrets', () => {
    const failed: ImageGenerationVerificationRecord = {
      ...record(),
      verdict: 'real-failed',
      probeArtifactId: undefined,
      blockerOrFailureCode: 'provider-network-failed',
      safeSummary: '临时图片下载没有取得可读响应。',
      networkFailure: {
        requestRole: 'generated-image-download',
        method: 'GET',
        targetOrigin: 'https://cdn.example',
        pageOrigin: 'https://simc.pages.dev',
        crossOrigin: true,
        securePage: true,
        insecureTarget: false,
        localNetworkAccessExpected: false,
        corsPreflightExpected: false,
        responseReached: false,
        browserErrorName: 'TypeError',
        likelyCauses: ['cors-response', 'browser-network-dns-tls']
      }
    };
    const serialized = serializeImageProbeEvidenceBundle(createImageProbeEvidenceBundle({
      profileId: 'profile-1',
      providerType: 'openai-images',
      records: [failed]
    }));

    expect(serialized).toContain('generated-image-download');
    expect(serialized).toContain('https://cdn.example');
    expect(serialized).not.toContain('signature=');
    expect(serialized).not.toContain('Authorization');
  });

  it('rejects records and artifacts from another profile or provider', () => {
    expect(() => createImageProbeEvidenceBundle({
      profileId: 'profile-other',
      providerType: 'openai-images',
      records: [record()]
    })).toThrow('当前图片档案');
    expect(() => createImageProbeEvidenceBundle({
      profileId: 'profile-1',
      providerType: 'openai-images',
      records: [record()],
      latestArtifact: { ...artifact(), providerType: 'sd-webui' }
    })).toThrow('测试图片');
  });
});
