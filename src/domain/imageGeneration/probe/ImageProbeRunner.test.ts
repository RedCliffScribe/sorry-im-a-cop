import { describe, expect, it } from 'vitest';
import type { ImageProbeStore } from './ImageProbeStore';
import { ImageProbeBlockedError, ImageProbeProtocolError } from './errors';
import { ImageProbeRunner } from './ImageProbeRunner';
import type {
  ImageApiProfileId,
  ImageGenerationProbeAdapter,
  ImageGenerationVerificationRecord,
  ImageProbeArtifact,
  ImageProbeOutcome,
  ImageProbeRunInput
} from './types';

class MemoryImageProbeStore implements ImageProbeStore {
  outcomes: ImageProbeOutcome[] = [];

  async saveOutcome(outcome: ImageProbeOutcome): Promise<void> {
    this.outcomes.push(outcome);
  }

  async listRecords(profileId: ImageApiProfileId): Promise<ImageGenerationVerificationRecord[]> {
    return this.outcomes.map((outcome) => outcome.record).filter((record) => record.profileId === profileId);
  }

  async getLatestArtifact(profileId: ImageApiProfileId): Promise<ImageProbeArtifact | null> {
    return [...this.outcomes]
      .reverse()
      .find((outcome) => outcome.artifact?.profileId === profileId)?.artifact ?? null;
  }

  async clearProfile(profileId: ImageApiProfileId): Promise<void> {
    this.outcomes = this.outcomes.filter((outcome) => outcome.record.profileId !== profileId);
  }

  async clearAll(): Promise<void> {
    this.outcomes = [];
  }
}

function createPassingAdapter(): ImageGenerationProbeAdapter {
  return {
    providerType: 'openai-images',
    validate: () => ({ ok: true }),
    generate: async (_input, context) => {
      context.reportStage('authentication');
      context.reportStage('submit');
      context.reportStage('download');
      context.reportStage('decode');
      return {
        providerRequestId: 'request-safe-1',
        images: [{
          bytes: new Uint8Array([137, 80, 78, 71]).buffer,
          mimeType: 'image/png',
          width: 1,
          height: 1
        }]
      };
    }
  };
}

function createInput(adapter: ImageGenerationProbeAdapter): ImageProbeRunInput {
  return {
    adapter,
    scope: 'project-adapter',
    profileId: 'profile_1',
    environment: 'test-runner',
    adapterRevision: 'adapter-v1',
    connectionFingerprint: 'connection_1',
    executionFingerprint: 'execution_1',
    prompt: 'a neutral test image',
    profile: { apiBaseUrl: 'https://example.test/v1' },
    credential: { apiKey: 'never-persist-this' }
  };
}

function createRunner(store: MemoryImageProbeStore): ImageProbeRunner {
  const ids = ['verification_1', 'artifact_1'];
  return new ImageProbeRunner({
    store,
    createId: () => ids.shift() ?? 'unexpected_id',
    now: () => new Date('2026-07-22T00:00:00.000Z'),
    fetch: async () => new Response()
  });
}

