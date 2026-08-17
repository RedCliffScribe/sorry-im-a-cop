import type { ImageProbeFetch, ImageProbeStage, ImageProbeStore } from './probe';
import { ImageProbeProtocolError, toSafeImageProbeMessage } from './probe';
import {
  createExecutionFingerprint,
  hasMatchingRuntimeGenerationEvidence,
  prepareImageGenerationProbe,
  type ImageCredentialRepository,
  type ImageProfileRepository
} from './profile';
import type {
  CharacterImageExecutionContext,
  CharacterImageExecutionOutput,
  CharacterImageExecutor
} from './characterVisualWorkflow';
import { CHARACTER_VISUAL_EXECUTION_TARGETS } from './characterVisualWorkflow';
import { SCENE_VISUAL_EXECUTION_TARGET } from './sceneVisualWorkflow';
import { createImageGenerationProbeTarget } from './generationTarget';
import { resolveActualTransportPrompts } from './promptConversion';
import {
  assertReferenceTransportMatches,
  resolveReferenceImageCapability
} from './referenceImageTransport';
import type {
  ImageGenerationTask,
  ReferenceImageSnapshot,
  VisualRepository
} from './visualRepository';

export class CharacterImageExecutionConfigurationError extends Error {
  readonly code: string;
  readonly retriable: boolean;

  constructor(code: string, message: string, retriable = false) {
    super(message);
    this.name = 'CharacterImageExecutionConfigurationError';
    this.code = code;
    this.retriable = retriable;
  }
}

export interface CharacterImageRuntimeExecutorOptions {
  profiles: ImageProfileRepository;
  credentials: ImageCredentialRepository;
  verificationStore: ImageProbeStore;
  visualRepository: Pick<VisualRepository, 'loadSnapshot' | 'getBlob'>;
  fetch?: ImageProbeFetch;
  pageUrl?: () => string | undefined;
  decodeDimensions?: (blob: Blob) => Promise<{ width: number; height: number }>;
}

async function sha256Bytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadReferenceImages(
  repository: Pick<VisualRepository, 'loadSnapshot' | 'getBlob'>,
  task: ImageGenerationTask,
  references: readonly ReferenceImageSnapshot[]
) {
  const intentIds = task.intent.referenceImageIds;
  if (
    intentIds.length !== references.length ||
    intentIds.some((imageId, index) => references[index]?.imageId !== imageId)
  ) {
    throw new CharacterImageExecutionConfigurationError(
      'reference-image-snapshot-mismatch',
      '参考图意图与冻结提交快照不一致，请重新预览。'
    );
  }
  if (!references.length) return [];
  const snapshot = await repository.loadSnapshot(task.saveId);
  return Promise.all(references.map(async (reference) => {
    const asset = snapshot.assets[reference.imageId];
    if (!asset || (asset.scope === 'save' && asset.saveId !== task.saveId)) {
      throw new CharacterImageExecutionConfigurationError(
        'reference-image-missing',
        `参考图 ${reference.imageId} 已不存在于当前存档，请重新选择。`
      );
    }
    if (asset.source === 'builtin') {
      throw new CharacterImageExecutionConfigurationError(
        'builtin-art-reference-forbidden',
        '游戏内置美术不能作为文生图参考图发送。'
      );
    }
    if (
      asset.mimeType !== reference.mimeType ||
      asset.width !== reference.width ||
      asset.height !== reference.height ||
      asset.byteLength !== reference.byteLength ||
      asset.contentHash !== reference.contentHash
    ) {
      throw new CharacterImageExecutionConfigurationError(
        'reference-image-metadata-changed',
        `参考图 ${reference.imageId} 的元数据已变化，请重新预览。`
      );
    }
    const blob = await repository.getBlob(asset.blobKey);
    if (!blob) {
      throw new CharacterImageExecutionConfigurationError(
        'reference-image-blob-missing',
        `参考图 ${reference.imageId} 的本地文件缺失，请先修复视觉仓库存储。`
      );
    }
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength !== reference.byteLength || await sha256Bytes(bytes) !== reference.contentHash) {
      throw new CharacterImageExecutionConfigurationError(
        'reference-image-content-changed',
        `参考图 ${reference.imageId} 未通过内容哈希校验，请重新选择。`
      );
    }
    return { ...reference, bytes };
  }));
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

async function browserImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== 'function') {
    throw new CharacterImageExecutionConfigurationError('image-decode-unavailable', '当前浏览器无法读取供应商图片的真实宽高。');
  }
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function promptsForRequest(task: ImageGenerationTask): { prompt: string; negativePrompt?: string } {
  const request = task.submittedRequest!;
  if (request.transportPrompt) {
    resolveActualTransportPrompts({
      positive: request.transportPrompt,
      negative: request.transportNegativePrompt ?? ''
    }, request.negativePromptMode, request.promptDialectFamily);
    return request.transportNegativePrompt
      ? { prompt: request.transportPrompt, negativePrompt: request.transportNegativePrompt }
      : { prompt: request.transportPrompt };
  }
  const resolved = resolveActualTransportPrompts({
    positive: request.positivePrompt,
    negative: request.negativePrompt
  }, request.negativePromptMode, request.promptDialectFamily);
  return resolved.negativePrompt
    ? { prompt: resolved.prompt, negativePrompt: resolved.negativePrompt }
    : { prompt: resolved.prompt };
}

export class CharacterImageRuntimeExecutor implements CharacterImageExecutor {
  private readonly fetchImpl: ImageProbeFetch;
  private readonly decodeDimensions: (blob: Blob) => Promise<{ width: number; height: number }>;

