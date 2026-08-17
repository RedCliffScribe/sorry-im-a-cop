import type {
  ImageApiProfileId,
  ImageGenerationVerificationRecord,
  ImageProviderType
} from '../probe';

export type ImageApiCredentialId = string;
export type ComfyWorkflowTemplateId = string;

export interface ImageModelCatalogEntry {
  modelId: string;
  displayName?: string;
  source: 'provider-preset' | 'discovered' | 'manual';
  lastSeenAt?: string;
  deprecated?: boolean;
}

interface ImageApiProfileBase {
  profileId: ImageApiProfileId;
  name: string;
  providerType: ImageProviderType;
  enabled: boolean;
  apiBaseUrl: string;
  credentialId?: ImageApiCredentialId;
  requestTimeoutMs: number;
  downloadTimeoutMs: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

interface ModelBackedImageApiProfileBase extends ImageApiProfileBase {
  models: ImageModelCatalogEntry[];
  defaultModelId?: string;
}

export interface OpenAiImagesProfile extends ModelBackedImageApiProfileBase {
  providerType: 'openai-images';
  config: {
    apiVariant: 'openai-official' | 'openai-compatible';
    resultTransportPreference: 'base64-json' | 'temporary-url' | 'auto';
    modelDiscovery: 'standard-models-endpoint' | 'disabled';
    compatibilityOverrides?: {
      negativePromptMode?: 'merge-into-prompt' | 'unsupported';
      sizeMode?: 'fixed-presets' | 'dimensions' | 'aspect-ratio';
      seed?: boolean;
      multipleOutputs?: boolean;
    };
  };
}

export interface XaiImagesProfile extends ModelBackedImageApiProfileBase {
  providerType: 'xai-images';
  config: {
    apiVariant: 'xai-images-v1';
    resultTransportPreference: 'temporary-url' | 'base64-json' | 'auto';
    modelDiscovery: 'xai-image-generation-models';
  };
}

export interface GeminiImageProfile extends ModelBackedImageApiProfileBase {
  providerType: 'gemini-image';
  config: {
    apiMode: 'interactions' | 'generate-content-legacy';
    apiVersion: 'v1beta';
    responseMode: 'image-only';
  };
}

export type AlibabaRegion = 'cn-beijing' | 'ap-southeast-1' | 'us-east-1' | 'eu-central-1';

export interface AlibabaModelStudioProfile extends ModelBackedImageApiProfileBase {
  providerType: 'alibaba-model-studio';
  config: {
    region: AlibabaRegion;
    workspaceId?: string;
    endpointMode: 'workspace-domain' | 'regional-shared-domain';
    protocolVariant:
      | 'multimodal-generation-sync'
      | 'image-generation-async'
      | 'legacy-text2image-async';
    pollIntervalMs: number;
    maxPollDurationMs: number;
  };
}

export interface NovelAiImageProfile extends ModelBackedImageApiProfileBase {
  providerType: 'novelai-image';
  config: {
    apiVariant: 'novelai-image-current';
    responseFormat: 'json-base64' | 'zip' | 'auto';
    usageNoticeVersion: string;
    usageNoticeAcceptedAt?: string;
  };
}

export interface ComfyUiProfile extends ImageApiProfileBase {
  providerType: 'comfyui-workflow';
  config: {
    deployment: 'core-server' | 'comfy-cloud';
    authMode: 'none' | 'comfy-cloud-api-key' | 'basic-auth' | 'bearer-token';
    eventTransport: 'websocket-preferred' | 'polling-only';
    pollIntervalMs: number;
    maxPollDurationMs: number;
    exclusiveInstance: boolean;
  };
}

export interface SdWebUiProfile extends ModelBackedImageApiProfileBase {
  providerType: 'sd-webui';
  config: {
    dialect: 'automatic1111-core';
    authMode: 'none' | 'basic-auth' | 'bearer-token';
    schemaDiscovery: 'live-docs-preferred' | 'core-contract-only';
    exclusiveInstance: boolean;
  };
}

export type ImageApiProfile =
  | OpenAiImagesProfile
  | XaiImagesProfile
  | GeminiImageProfile
  | AlibabaModelStudioProfile
  | NovelAiImageProfile
  | ComfyUiProfile
  | SdWebUiProfile;

export type ImageCredentialMaterial =
  | { kind: 'bearer-token'; token: string }
  | { kind: 'api-key-header'; apiKey: string }
  | { kind: 'basic-auth'; username: string; password: string };

export interface ImageApiCredential {
  credentialId: ImageApiCredentialId;
  label: string;
  providerAffinity: ImageProviderType | 'local-reverse-proxy';
  material: ImageCredentialMaterial;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageApiCredentialSummary {
  credentialId: ImageApiCredentialId;
  label: string;
  providerAffinity: ImageProviderType | 'local-reverse-proxy';
  materialKind: ImageCredentialMaterial['kind'];
  maskedHint: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComfyInputBinding {
  nodeId: string;
  inputName: string;
}

export interface ComfyWorkflowBindings {
  positivePrompt: ComfyInputBinding;
  negativePrompt?: ComfyInputBinding;
  referenceImage?: ComfyInputBinding;
  checkpoint?: ComfyInputBinding;
  seed?: ComfyInputBinding;
  width?: ComfyInputBinding;
  height?: ComfyInputBinding;
  steps?: ComfyInputBinding;
  cfg?: ComfyInputBinding;
  sampler?: ComfyInputBinding;
  scheduler?: ComfyInputBinding;
}

export type ComfyWorkflowParameterValue = string | number | boolean;
export type ComfyWorkflowParameterValueType = 'number' | 'integer' | 'text' | 'boolean' | 'select';

export interface ComfyWorkflowParameterOption {
  value: string;
  label?: string;
}

export interface ComfyWorkflowExposedParameter {
  key: string;
  label: string;
  description?: string;
  binding: ComfyInputBinding;
  valueType: ComfyWorkflowParameterValueType;
  min?: number;
  max?: number;
  step?: number;
  options?: ComfyWorkflowParameterOption[];
}

export interface ComfyWorkflowTemplate {
  workflowTemplateId: ComfyWorkflowTemplateId;
  name: string;
  apiWorkflow: Record<string, { class_type: string; inputs: Record<string, unknown>; [key: string]: unknown }>;
  workflowHash: string;
  bindings: ComfyWorkflowBindings;
  exposedParameters?: ComfyWorkflowExposedParameter[];
  outputNodeIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type ImageProfileProbeKind = 'local-validation' | 'metadata-probe' | 'generation-probe';

export interface ImageProfileProbeResult {
  probeId: string;
  profileId: ImageApiProfileId;
  kind: ImageProfileProbeKind;
  status: 'passed' | 'warning' | 'failed' | 'unsupported';
  connectionFingerprint: string;
  executionFingerprint?: string;
  startedAt: string;
  completedAt: string;
  latencyMs?: number;
  safeMessage: string;
}

export interface ImageConnectionFingerprintInput {
  profileId: ImageApiProfileId;
  providerType: ImageProviderType;
  apiBaseUrl: string;
  credentialId?: ImageApiCredentialId;
  credentialRevision?: number;
  connectionCriticalConfig: unknown;
}

export interface ImageExecutionFingerprintInput {
  connectionFingerprint: string;
  modelId?: string;
  presetId?: string;
  presetRevision: number;
  workflowHash?: string;
  executionParameters?: unknown;
}

export function hasMatchingRuntimeGenerationEvidence(
  records: ImageGenerationVerificationRecord[],
  profileId: ImageApiProfileId,
  executionFingerprint: string
): boolean {
  return records.some((record) =>
    record.scope === 'runtime-profile' &&
    record.profileId === profileId &&
    record.verdict === 'real-passed' &&
    record.executionFingerprint === executionFingerprint
  );
}
