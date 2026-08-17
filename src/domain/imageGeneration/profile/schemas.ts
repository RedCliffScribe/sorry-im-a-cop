import { z } from 'zod';
import { IMAGE_PROVIDER_TYPES } from '../probe';

const idSchema = z.string().trim().min(1).max(200);
const nameSchema = z.string().trim().min(1).max(120);
const timestampSchema = z.string().datetime({ offset: true });
const revisionSchema = z.number().int().min(1);
const timeoutSchema = z.number().int().min(1_000).max(600_000);
const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}, '必须是 http:// 或 https:// 地址');

const modelCatalogEntrySchema = z.object({
  modelId: idSchema,
  displayName: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['provider-preset', 'discovered', 'manual']),
  lastSeenAt: timestampSchema.optional(),
  deprecated: z.boolean().optional()
}).strict();

const commonFields = {
  profileId: idSchema,
  name: nameSchema,
  enabled: z.boolean(),
  apiBaseUrl: httpUrlSchema,
  credentialId: idSchema.optional(),
  requestTimeoutMs: timeoutSchema,
  downloadTimeoutMs: timeoutSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
};

const modelFields = {
  models: z.array(modelCatalogEntrySchema).max(500),
  defaultModelId: idSchema.optional()
};

const openAiImagesProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('openai-images'),
  config: z.object({
    apiVariant: z.enum(['openai-official', 'openai-compatible']),
    resultTransportPreference: z.enum(['base64-json', 'temporary-url', 'auto']),
    modelDiscovery: z.enum(['standard-models-endpoint', 'disabled']),
    compatibilityOverrides: z.object({
      negativePromptMode: z.enum(['merge-into-prompt', 'unsupported']).optional(),
      sizeMode: z.enum(['fixed-presets', 'dimensions', 'aspect-ratio']).optional(),
      seed: z.boolean().optional(),
      multipleOutputs: z.boolean().optional()
    }).strict().optional()
  }).strict()
}).strict();

const xaiImagesProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('xai-images'),
  config: z.object({
    apiVariant: z.literal('xai-images-v1'),
    resultTransportPreference: z.enum(['temporary-url', 'base64-json', 'auto']),
    modelDiscovery: z.literal('xai-image-generation-models')
  }).strict()
}).strict();

const geminiImageProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('gemini-image'),
  config: z.object({
    apiMode: z.enum(['interactions', 'generate-content-legacy']),
    apiVersion: z.literal('v1beta'),
    responseMode: z.literal('image-only')
  }).strict()
}).strict();

const alibabaModelStudioProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('alibaba-model-studio'),
  config: z.object({
    region: z.enum(['cn-beijing', 'ap-southeast-1', 'us-east-1', 'eu-central-1']),
    workspaceId: idSchema.optional(),
    endpointMode: z.enum(['workspace-domain', 'regional-shared-domain']),
    protocolVariant: z.enum([
      'multimodal-generation-sync',
      'image-generation-async',
      'legacy-text2image-async'
    ]),
    pollIntervalMs: z.number().int().min(250).max(30_000),
    maxPollDurationMs: z.number().int().min(1_000).max(600_000)
  }).strict()
}).strict();

const novelAiImageProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('novelai-image'),
  config: z.object({
    apiVariant: z.literal('novelai-image-current'),
    responseFormat: z.enum(['json-base64', 'zip', 'auto']),
    usageNoticeVersion: idSchema,
    usageNoticeAcceptedAt: timestampSchema.optional()
  }).strict()
}).strict();

const comfyUiProfileSchema = z.object({
  ...commonFields,
  providerType: z.literal('comfyui-workflow'),
  config: z.object({
    deployment: z.enum(['core-server', 'comfy-cloud']),
    authMode: z.enum(['none', 'comfy-cloud-api-key', 'basic-auth', 'bearer-token']),
    eventTransport: z.enum(['websocket-preferred', 'polling-only']),
    pollIntervalMs: z.number().int().min(250).max(30_000),
    maxPollDurationMs: z.number().int().min(1_000).max(600_000),
    exclusiveInstance: z.boolean()
  }).strict()
}).strict();

const sdWebUiProfileSchema = z.object({
  ...commonFields,
  ...modelFields,
  providerType: z.literal('sd-webui'),
  config: z.object({
    dialect: z.literal('automatic1111-core'),
    authMode: z.enum(['none', 'basic-auth', 'bearer-token']),
    schemaDiscovery: z.enum(['live-docs-preferred', 'core-contract-only']),
    exclusiveInstance: z.boolean()
  }).strict()
}).strict();

