import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDbImageProbeStore } from './IndexedDbImageProbeStore';
import type { ImageGenerationVerificationRecord, ImageProbeArtifact, ImageProbeOutcome } from './types';

const DB_NAME = 'cop-v2-test-image-probes';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function iso(index: number): string {
  return `2026-07-22T00:00:${String(index).padStart(2, '0')}.000Z`;
}

function createSuccess(profileId: string, index: number): ImageProbeOutcome {
  const verificationId = `verification_${profileId}_${index}`;
  const artifactId = `artifact_${profileId}_${index}`;
  const executionFingerprint = `execution_${index}`;
  const blob = new Blob([new Uint8Array([index + 1])], { type: 'image/png' });
  const record: ImageGenerationVerificationRecord = {
    verificationId,
    scope: 'runtime-profile',
    profileId,
    providerType: 'openai-images',
    verdict: 'real-passed',
    adapterRevision: 'adapter-v1',
    executionFingerprint,
    environment: 'local-browser',
    startedAt: iso(index),
    completedAt: iso(index),
    durationMs: 1_250,
    completedStages: [
      'local-validation',
      'authentication',
      'submit',
      'download',
      'decode',
      'blob-persist'
    ],
    providerRequestId: `request_${index}`,
    safeSummary: '真实图片生成探针通过。',
    probeArtifactId: artifactId
  };
  const artifact: ImageProbeArtifact = {
    artifactId,
    verificationId,
    profileId,
    providerType: 'openai-images',
    executionFingerprint,
    createdAt: iso(index),
    mimeType: 'image/png',
    byteLength: blob.size,
    blob
  };
  return { record, artifact };
}

function createFailure(profileId: string, index: number): ImageProbeOutcome {
  return {
    record: {
      verificationId: `failure_${profileId}_${index}`,
      scope: 'runtime-profile',
      profileId,
      providerType: 'sd-webui',
      verdict: 'real-failed',
      adapterRevision: 'adapter-v1',
      executionFingerprint: `execution_${index}`,
      environment: 'local-browser',
      startedAt: iso(index),
      completedAt: iso(index),
      completedStages: ['local-validation', 'authentication', 'submit'],
      safeSummary: '供应商请求失败。',
      blockerOrFailureCode: 'probe-execution-failed'
    }
  };
}

beforeEach(async () => {
  await deleteDatabase(DB_NAME);
});

describe('IndexedDbImageProbeStore', () => {
  it('keeps probe records and blobs outside the save database with one current artifact per profile', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    await store.saveOutcome(createSuccess('profile_a', 1));
    await store.saveOutcome(createSuccess('profile_a', 2));

    const records = await store.listRecords('profile_a');
    const artifact = await store.getLatestArtifact('profile_a');

    expect(records).toHaveLength(2);
    expect(records[0].probeArtifactId).toBe('artifact_profile_a_2');
    expect(records[0]).toMatchObject({ durationMs: 1_250, providerRequestId: 'request_2' });
    expect(records[1].probeArtifactId).toBeUndefined();
    expect(artifact?.artifactId).toBe('artifact_profile_a_2');
    expect(artifact?.blob.size).toBe(1);
  });

  it('retains at most the latest twenty records per profile', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    for (let index = 0; index < 25; index += 1) await store.saveOutcome(createFailure('profile_a', index));

    const records = await store.listRecords('profile_a');

    expect(records).toHaveLength(20);
    expect(records[0].verificationId).toBe('failure_profile_a_24');
    expect(records.at(-1)?.verificationId).toBe('failure_profile_a_5');
  });

  it('clears one profile without changing another profile', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    await store.saveOutcome(createSuccess('profile_a', 1));
    await store.saveOutcome(createSuccess('profile_b', 1));

    await store.clearProfile('profile_a');

    expect(await store.listRecords('profile_a')).toEqual([]);
    expect(await store.getLatestArtifact('profile_a')).toBeNull();
    expect(await store.listRecords('profile_b')).toHaveLength(1);
    expect((await store.getLatestArtifact('profile_b'))?.artifactId).toBe('artifact_profile_b_1');
  });

  it('rejects mismatched record and artifact metadata', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    const outcome = createSuccess('profile_a', 1);
    if (!outcome.artifact) throw new Error('fixture requires an artifact');
    outcome.artifact.profileId = 'profile_b';

    await expect(store.saveOutcome(outcome)).rejects.toThrow('元数据不一致');
    expect(await store.listRecords('profile_a')).toEqual([]);
  });

  it('keeps verification records immutable', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    const outcome = createFailure('profile_a', 1);
    await store.saveOutcome(outcome);

    await expect(store.saveOutcome(outcome)).rejects.toThrow('不可覆盖');
    expect(await store.listRecords('profile_a')).toHaveLength(1);
  });

  it('clears all probe data without needing a save identifier', async () => {
    const store = new IndexedDbImageProbeStore(DB_NAME);
    await store.saveOutcome(createSuccess('profile_a', 1));
    await store.saveOutcome(createFailure('profile_b', 2));

    await store.clearAll();

    expect(await store.listRecords('profile_a')).toEqual([]);
    expect(await store.listRecords('profile_b')).toEqual([]);
    expect(await store.getLatestArtifact('profile_a')).toBeNull();
  });
});