describe('ImageProbeRunner', () => {
  it('persists mock evidence and a test artifact without persisting profile credentials', async () => {
    const store = new MemoryImageProbeStore();
    const observedStages: string[] = [];
    const record = await createRunner(store).run({
      ...createInput(createPassingAdapter()),
      onStage: (stage) => observedStages.push(stage)
    });

    expect(record.verdict).toBe('mock-passed');
    expect(record.completedStages).toEqual([
      'local-validation',
      'authentication',
      'submit',
      'download',
      'decode',
      'blob-persist'
    ]);
    expect(observedStages).toEqual(record.completedStages);
    expect(record.providerRequestId).toBe('request-safe-1');
    expect(record.durationMs).toBe(0);
    expect(store.outcomes[0].artifact?.blob).toBeInstanceOf(Blob);
    expect(JSON.stringify(store.outcomes[0].record)).not.toContain('never-persist-this');
    expect(JSON.stringify(store.outcomes[0].record)).not.toContain('apiBaseUrl');
  });

  it('creates real-passed only for a real browser environment', async () => {
    const store = new MemoryImageProbeStore();
    const input = {
      ...createInput(createPassingAdapter()),
      scope: 'runtime-profile' as const,
      environment: 'pages-browser' as const
    };

    expect((await createRunner(store).run(input)).verdict).toBe('real-passed');
  });

  it('persists a reported remote task id and elapsed time when a submitted runtime probe fails', async () => {
    const store = new MemoryImageProbeStore();
    const times = [
      new Date('2026-07-22T00:00:00.000Z'),
      new Date('2026-07-22T00:00:02.500Z')
    ];
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'comfyui-workflow',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        await context.reportRemoteTask?.('prompt-safe-42');
        throw new Error('任务提交后失败。');
      }
    };
    const runner = new ImageProbeRunner({
      store,
      createId: () => 'verification_failure',
      now: () => times.shift() ?? new Date('2026-07-22T00:00:02.500Z'),
      fetch: async () => new Response()
    });

    const record = await runner.run({
      ...createInput(adapter),
      scope: 'runtime-profile',
      environment: 'local-browser'
    });

    expect(record.verdict).toBe('real-failed');
    expect(record.providerRequestId).toBe('prompt-safe-42');
    expect(record.durationMs).toBe(2_500);
    expect(record.completedStages).toEqual(['local-validation', 'authentication', 'submit']);
  });

  it('records local validation failure as blocked-unverified without invoking generation', async () => {
    const store = new MemoryImageProbeStore();
    let generated = false;
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'novelai-image',
      validate: () => ({ ok: false, issues: [{ path: 'credential', message: '缺少凭据' }] }),
      generate: async () => {
        generated = true;
        throw new Error('should not run');
      }
    };

    const record = await createRunner(store).run(createInput(adapter));

    expect(generated).toBe(false);
    expect(record.verdict).toBe('blocked-unverified');
    expect(record.blockerOrFailureCode).toBe('local-validation-failed');
    expect(record.completedStages).toEqual(['local-validation']);
  });

  it('keeps mock adapter failures distinct from real provider failures', async () => {
    const store = new MemoryImageProbeStore();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'gemini-image',
      validate: () => ({ ok: true }),
      generate: async () => {
        throw new Error('Authorization: Bearer secret-token-value');
      }
    };

    const record = await createRunner(store).run(createInput(adapter));

    expect(record.verdict).toBe('blocked-unverified');
    expect(record.blockerOrFailureCode).toBe('mock-contract-failed');
    expect(record.safeSummary).not.toContain('secret-token-value');
  });

  it('passes the negative prompt through validation and generation', async () => {
    const store = new MemoryImageProbeStore();
    const received: Array<string | undefined> = [];
    const adapter = createPassingAdapter();
    adapter.validate = (input) => {
      received.push(input.negativePrompt);
      return { ok: true };
    };
    const originalGenerate = adapter.generate;
    adapter.generate = (input, context) => {
      received.push(input.negativePrompt);
      return originalGenerate(input, context);
    };

    await createRunner(store).run({ ...createInput(adapter), negativePrompt: 'blur' });

    expect(received).toEqual(['blur', 'blur']);
  });

  it('keeps a provider protocol failure code and validates every returned image', async () => {
    const store = new MemoryImageProbeStore();
    const protocolAdapter: ImageGenerationProbeAdapter = {
      providerType: 'openai-images',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        throw new ImageProbeProtocolError('provider-no-image', 'no-image', '没有图片');
      }
    };
    const protocolRecord = await createRunner(store).run(createInput(protocolAdapter));
    expect(protocolRecord.blockerOrFailureCode).toBe('provider-no-image');

    const invalidBatch: ImageGenerationProbeAdapter = {
      providerType: 'openai-images',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        context.reportStage('download');
        context.reportStage('decode');
        return {
          images: [
            { bytes: new Uint8Array([137, 80, 78, 71]).buffer, mimeType: 'image/png' },
            { bytes: new Uint8Array().buffer, mimeType: 'image/png' }
          ]
        };
      }
    };
    const invalidRecord = await createRunner(store).run(createInput(invalidBatch));
    expect(invalidRecord.verdict).toBe('blocked-unverified');
    expect(invalidRecord.safeSummary).toContain('空图片');
  });

  it('persists a structured browser network diagnostic without secrets', async () => {
    const store = new MemoryImageProbeStore();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'openai-images',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        throw new ImageProbeProtocolError(
          'provider-network-failed',
          'http',
          '图片生成接口未取得浏览器可读取的 HTTP 响应：Failed to fetch',
          undefined,
          {
            requestRole: 'generation-submit',
            method: 'POST',
            targetOrigin: 'https://images.example',
            pageOrigin: 'https://simc.pages.dev',
            crossOrigin: true,
            securePage: true,
            insecureTarget: false,
            localNetworkAccessExpected: false,
            corsPreflightExpected: true,
            responseReached: false,
            browserErrorName: 'TypeError',
            likelyCauses: ['cors-preflight-or-response', 'browser-network-dns-tls']
          }
        );
      }
    };

    const record = await createRunner(store).run({
      ...createInput(adapter),
      scope: 'runtime-profile',
      environment: 'pages-browser'
    });

    expect(record.verdict).toBe('real-failed');
    expect(record.blockerOrFailureCode).toBe('provider-network-failed');
    expect(record.networkFailure).toMatchObject({
      requestRole: 'generation-submit',
      targetOrigin: 'https://images.example',
      responseReached: false
    });
    expect(JSON.stringify(record)).not.toContain('Authorization');
  });

  it('records a blocked runtime condition without claiming a provider failure', async () => {
    const store = new MemoryImageProbeStore();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'comfyui-workflow',
      validate: () => ({ ok: true }),
      generate: async () => {
        throw new ImageProbeBlockedError('browser-cors-blocked', '浏览器不允许访问当前地址。');
      }
    };
    const input = {
      ...createInput(adapter),
      scope: 'runtime-profile' as const,
      environment: 'pages-browser' as const
    };

    const record = await createRunner(store).run(input);

    expect(record.verdict).toBe('blocked-unverified');
    expect(record.blockerOrFailureCode).toBe('browser-cors-blocked');
  });

  it('does not call a pre-submit runtime exception a real provider failure', async () => {
    const store = new MemoryImageProbeStore();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'xai-images',
      validate: () => ({ ok: true }),
      generate: async () => {
        throw new Error('无法构造请求。');
      }
    };
    const input = {
      ...createInput(adapter),
      scope: 'runtime-profile' as const,
      environment: 'pages-browser' as const
    };

    const record = await createRunner(store).run(input);

    expect(record.verdict).toBe('blocked-unverified');
    expect(record.blockerOrFailureCode).toBe('pre-submit-failed');
  });

  it('records cancellation as blocked instead of a real provider failure', async () => {
    const store = new MemoryImageProbeStore();
    const controller = new AbortController();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'alibaba-model-studio',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      }
    };
    const input = {
      ...createInput(adapter),
      scope: 'runtime-profile' as const,
      environment: 'pages-browser' as const,
      signal: controller.signal
    };

    const record = await createRunner(store).run(input);

    expect(record.verdict).toBe('blocked-unverified');
    expect(record.blockerOrFailureCode).toBe('probe-cancelled');
  });

  it('refuses to pass when the adapter omits an evidence stage', async () => {
    const store = new MemoryImageProbeStore();
    const adapter: ImageGenerationProbeAdapter = {
      providerType: 'sd-webui',
      validate: () => ({ ok: true }),
      generate: async (_input, context) => {
        context.reportStage('authentication');
        context.reportStage('submit');
        context.reportStage('decode');
        return { images: [{ bytes: new Uint8Array([1]).buffer, mimeType: 'image/png' }] };
      }
    };

    const record = await createRunner(store).run(createInput(adapter));

    expect(record.verdict).toBe('blocked-unverified');
    expect(record.safeSummary).toContain('download');
  });
});