export const imageApiProfileSchema = z.discriminatedUnion('providerType', [
  openAiImagesProfileSchema,
  xaiImagesProfileSchema,
  geminiImageProfileSchema,
  alibabaModelStudioProfileSchema,
  novelAiImageProfileSchema,
  comfyUiProfileSchema,
  sdWebUiProfileSchema
]).superRefine((profile, context) => {
  if ('models' in profile) {
    const modelIds = new Set(profile.models.map((model) => model.modelId));
    if (modelIds.size !== profile.models.length) {
      context.addIssue({ code: 'custom', path: ['models'], message: '模型 ID 不能重复' });
    }
    if (profile.defaultModelId && !modelIds.has(profile.defaultModelId)) {
      context.addIssue({ code: 'custom', path: ['defaultModelId'], message: '默认模型必须存在于模型目录' });
    }
  }
  if (
    profile.providerType === 'alibaba-model-studio' &&
    profile.config.endpointMode === 'workspace-domain' &&
    !profile.config.workspaceId
  ) {
    context.addIssue({ code: 'custom', path: ['config', 'workspaceId'], message: 'Workspace 域名模式必须填写 Workspace ID' });
  }
});

export const imageCredentialMaterialSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('bearer-token'), token: z.string().min(1).max(4096) }).strict(),
  z.object({ kind: z.literal('api-key-header'), apiKey: z.string().min(1).max(4096) }).strict(),
  z.object({
    kind: z.literal('basic-auth'),
    username: z.string().max(512).refine((value) => !value.includes(':'), 'Basic 用户名不能包含冒号'),
    password: z.string().max(4096)
  }).strict()
]);

export const imageApiCredentialSchema = z.object({
  credentialId: idSchema,
  label: nameSchema,
  providerAffinity: z.enum([...IMAGE_PROVIDER_TYPES, 'local-reverse-proxy']),
  material: imageCredentialMaterialSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict();

const comfyInputBindingSchema = z.object({
  nodeId: idSchema,
  inputName: idSchema
}).strict();

const comfyApiNodeSchema = z.object({
  class_type: z.string().trim().min(1).max(500),
  inputs: z.record(z.string(), z.unknown())
}).passthrough();

const comfyWorkflowParameterOptionSchema = z.object({
  value: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(120).optional()
}).strict();

const comfyWorkflowExposedParameterSchema = z.object({
  key: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/, '参数键只能包含字母、数字、点、横线和下划线，且必须以字母开头'),
  label: nameSchema,
  description: z.string().trim().min(1).max(500).optional(),
  binding: comfyInputBindingSchema,
  valueType: z.enum(['number', 'integer', 'text', 'boolean', 'select']),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  step: z.number().finite().positive().optional(),
  options: z.array(comfyWorkflowParameterOptionSchema).min(1).max(100).optional()
}).strict().superRefine((parameter, context) => {
  const isNumeric = parameter.valueType === 'number' || parameter.valueType === 'integer';
  if (!isNumeric && (parameter.min !== undefined || parameter.max !== undefined || parameter.step !== undefined)) {
    context.addIssue({ code: 'custom', path: ['valueType'], message: '只有数值参数可以设置最小值、最大值和步进' });
  }
  if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) {
    context.addIssue({ code: 'custom', path: ['min'], message: '最小值不能大于最大值' });
  }
  if (parameter.valueType === 'integer') {
    for (const [name, value] of Object.entries({ min: parameter.min, max: parameter.max, step: parameter.step })) {
      if (value !== undefined && !Number.isInteger(value)) {
        context.addIssue({ code: 'custom', path: [name], message: '整数参数的范围和步进也必须是整数' });
      }
    }
  }
  if (parameter.valueType === 'select') {
    if (!parameter.options?.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: '枚举参数必须提供至少一个选项' });
    } else if (new Set(parameter.options.map((option) => option.value)).size !== parameter.options.length) {
      context.addIssue({ code: 'custom', path: ['options'], message: '枚举选项值不能重复' });
    }
  } else if (parameter.options !== undefined) {
    context.addIssue({ code: 'custom', path: ['options'], message: '只有枚举参数可以提供选项' });
  }
});

