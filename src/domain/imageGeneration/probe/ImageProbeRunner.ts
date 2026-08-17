import {
  ImageProbeBlockedError,
  ImageProbeProtocolError,
  sanitizeImageProbeIdentifier,
  sanitizeImageProbeText,
  toSafeImageProbeMessage
} from './errors';
import type { ImageProbeStore } from './ImageProbeStore';
import type {
  ImageGenerationVerificationRecord,
  ImageGenerationVerificationVerdict,
  ImageProbeArtifact,
  ImageProbeFetch,
  ImageProbeRunInput,
  ImageProbeStage,
  ImageProbeWait
} from './types';

const REQUIRED_SUCCESS_STAGES: ImageProbeStage[] = [
  'local-validation',
  'authentication',
  'submit',
  'download',
  'decode'
];

export interface ImageProbeRunnerOptions {
  store: ImageProbeStore;
  fetch?: ImageProbeFetch;
  wait?: ImageProbeWait;
  now?: () => Date;
  createId?: () => string;
}

function defaultCreateId(): string {
  return crypto.randomUUID();
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.max(0, milliseconds));
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function validationMessage(issues: Array<{ path: string; message: string }>): string {
  return issues.map((issue) => `${issue.path || '配置'}：${issue.message}`).join('；');
}

export class ImageProbeRunner {
  private readonly store: ImageProbeStore;
  private readonly fetchImpl: ImageProbeFetch;
  private readonly wait: ImageProbeWait;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(options: ImageProbeRunnerOptions) {
    this.store = options.store;
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.wait = options.wait ?? defaultWait;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
  }

  async run(input: ImageProbeRunInput): Promise<ImageGenerationVerificationRecord> {
    const verificationId = this.createId();
    const started = this.now();
    const startedAt = started.toISOString();
    const completedStages: ImageProbeStage[] = [];
    let providerRequestId: string | undefined;
    const reportStage = (stage: ImageProbeStage) => {
      if (completedStages.includes(stage)) return;
      completedStages.push(stage);
      try {
        input.onStage?.(stage);
      } catch {
        // Progress observers are non-authoritative and must not break probe evidence.
      }
    };

    const persistFailure = async (
      verdict: Extract<ImageGenerationVerificationVerdict, 'blocked-unverified' | 'real-failed'>,
      safeSummary: string,
      blockerOrFailureCode: string,
      networkFailure?: ImageGenerationVerificationRecord['networkFailure']
    ): Promise<ImageGenerationVerificationRecord> => {
      const completed = this.now();
      const record: ImageGenerationVerificationRecord = {
        verificationId,
        scope: input.scope,
        profileId: input.profileId,
        providerType: input.adapter.providerType,
        verdict,
        adapterRevision: input.adapterRevision,
        connectionFingerprint: input.connectionFingerprint,
        executionFingerprint: input.executionFingerprint,
        environment: input.environment,
        startedAt,
        completedAt: completed.toISOString(),
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        completedStages: [...completedStages],
        providerRequestId,
        safeSummary: sanitizeImageProbeText(safeSummary),
        blockerOrFailureCode,
        networkFailure
      };
      await this.store.saveOutcome({ record });
      return record;
    };

    try {
      const validation = await input.adapter.validate({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        profile: input.profile,
        credential: input.credential
      });
      reportStage('local-validation');
      if (!validation.ok) {
        return persistFailure('blocked-unverified', validationMessage(validation.issues), 'local-validation-failed');
      }

      const generatedBatch = await input.adapter.generate(
        {
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          profile: input.profile,
          credential: input.credential
        },
        {
          signal: input.signal ?? new AbortController().signal,
          fetch: this.fetchImpl,
          wait: this.wait,
          reportStage,
          reportRemoteTask: (remoteTaskId) => {
            providerRequestId = sanitizeImageProbeIdentifier(remoteTaskId) ?? providerRequestId;
          }
        }
      );
      providerRequestId = sanitizeImageProbeIdentifier(generatedBatch.providerRequestId ?? '') ?? providerRequestId;

      if (generatedBatch.images.length === 0) throw new Error('图片探针没有返回图片。');
      for (const generated of generatedBatch.images) {
        if (!generated.mimeType.toLowerCase().startsWith('image/')) {
          throw new Error('图片探针返回了非图片 MIME 类型。');
        }
        if (generated.bytes.byteLength === 0) throw new Error('图片探针返回了空图片。');
      }
      const missingStage = REQUIRED_SUCCESS_STAGES.find((stage) => !completedStages.includes(stage));
      if (missingStage) throw new Error(`图片探针证据链缺少阶段：${missingStage}`);

      const artifactId = this.createId();
      const completed = this.now();
      const completedAt = completed.toISOString();
      const generated = generatedBatch.images[0];
      const blob = new Blob([generated.bytes], { type: generated.mimeType });
      const successStages = [...completedStages, 'blob-persist' as const];
      const verdict: ImageGenerationVerificationVerdict =
        input.environment === 'test-runner' ? 'mock-passed' : 'real-passed';
      const artifact: ImageProbeArtifact = {
        artifactId,
        verificationId,
        profileId: input.profileId,
        providerType: input.adapter.providerType,
        executionFingerprint: input.executionFingerprint,
        createdAt: completedAt,
        mimeType: blob.type,
        byteLength: blob.size,
        width: generated.width,
        height: generated.height,
        blob
      };
      const record: ImageGenerationVerificationRecord = {
        verificationId,
        scope: input.scope,
        profileId: input.profileId,
        providerType: input.adapter.providerType,
        verdict,
        adapterRevision: input.adapterRevision,
        connectionFingerprint: input.connectionFingerprint,
        executionFingerprint: input.executionFingerprint,
        environment: input.environment,
        startedAt,
        completedAt,
        durationMs: Math.max(0, completed.getTime() - started.getTime()),
        completedStages: successStages,
        providerRequestId,
        safeSummary: verdict === 'mock-passed' ? '模拟协议探针通过。' : '真实图片生成探针通过。',
        probeArtifactId: artifactId
      };
      await this.store.saveOutcome({ record, artifact });
      reportStage('blob-persist');
      return record;
    } catch (error) {
      const blocked = error instanceof ImageProbeBlockedError;
      const protocolError = error instanceof ImageProbeProtocolError;
      const cancelled = input.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
      const reachedSubmit = completedStages.includes('submit');
      const verdict =
        input.environment === 'test-runner' || blocked || cancelled || !reachedSubmit
          ? 'blocked-unverified'
          : 'real-failed';
      const code = blocked
        ? error.code
        : protocolError
          ? error.code
          : cancelled
            ? 'probe-cancelled'
            : input.environment === 'test-runner'
              ? 'mock-contract-failed'
              : reachedSubmit
                ? 'probe-execution-failed'
                : 'pre-submit-failed';
      return persistFailure(
        verdict,
        toSafeImageProbeMessage(error),
        code,
        protocolError ? error.networkFailure : undefined
      );
    }
  }
}