  constructor(private readonly options: CharacterImageRuntimeExecutorOptions) {
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.decodeDimensions = options.decodeDimensions ?? browserImageDimensions;
  }

  async generate(task: ImageGenerationTask, context: CharacterImageExecutionContext = {}): Promise<CharacterImageExecutionOutput[]> {
    const request = task.submittedRequest;
    if (!request || task.status !== 'submitting') {
      throw new CharacterImageExecutionConfigurationError('task-not-submitting', '只有已确认并开始提交的任务可以调用图片执行器。');
    }
    const profile = await this.options.profiles.getProfile(request.imageProfileId);
    if (!profile || !profile.enabled || profile.providerType !== request.providerType) {
      throw new CharacterImageExecutionConfigurationError('profile-changed', '图片档案不存在、已停用或供应商类型已经变化，请重新预览请求。');
    }
    const credential = profile.credentialId
      ? await this.options.credentials.resolveCredential(profile.credentialId)
      : undefined;
    let workflow;
    if (request.executionTarget.kind === 'comfy-workflow') {
      workflow = await this.options.profiles.getWorkflowTemplate(request.executionTarget.workflowTemplateId);
      if (!workflow || workflow.revision !== request.executionTarget.workflowRevision) {
        throw new CharacterImageExecutionConfigurationError('workflow-changed', 'ComfyUI 工作流已变化，请重新预览请求。');
      }
    }
    const referenceCapability = resolveReferenceImageCapability({
      profile,
      workflow,
      generationParameters: request.generationParameters
    });
    try {
      assertReferenceTransportMatches(request.referenceImages, request.referenceImageTransport);
    } catch (error) {
      throw new CharacterImageExecutionConfigurationError(
        'reference-image-snapshot-invalid',
        toSafeImageProbeMessage(error)
      );
    }
    if (request.referenceImages.length) {
      if (!referenceCapability.supported) {
        throw new CharacterImageExecutionConfigurationError(
          'reference-image-transport-unsupported',
          referenceCapability.reason
        );
      }
      if (JSON.stringify(referenceCapability.transport) !== JSON.stringify(request.referenceImageTransport)) {
        throw new CharacterImageExecutionConfigurationError(
          'reference-image-transport-changed',
          '当前档案、生成预设或工作流的参考图协议已变化，请重新预览。'
        );
      }
    }
    const target = createImageGenerationProbeTarget(request, { workflow: workflow ?? undefined });
    const prepared = await prepareImageGenerationProbe(
      profile,
      credential ?? undefined,
      target,
      this.options.pageUrl?.()
    );
    const usesBuiltInPreset = request.imageGenerationPresetId.startsWith('builtin-');
    const currentFingerprint = await createExecutionFingerprint({
      connectionFingerprint: prepared.connectionFingerprint,
      modelId: request.executionTarget.kind === 'model' ? request.executionTarget.modelId : undefined,
      presetId: request.imageGenerationPresetId,
      presetRevision: request.imageGenerationPresetRevision,
      workflowHash: workflow?.workflowHash,
      executionParameters: usesBuiltInPreset
        ? task.intent.type === 'character-image'
          ? {
            ...CHARACTER_VISUAL_EXECUTION_TARGETS[task.intent.purpose],
            promptDialectPresetId: request.promptDialectPresetId
          }
          : {
            ...SCENE_VISUAL_EXECUTION_TARGET,
            promptDialectPresetId: request.promptDialectPresetId
          }
        : {
          targetAspectRatio: request.targetAspectRatio,
          promptDialectPresetId: request.promptDialectPresetId,
          generationParameters: request.generationParameters
        }
    });
    if (prepared.connectionFingerprint !== request.connectionFingerprint || currentFingerprint !== request.executionFingerprint) {
      throw new CharacterImageExecutionConfigurationError('execution-profile-changed', '图片档案、凭据、模型或工作流已变化，请重新预览并确认请求。');
    }
    if (task.submissionMode === 'automatic') {
      const records = await this.options.verificationStore.listRecords(profile.profileId);
      if (!hasMatchingRuntimeGenerationEvidence(records, profile.profileId, request.executionFingerprint)) {
        throw new CharacterImageExecutionConfigurationError('automatic-generation-unverified', '自动生图已锁定：当前执行指纹没有匹配的真实生成通过证据。');
      }
    }

    const signal = context.signal ?? new AbortController().signal;
    try {
      const referenceImages = await loadReferenceImages(
        this.options.visualRepository,
        task,
        request.referenceImages
      );
      const generated = await prepared.adapter.generate({
        ...promptsForRequest(task),
        referenceImages,
        profile: prepared.profile,
        credential: prepared.credential
      }, {
        signal,
        fetch: this.fetchImpl,
        wait,
        reportStage: (stage: Exclude<ImageProbeStage, 'local-validation' | 'blob-persist'>) => context.onStage?.(stage),
        reportRemoteTask: context.onRemoteTask
      });
      const outputs: CharacterImageExecutionOutput[] = [];
      for (const image of generated.images) {
        const blob = new Blob([image.bytes], { type: image.mimeType });
        const dimensions = image.width && image.height
          ? { width: image.width, height: image.height }
          : await this.decodeDimensions(blob);
        outputs.push({ blob, ...dimensions });
      }
      return outputs;
    } catch (error) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error instanceof CharacterImageExecutionConfigurationError) throw error;
      if (error instanceof ImageProbeProtocolError) {
        throw new CharacterImageExecutionConfigurationError(
          error.code,
          toSafeImageProbeMessage(error),
          error.category !== 'configuration' && error.category !== 'provider-rejected'
        );
      }
      throw new CharacterImageExecutionConfigurationError('generation-failed', toSafeImageProbeMessage(error), true);
    }
  }
}
