import {
  ImageProbeProtocolError,
  type ImageGenerationProbeAdapter,
  type ImageProbeAdapterContext,
  type ImageProbeGeneratedImage,
  type ImageProbeGenerationInput
} from '../probe';
import {
  alibabaProbeProfileSchema,
  apiKeyCredentialSchema,
  validateProbeInput,
  type AlibabaProbeProfile,
  type ApiKeyCredential
} from './providerSchemas';
import {
  alibabaRequestSchema,
  alibabaResponseSchema,
  parseProviderRequest,
  parseProviderResponse
} from './providerPayloadSchemas';
import {
  downloadTemporaryImage,
  extractProviderRequestId,
  fetchProviderResponse,
  joinProviderUrl,
  jsonRequestHeaders,
  readProviderJson,
  redactProviderSecrets,
  requireImages,
  referenceImageDataUrl
} from './providerProtocol';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function extractTaskId(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const output = asRecord(record?.output);
  return typeof output?.task_id === 'string'
    ? output.task_id
    : typeof record?.task_id === 'string'
      ? record.task_id
      : undefined;
}

function extractTaskStatus(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const output = asRecord(record?.output);
  const value = output?.task_status ?? record?.task_status;
  return typeof value === 'string' ? value.toUpperCase() : undefined;
}

function collectAlibabaImageUrls(payload: unknown): string[] {
  const output = asRecord(asRecord(payload)?.output);
  const choiceUrls = asRecordArray(output?.choices).flatMap((choice) => {
    const message = asRecord(choice.message);
    return asRecordArray(message?.content).flatMap((content) => {
      const value = content.image ?? content.url;
      return typeof value === 'string' && value.trim() ? [value] : [];
    });
  });
  const resultUrls = asRecordArray(output?.results).flatMap((result) => {
    const value = result.url ?? result.image;
    return typeof value === 'string' && value.trim() ? [value] : [];
  });
  return [...choiceUrls, ...resultUrls];
}

function createAlibabaBody(profile: AlibabaProbeProfile, input: ImageProbeGenerationInput): Record<string, unknown> {
  const parameters: Record<string, unknown> = { n: profile.n };
  if (profile.size) parameters.size = profile.size;
  if (input.negativePrompt?.trim()) parameters.negative_prompt = input.negativePrompt.trim();
  if (profile.seed !== undefined) parameters.seed = profile.seed;
  if (profile.watermark !== undefined) parameters.watermark = profile.watermark;
  if (profile.promptExtend !== undefined) parameters.prompt_extend = profile.promptExtend;
  if (profile.thinkingMode !== undefined) parameters.thinking_mode = profile.thinkingMode;
  const references = input.referenceImages ?? [];
  if (references.length > 3) throw new Error('阿里百炼多模态编辑最多允许 3 张参考图。');
  if (references.length && profile.protocolVariant !== 'multimodal-generation-sync') {
    throw new Error('当前阿里协议变体没有冻结参考图传输字段。');
  }
  const fields = profile.protocolVariant === 'legacy-text2image-async'
    ? { model: profile.model, input: { prompt: input.prompt.trim() }, parameters }
    : {
        model: profile.model,
        input: {
          messages: [{
            role: 'user',
            content: [
              ...references.map((reference) => ({ image: referenceImageDataUrl(reference) })),
              { text: input.prompt.trim() }
            ]
          }]
        },
        parameters
      };
  return parseProviderRequest(alibabaRequestSchema, fields, '阿里云百炼');
}

function submitPath(profile: AlibabaProbeProfile): string {
  if (profile.protocolVariant === 'multimodal-generation-sync') {
    return '/services/aigc/multimodal-generation/generation';
  }
  if (profile.protocolVariant === 'image-generation-async') {
    return '/services/aigc/image-generation/generation';
  }
  return '/services/aigc/text2image/image-synthesis';
}

async function downloadAlibabaImages(
  payload: unknown,
  context: ImageProbeAdapterContext
): Promise<ImageProbeGeneratedImage[]> {
  const images: ImageProbeGeneratedImage[] = [];
  for (const url of collectAlibabaImageUrls(payload)) {
    images.push(await downloadTemporaryImage(context, url));
  }
  return images;
}