export const comfyWorkflowTemplateSchema = z.object({
  workflowTemplateId: idSchema,
  name: nameSchema,
  apiWorkflow: z.record(z.string(), comfyApiNodeSchema).refine((workflow) => Object.keys(workflow).length > 0, 'API 工作流不能为空'),
  workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
  bindings: z.object({
    positivePrompt: comfyInputBindingSchema,
    negativePrompt: comfyInputBindingSchema.optional(),
    referenceImage: comfyInputBindingSchema.optional(),
    checkpoint: comfyInputBindingSchema.optional(),
    seed: comfyInputBindingSchema.optional(),
    width: comfyInputBindingSchema.optional(),
    height: comfyInputBindingSchema.optional(),
    steps: comfyInputBindingSchema.optional(),
    cfg: comfyInputBindingSchema.optional(),
    sampler: comfyInputBindingSchema.optional(),
    scheduler: comfyInputBindingSchema.optional()
  }).strict(),
  exposedParameters: z.array(comfyWorkflowExposedParameterSchema).max(64).optional(),
  outputNodeIds: z.array(idSchema).min(1).max(32),
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict().superRefine((template, context) => {
  const validateBinding = (binding: { nodeId: string; inputName: string }, path: Array<string | number>) => {
    const node = template.apiWorkflow[binding.nodeId];
    if (!node) {
      context.addIssue({ code: 'custom', path, message: `节点 ${binding.nodeId} 不存在` });
      return;
    }
    if (!(binding.inputName in node.inputs)) {
      context.addIssue({ code: 'custom', path, message: `节点 ${binding.nodeId} 不含输入 ${binding.inputName}` });
    }
  };
  Object.entries(template.bindings).forEach(([name, binding]) => {
    if (binding) validateBinding(binding, ['bindings', name]);
  });
  const reservedTargets = new Set(
    Object.values(template.bindings)
      .filter((binding): binding is { nodeId: string; inputName: string } => Boolean(binding))
      .map((binding) => `${binding.nodeId}\u0000${binding.inputName}`)
  );
  const parameterKeys = new Set<string>();
  const parameterTargets = new Set<string>();
  (template.exposedParameters ?? []).forEach((parameter, index) => {
    validateBinding(parameter.binding, ['exposedParameters', index, 'binding']);
    if (parameterKeys.has(parameter.key)) {
      context.addIssue({ code: 'custom', path: ['exposedParameters', index, 'key'], message: '开放参数键不能重复' });
    }
    parameterKeys.add(parameter.key);
    const target = `${parameter.binding.nodeId}\u0000${parameter.binding.inputName}`;
    if (reservedTargets.has(target)) {
      context.addIssue({ code: 'custom', path: ['exposedParameters', index, 'binding'], message: '开放参数不能覆盖提示词、参考图或标准生成绑定' });
    }
    if (parameterTargets.has(target)) {
      context.addIssue({ code: 'custom', path: ['exposedParameters', index, 'binding'], message: '同一工作流输入不能声明为多个开放参数' });
    }
    parameterTargets.add(target);
    const defaultValue = template.apiWorkflow[parameter.binding.nodeId]?.inputs[parameter.binding.inputName];
    const defaultMatches = parameter.valueType === 'number'
      ? typeof defaultValue === 'number' && Number.isFinite(defaultValue)
      : parameter.valueType === 'integer'
        ? typeof defaultValue === 'number' && Number.isInteger(defaultValue)
        : parameter.valueType === 'boolean'
          ? typeof defaultValue === 'boolean'
          : typeof defaultValue === 'string';
    if (!defaultMatches) {
      context.addIssue({ code: 'custom', path: ['exposedParameters', index, 'binding'], message: '工作流原值与声明的参数类型不一致，或该输入由其他节点连接' });
    }
    if (
      parameter.valueType === 'select' &&
      typeof defaultValue === 'string' &&
      !parameter.options?.some((option) => option.value === defaultValue)
    ) {
      context.addIssue({ code: 'custom', path: ['exposedParameters', index, 'options'], message: '枚举选项必须包含工作流原值' });
    }
  });
  template.outputNodeIds.forEach((nodeId, index) => {
    if (!template.apiWorkflow[nodeId]) {
      context.addIssue({ code: 'custom', path: ['outputNodeIds', index], message: `输出节点 ${nodeId} 不存在` });
    }
  });
});

export const imageProfileProbeResultSchema = z.object({
  probeId: idSchema,
  profileId: idSchema,
  kind: z.enum(['local-validation', 'metadata-probe', 'generation-probe']),
  status: z.enum(['passed', 'warning', 'failed', 'unsupported']),
  connectionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  executionFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  startedAt: timestampSchema,
  completedAt: timestampSchema,
  latencyMs: z.number().int().min(0).optional(),
  safeMessage: z.string().max(1200)
}).strict();
