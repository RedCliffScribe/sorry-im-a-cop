import {
  ImageProbeProtocolError,
  type ImageGenerationProbeAdapter,
  type ImageProbeAdapterContext,
  type ImageProbeGeneratedImage,
  type ImageProbeGenerationInput,
  type ImageProfileValidationIssue
} from '../probe';
import {
  mergeValidationIssues,
  proxyAuthorizationHeaders,
  proxyCredentialSecrets,
  validateProxyMode
} from './adapterSupport';
import {
  comfyUiProbeProfileSchema,
  proxyCredentialSchema,
  validateProbeInput,
  type ComfyUiProbeProfile,
  type ProxyCredential
} from './providerSchemas';
import {
  comfyHistoryResponseSchema,
  comfySubmitRequestSchema,
  comfySubmitResponseSchema,
  parseProviderRequest,
  parseProviderResponse
} from './providerPayloadSchemas';
import {
  downloadTemporaryImage,
  fetchProviderResponse,
  joinProviderUrl,
  readBinaryImage,
  readProviderJson,
  redactProviderSecrets,
  requireImages
} from './providerProtocol';

interface ComfyImageReference {
  filename: string;
  subfolder?: string;
  type?: string;
}

type ComfyWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = asRecord(value);
  if (record) {
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function extractHistoryWorkflow(job: Record<string, unknown>): Record<string, unknown> | undefined {
  const prompt = job.prompt;
  if (!Array.isArray(prompt)) return undefined;
  return asRecord(prompt[2]);
}

function findMatchingCachedHistoryReferences(
  payload: unknown,
  currentPromptId: string,
  submittedWorkflow: ComfyWorkflow,
  outputNodeIds: string[]
): ComfyImageReference[] {
  const history = asRecord(payload);
  if (!history) return [];
  const expected = canonicalJson(submittedWorkflow);
  const jobs = Object.entries(history).reverse();
  for (const [promptId, value] of jobs) {
    if (promptId === currentPromptId) continue;
    const job = asRecord(value);
    if (
      !job ||
      !isComfyJobComplete(job) ||
      canonicalJson(extractHistoryWorkflow(job)) !== expected
    ) continue;
    const references = extractComfyImageReferences(job, outputNodeIds);
    if (references.length) return references;
  }
  return [];
}

function validateComfyBindings(profile: ComfyUiProbeProfile): ImageProfileValidationIssue[] {
  const issues: ImageProfileValidationIssue[] = [];
  for (const [name, binding] of Object.entries(profile.bindings)) {
    if (!binding) continue;
    const node = profile.workflow[binding.nodeId];
    if (!node) {
      issues.push({ path: `profile.bindings.${name}.nodeId`, message: '绑定节点不存在于工作流' });
    } else if (!(binding.inputName in node.inputs)) {
      issues.push({ path: `profile.bindings.${name}.inputName`, message: '绑定输入不存在于目标节点' });
    }
  }
  for (const [index, parameter] of (profile.parameterOverrides ?? []).entries()) {
    const node = profile.workflow[parameter.binding.nodeId];
    if (!node) {
      issues.push({
        path: `profile.parameterOverrides.${index}.binding.nodeId`,
        message: '开放参数绑定节点不存在于工作流'
      });
    } else if (!(parameter.binding.inputName in node.inputs)) {
      issues.push({
        path: `profile.parameterOverrides.${index}.binding.inputName`,
        message: '开放参数绑定输入不存在于目标节点'
      });
    }
  }
  for (const nodeId of profile.outputNodeIds) {
    if (!profile.workflow[nodeId]) {
      issues.push({ path: 'profile.outputNodeIds', message: `输出节点 ${nodeId} 不存在于工作流` });
    }
  }
  return issues;
}

function applyWorkflowBinding(
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>,
  binding: { nodeId: string; inputName: string } | undefined,
  value: unknown
): void {
  if (!binding || value === undefined) return;
  const node = workflow[binding.nodeId];
  if (!node || !(binding.inputName in node.inputs)) {
    throw new ImageProbeProtocolError(
      'comfy-invalid-workflow-binding',
      'configuration',
      'ComfyUI 工作流绑定已失效。'
    );
  }
  node.inputs[binding.inputName] = value;
}

function createComfyWorkflow(
  profile: ComfyUiProbeProfile,
  input: ImageProbeGenerationInput,
  referenceFilename?: string
): ComfyWorkflow {
  const workflow = structuredClone(profile.workflow);
  applyWorkflowBinding(workflow, profile.bindings.positivePrompt, input.prompt.trim());
  applyWorkflowBinding(workflow, profile.bindings.negativePrompt, input.negativePrompt?.trim() ?? '');
  applyWorkflowBinding(workflow, profile.bindings.checkpoint, profile.checkpoint);
  applyWorkflowBinding(workflow, profile.bindings.seed, profile.seed);
  applyWorkflowBinding(workflow, profile.bindings.width, profile.width);
  applyWorkflowBinding(workflow, profile.bindings.height, profile.height);
  applyWorkflowBinding(workflow, profile.bindings.steps, profile.steps);
  applyWorkflowBinding(workflow, profile.bindings.cfg, profile.cfg);
  applyWorkflowBinding(workflow, profile.bindings.sampler, profile.sampler);
  applyWorkflowBinding(workflow, profile.bindings.scheduler, profile.scheduler);
  applyWorkflowBinding(workflow, profile.bindings.referenceImage, referenceFilename);
  for (const parameter of profile.parameterOverrides ?? []) {
    applyWorkflowBinding(workflow, parameter.binding, parameter.value);
  }
  return workflow;
}

async function uploadComfyReferenceImage(
  profile: ComfyUiProbeProfile,
  credential: ProxyCredential,
  input: NonNullable<ImageProbeGenerationInput['referenceImages']>[number],
  context: ImageProbeAdapterContext
): Promise<string> {
  if (!profile.bindings.referenceImage) {
    throw new ImageProbeProtocolError(
      'comfy-reference-binding-missing',
      'configuration',
      'ComfyUI 工作流没有冻结参考图片输入绑定。'
    );
  }
  const extension = input.mimeType === 'image/jpeg' ? 'jpg' : input.mimeType.split('/')[1];
  const filename = `cop-reference-${input.contentHash.slice(0, 20)}.${extension}`;
  const form = new FormData();
  form.set('image', new Blob([input.bytes], { type: input.mimeType }), filename);
  form.set('type', 'input');
  form.set('overwrite', 'false');
  const prefix = profile.deployment === 'comfy-cloud' ? '/api' : '';
  const secrets = proxyCredentialSecrets(credential);
  const response = await fetchProviderResponse(
    context,
    joinProviderUrl(profile.apiBaseUrl, `${prefix}/upload/image`),
    {
      method: 'POST',
      headers: new Headers({ Accept: 'application/json', ...proxyAuthorizationHeaders(credential) }),
      body: form
    },
    secrets,
    'reference-image-upload'
  );
  const payload = asRecord(await readProviderJson(response, secrets));
  const uploadedName = payload?.name ?? payload?.filename;
  if (typeof uploadedName !== 'string' || !uploadedName.trim()) {
    throw new ImageProbeProtocolError(
      'comfy-reference-upload-invalid-response',
      'invalid-response',
      'ComfyUI 参考图上传响应缺少文件名。'
    );
  }
  return uploadedName;
}

function extractPromptId(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const value = record?.prompt_id ?? record?.promptId ?? record?.id;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function findHistoryJob(payload: unknown, promptId: string): Record<string, unknown> | undefined {
  const record = asRecord(payload);
  if (!record) return undefined;
  const keyed = asRecord(record[promptId]);
  if (keyed) return keyed;
  return extractPromptId(record) === promptId || record.outputs ? record : undefined;
}

function extractComfyImageReferences(
  job: Record<string, unknown>,
  outputNodeIds: string[]
): ComfyImageReference[] {
  const outputs = asRecord(job.outputs);
  if (!outputs) return [];
  return outputNodeIds.flatMap((nodeId) => {
    const output = asRecord(outputs[nodeId]);
    if (!Array.isArray(output?.images)) return [];
    return output.images.flatMap((value) => {
      const image = asRecord(value);
      if (!image || typeof image.filename !== 'string' || !image.filename.trim()) return [];
      return [{
        filename: image.filename,
        subfolder: typeof image.subfolder === 'string' ? image.subfolder : undefined,
        type: typeof image.type === 'string' ? image.type : undefined
      }];
    });
  });
}

function isComfyJobComplete(job: Record<string, unknown>): boolean {
  const status = asRecord(job.status);
  const statusText = status?.status_str ?? job.status;
  return status?.completed === true
    || (typeof statusText === 'string' && ['success', 'succeeded', 'completed'].includes(statusText.toLowerCase()));
}

function assertComfyJobNotFailed(job: Record<string, unknown>, secrets: string[]): void {
  const status = asRecord(job.status);
  const statusText = status?.status_str ?? job.status;
  if (typeof statusText !== 'string' || !['error', 'failed', 'failure'].includes(statusText.toLowerCase())) return;
  throw new ImageProbeProtocolError(
    'comfy-job-failed',
    'provider-rejected',
    `ComfyUI 工作流执行失败：${redactProviderSecrets(status?.messages ?? statusText, secrets)}`
  );
}

async function downloadComfyImage(
  profile: ComfyUiProbeProfile,
  credential: ProxyCredential,
  reference: ComfyImageReference,
  context: ImageProbeAdapterContext
): Promise<ImageProbeGeneratedImage> {
  const viewPath = profile.deployment === 'comfy-cloud' ? '/api/view' : '/view';
  const url = new URL(joinProviderUrl(profile.apiBaseUrl, viewPath));
  url.searchParams.set('filename', reference.filename);
  if (reference.subfolder) url.searchParams.set('subfolder', reference.subfolder);
  if (reference.type) url.searchParams.set('type', reference.type);
  const secrets = proxyCredentialSecrets(credential);
  const response = await fetchProviderResponse(
    context,
    url.toString(),
    {
      method: 'GET',
      headers: new Headers({ Accept: 'image/*', ...proxyAuthorizationHeaders(credential) }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'manual',
      referrerPolicy: 'no-referrer'
    },
    secrets,
    'generated-image-download'
  );
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) {
      throw new ImageProbeProtocolError(
        'comfy-unreadable-image-redirect',
        'download',
        'ComfyUI 图片下载发生了浏览器不可读的重定向，已停止以避免泄露鉴权信息。'
      );
    }
    return downloadTemporaryImage(context, new URL(location, url).toString());
  }
  if (response.type === 'opaqueredirect' || response.status === 0) {
    throw new ImageProbeProtocolError(
      'comfy-unreadable-image-redirect',
      'download',
      'ComfyUI 图片下载发生了浏览器不可读的重定向，已停止以避免泄露鉴权信息。'
    );
  }
  return readBinaryImage(response);
}

export class ComfyUiWorkflowProbeAdapter implements ImageGenerationProbeAdapter {
  readonly providerType = 'comfyui-workflow' as const;

  validate(input: ImageProbeGenerationInput) {
    const base = validateProbeInput(input, comfyUiProbeProfileSchema, proxyCredentialSchema);
    const profile = comfyUiProbeProfileSchema.safeParse(input.profile);
    const credential = proxyCredentialSchema.safeParse(input.credential);
    const issues = profile.success && credential.success
      ? [...validateProxyMode(profile.data, credential.data), ...validateComfyBindings(profile.data)]
      : [];
    return mergeValidationIssues(base, issues);
  }

  async generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext) {
    const profile = comfyUiProbeProfileSchema.parse(input.profile) as ComfyUiProbeProfile;
    const credential = proxyCredentialSchema.parse(input.credential) as ProxyCredential;
    const pathPrefix = profile.deployment === 'comfy-cloud' ? '/api' : '';
    const secrets = proxyCredentialSecrets(credential);
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...proxyAuthorizationHeaders(credential)
    });
    const referenceInputs = input.referenceImages ?? [];
    if (referenceInputs.length > 1) throw new Error('ComfyUI 工作流参考图当前只允许一张。');

    context.reportStage('authentication');
    context.reportStage('submit');
    const referenceFilename = referenceInputs.length
      ? await uploadComfyReferenceImage(profile, credential, referenceInputs[0], context)
      : undefined;
    const submittedWorkflow = createComfyWorkflow(profile, input, referenceFilename);
    const submitResponse = await fetchProviderResponse(
      context,
      joinProviderUrl(profile.apiBaseUrl, `${pathPrefix}/prompt`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(parseProviderRequest(
          comfySubmitRequestSchema,
          { prompt: submittedWorkflow },
          'ComfyUI'
        ))
      },
      secrets,
      'generation-submit'
    );
    const promptId = extractPromptId(parseProviderResponse(
      comfySubmitResponseSchema,
      await readProviderJson(submitResponse, secrets),
      'ComfyUI submit'
    ));
    if (!promptId) {
      throw new ImageProbeProtocolError(
        'comfy-missing-prompt-id',
        'invalid-response',
        'ComfyUI 提交响应缺少 prompt_id。'
      );
    }
    await context.reportRemoteTask?.(promptId);

    context.reportStage('poll-or-wait');
    let references: ComfyImageReference[] = [];
    for (let attempt = 0; attempt < profile.maxPollAttempts; attempt += 1) {
      await context.wait(profile.pollIntervalMs, context.signal);
      if (context.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const historyResponse = await fetchProviderResponse(
        context,
        joinProviderUrl(profile.apiBaseUrl, `${pathPrefix}/history/${encodeURIComponent(promptId)}`),
        { method: 'GET', headers },
        secrets,
        'task-status-poll'
      );
      const job = findHistoryJob(parseProviderResponse(
        comfyHistoryResponseSchema,
        await readProviderJson(historyResponse, secrets),
        'ComfyUI history'
      ), promptId);
      if (!job) continue;
      assertComfyJobNotFailed(job, secrets);
      references = extractComfyImageReferences(job, profile.outputNodeIds);
      if (references.length > 0) break;
      if (isComfyJobComplete(job)) {
        const cachedHistoryUrl = new URL(joinProviderUrl(profile.apiBaseUrl, `${pathPrefix}/history`));
        cachedHistoryUrl.searchParams.set('max_items', '20');
        const cachedHistoryResponse = await fetchProviderResponse(
          context,
          cachedHistoryUrl.toString(),
          { method: 'GET', headers },
          secrets,
          'task-status-poll'
        );
        references = findMatchingCachedHistoryReferences(
          parseProviderResponse(
            comfyHistoryResponseSchema,
            await readProviderJson(cachedHistoryResponse, secrets),
            'ComfyUI cached history'
          ),
          promptId,
          submittedWorkflow,
          profile.outputNodeIds
        );
        if (references.length > 0) break;
        throw new ImageProbeProtocolError(
          'comfy-no-configured-output-image',
          'no-image',
          'ComfyUI 工作流已完成，但指定输出节点没有图片。'
        );
      }
    }
    if (references.length === 0) {
      throw new ImageProbeProtocolError(
        'comfy-poll-timeout',
        'timeout',
        'ComfyUI 工作流在限定轮询次数内未返回图片。'
      );
    }

    context.reportStage('download');
    const images: ImageProbeGeneratedImage[] = [];
    for (const reference of references) {
      images.push(await downloadComfyImage(profile, credential, reference, context));
    }
    context.reportStage('decode');
    return { images: requireImages(images, 'ComfyUI'), providerRequestId: promptId };
  }
}

export {
  createComfyWorkflow,
  extractComfyImageReferences,
  findMatchingCachedHistoryReferences,
  extractPromptId,
  findHistoryJob,
  validateComfyBindings
};