export class AlibabaModelStudioProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'alibaba-model-studio' as const;

  validate(input: ImageProbeGenerationInput) {
    return validateProbeInput(input, alibabaProbeProfileSchema, apiKeyCredentialSchema);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = alibabaProbeProfileSchema.parse(input.profile) as AlibabaProbeProfile;
    const credential = apiKeyCredentialSchema.parse(input.credential) as ApiKeyCredential;
    const asynchronous = profile.protocolVariant !== 'multimodal-generation-sync';
    const headers = jsonRequestHeaders(
      credential.apiKey,
      asynchronous ? { 'X-DashScope-Async': 'enable' } : {}
    );

    context.reportStage('authentication');
    context.reportStage('submit');
    const submitResponse = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, submitPath(profile)),
      { method: 'POST', headers, body: JSON.stringify(createAlibabaBody(profile, input)) },
      [credential.apiKey],
      'generation-submit'
    );
    const headerRequestId = extractProviderRequestId(submitResponse);
    let providerRequestId = headerRequestId;
    if (headerRequestId) await context.reportRemoteTask?.(headerRequestId);
    let payload = parseProviderResponse(
      alibabaResponseSchema,
      await readProviderJson(submitResponse, [credential.apiKey]),
      '阿里云百炼'
    );
    const payloadRequestId = extractProviderRequestId(submitResponse, payload);
    providerRequestId = payloadRequestId ?? providerRequestId;
    if (payloadRequestId && payloadRequestId !== headerRequestId) {
      await context.reportRemoteTask?.(payloadRequestId);
    }
    let taskId: string | undefined;

    if (asynchronous) {
      taskId = extractTaskId(payload);
      if (!taskId) {
        throw new ImageProbeProtocolError(
          'alibaba-missing-task-id',
          'invalid-response',
          '阿里云异步生图响应缺少 task_id。'
        );
      }
      if (taskId !== providerRequestId) await context.reportRemoteTask?.(taskId);
      context.reportStage('poll-or-wait');
      let completed = false;
      for (let attempt = 0; attempt < profile.maxPollAttempts; attempt += 1) {
        await context.wait(profile.pollIntervalMs, context.signal);
        if (context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const pollResponse = await fetchProviderResponse(
          context,
          joinProviderUrl(profile.apiBaseUrl, `/tasks/${encodeURIComponent(taskId)}`),
          { method: 'GET', headers: jsonRequestHeaders(credential.apiKey) },
          [credential.apiKey],
          'task-status-poll'
        );
        payload = parseProviderResponse(
          alibabaResponseSchema,
          await readProviderJson(pollResponse, [credential.apiKey]),
          '阿里云百炼'
        );
        const returnedTaskId = extractTaskId(payload);
        if (returnedTaskId && returnedTaskId !== taskId) {
          throw new ImageProbeProtocolError(
            'alibaba-task-id-mismatch',
            'invalid-response',
            '阿里云轮询响应的 task_id 与提交任务不一致。'
          );
        }
        const status = extractTaskStatus(payload);
        if (status === 'SUCCEEDED') {
          completed = true;
          break;
        }
        if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
          const message = redactProviderSecrets(
            asRecord(asRecord(payload)?.output)?.message ?? `任务状态为 ${status}`,
            [credential.apiKey]
          );
          throw new ImageProbeProtocolError(
            `alibaba-task-${status.toLowerCase()}`,
            status === 'FAILED' ? 'provider-rejected' : 'invalid-response',
            `阿里云异步生图失败：${message}`
          );
        }
        if (status && status !== 'PENDING' && status !== 'RUNNING') {
          throw new ImageProbeProtocolError(
            'alibaba-unknown-task-status',
            'invalid-response',
            `阿里云返回了无法识别的任务状态：${redactProviderSecrets(status, [credential.apiKey])}`
          );
        }
      }
      if (!completed) {
        throw new ImageProbeProtocolError(
          'alibaba-poll-timeout',
          'timeout',
          '阿里云异步生图在限定轮询次数内未完成。'
        );
      }
    }

    context.reportStage('download');
    const images = requireImages(await downloadAlibabaImages(payload, context), '阿里云百炼');
    context.reportStage('decode');
    return {
      images,
      providerRequestId: taskId ?? (typeof asRecord(payload)?.request_id === 'string'
        ? asRecord(payload)?.request_id as string
        : providerRequestId)
    };
  }
}

export { collectAlibabaImageUrls, createAlibabaBody, extractTaskId, extractTaskStatus };
