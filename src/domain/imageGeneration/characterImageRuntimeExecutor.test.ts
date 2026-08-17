import { describe, expect, it, vi } from 'vitest';
import { CharacterImageRuntimeExecutor } from './characterImageRuntimeExecutor';
import { createBuiltInCharacterDraftExecutionConfig } from './characterVisualWorkflow';
import { createDefaultImageApiProfile, type ImageApiCredential, type ImageApiProfile } from './profile';
import {
  createImageGenerationTask,
  prepareTaskDraft,
  startTaskAttempt,
  submitTask,
  type ImageGenerationTask
} from './visualRepository';
import { createCharacterIntent, TEST_PNG_BYTES } from './visualRepository/testFixtures';
import { createImageGenerationPreset } from './generationPresets';

const now = '2026-07-23T02:00:00.000Z';

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createSubmittingTask(submissionMode: 'manual' | 'automatic', usePlayerPreset = false): Promise<{
  task: ImageGenerationTask;
  profile: ImageApiProfile;
  credential: ImageApiCredential;
}> {
  const profile = {
    ...createDefaultImageApiProfile('openai-images', 'profile_openai', now),
    enabled: true,
    credentialId: 'credential_openai',
    models: [{ modelId: 'gpt-image-test', source: 'manual' as const }],
    defaultModelId: 'gpt-image-test'
  } as ImageApiProfile;
  const credential: ImageApiCredential = {
    credentialId: 'credential_openai',
    label: 'test',
    providerAffinity: 'openai-images',
    material: { kind: 'bearer-token', token: 'safe-test-token-123456' },
    revision: 1,
    createdAt: now,
    updatedAt: now
  };
  const preset = usePlayerPreset ? createImageGenerationPreset({
    name: '玩家半身像预设',
    profileId: profile.profileId,
    providerType: profile.providerType,
    variantKey: 'half-body-medium',
    routingTarget: { kind: 'model', modelId: 'gpt-image-test' },
    targetAspectRatio: '4:3',
    generationParameters: {
      providerType: 'openai-images', requestedImageCount: 1,
      size: { mode: 'dimensions', width: 1536, height: 1024 },
      quality: 'high', outputFormat: 'webp', outputCompression: 80, background: 'opaque'
    },
    now
  }) : undefined;
  const config = await createBuiltInCharacterDraftExecutionConfig({
    profile,
    purpose: 'half-body-medium',
    credential: { credentialId: credential.credentialId, revision: credential.revision },
    preset
  });
  const intent = createCharacterIntent('half-body-medium', submissionMode);
  let task = createImageGenerationTask({
    taskId: `task_${submissionMode}`,
    saveId: intent.saveId,
    source: submissionMode === 'manual' ? 'manual' : 'automatic',
    submissionMode,
    intent,
    createdAt: now
  });
  const draft = {
    ...config,
    intentId: intent.intentId,
    positivePrompt: 'portrait prompt',
    negativePrompt: 'blurry',
    sourceAnchorHashes: ['a'.repeat(64)],
    compiledAt: now
  };
  task = prepareTaskDraft(task, draft, now);
  task = submitTask(task, {
    ...draft,
    requestFingerprint: 'b'.repeat(64),
    submittedAt: now,
    userEdited: false
  }, now);
  return { task: startTaskAttempt(task, now), profile, credential };
}

function dependencies(profile: ImageApiProfile, credential: ImageApiCredential, records: never[] = []) {
  return {
    profiles: {
      getProfile: vi.fn().mockResolvedValue(profile),
      getWorkflowTemplate: vi.fn().mockResolvedValue(null)
    } as never,
    credentials: { resolveCredential: vi.fn().mockResolvedValue(credential) } as never,
    verificationStore: { listRecords: vi.fn().mockResolvedValue(records) } as never,
    visualRepository: {
      loadSnapshot: vi.fn().mockResolvedValue({ assets: {} }),
      getBlob: vi.fn()
    } as never
  };
}

describe('CharacterImageRuntimeExecutor', () => {
  it('executes a frozen manual request without requiring automatic-mode evidence', async () => {
    const { task, profile, credential } = await createSubmittingTask('manual');
    const base64 = btoa(String.fromCharCode(...TEST_PNG_BYTES));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const executor = new CharacterImageRuntimeExecutor({
      ...dependencies(profile, credential),
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/',
      decodeDimensions: vi.fn().mockResolvedValue({ width: 1024, height: 1536 })
    });
    const stages: string[] = [];
    const outputs = await executor.generate(task, { onStage: (stage) => stages.push(stage) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).toMatchObject({ width: 1024, height: 1536 });
    expect(stages).toEqual(expect.arrayContaining(['authentication', 'submit', 'download', 'decode']));
  });

  it('executes a frozen player preset using its typed aspect and generation parameters', async () => {
    const { task, profile, credential } = await createSubmittingTask('manual', true);
    const base64 = btoa(String.fromCharCode(...TEST_PNG_BYTES));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const executor = new CharacterImageRuntimeExecutor({
      ...dependencies(profile, credential),
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/',
      decodeDimensions: vi.fn().mockResolvedValue({ width: 1536, height: 1024 })
    });

    await expect(executor.generate(task)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"size":"1536x1024"')
    }));
  });

  it('hard-locks automatic execution when matching real-passed evidence is absent', async () => {
    const { task, profile, credential } = await createSubmittingTask('automatic');
    const fetchMock = vi.fn();
    const executor = new CharacterImageRuntimeExecutor({
      ...dependencies(profile, credential),
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/'
    });

    await expect(executor.generate(task)).rejects.toMatchObject({ code: 'automatic-generation-unverified' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and hashes an explicitly selected reference before using the OpenAI edit transport', async () => {
    const { task, profile, credential } = await createSubmittingTask('manual');
    const contentHash = await sha256(TEST_PNG_BYTES);
    const reference = {
      imageId: 'image_reference',
      mimeType: 'image/png' as const,
      width: 640,
      height: 960,
      byteLength: TEST_PNG_BYTES.byteLength,
      contentHash
    };
    task.intent.referenceImageIds = ['image_reference'];
    task.submittedRequest!.referenceImages = [reference];
    task.submittedRequest!.referenceImageTransport = { kind: 'openai-image-edit', maxImages: 16 };
    const base64 = btoa(String.fromCharCode(...TEST_PNG_BYTES));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: base64 }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    const executor = new CharacterImageRuntimeExecutor({
      ...dependencies(profile, credential),
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/',
      decodeDimensions: vi.fn().mockResolvedValue({ width: 1024, height: 1536 }),
      visualRepository: {
        loadSnapshot: vi.fn().mockResolvedValue({
          assets: {
            image_reference: {
              ...reference,
              scope: 'save',
              saveId: 'save_a',
              source: 'generated',
              blobKey: 'blob_reference',
              createdAt: now
            }
          }
        }),
        getBlob: vi.fn().mockResolvedValue(new Blob([TEST_PNG_BYTES], { type: 'image/png' }))
      } as never
    });

    await expect(executor.generate(task)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/images/edits');
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).getAll('image[]')).toHaveLength(1);
  });

  it('refuses a frozen task after the profile revision changes its execution fingerprint', async () => {
    const { task, profile, credential } = await createSubmittingTask('manual');
    const changed = { ...profile, apiBaseUrl: 'https://proxy.example.test/v1', revision: profile.revision + 1 } as ImageApiProfile;
    const fetchMock = vi.fn();
    const executor = new CharacterImageRuntimeExecutor({
      ...dependencies(changed, credential),
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/'
    });

    await expect(executor.generate(task)).rejects.toMatchObject({ code: 'execution-profile-changed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
