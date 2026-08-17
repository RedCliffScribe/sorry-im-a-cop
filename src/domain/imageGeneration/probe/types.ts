export const IMAGE_PROVIDER_TYPES = [
  'openai-images',
  'xai-images',
  'gemini-image',
  'alibaba-model-studio',
  'novelai-image',
  'comfyui-workflow',
  'sd-webui'
] as const;

export type ImageProviderType = (typeof IMAGE_PROVIDER_TYPES)[number];
export type ImageApiProfileId = string;
export type ImageGenerationVerificationId = string;
export type ImageProbeArtifactId = string;

export const IMAGE_PROBE_STAGES = [
  'local-validation',
  'authentication',
  'submit',
  'poll-or-wait',
  'download',
  'decode',
  'blob-persist'
] as const;

export type ImageProbeStage = (typeof IMAGE_PROBE_STAGES)[number];

export type ImageGenerationVerificationVerdict =
  | 'real-passed'
  | 'mock-passed'
  | 'blocked-unverified'
  | 'real-failed';

export type ImageProbeEvidenceScope = 'project-adapter' | 'runtime-profile';
export type ImageProbeEnvironment = 'pages-browser' | 'local-browser' | 'test-runner';

export const IMAGE_PROBE_NETWORK_REQUEST_ROLES = [
  'generation-submit',
  'task-status-poll',
  'generated-image-download',
  'reference-image-upload',
  'provider-auxiliary'
] as const;

export type ImageProbeNetworkRequestRole = (typeof IMAGE_PROBE_NETWORK_REQUEST_ROLES)[number];

export const IMAGE_PROBE_NETWORK_LIKELY_CAUSES = [
  'cors-preflight-or-response',
  'cors-response',
  'mixed-content',
  'private-network-access',
  'browser-network-dns-tls'
] as const;

export type ImageProbeNetworkLikelyCause = (typeof IMAGE_PROBE_NETWORK_LIKELY_CAUSES)[number];

export interface ImageProbeNetworkFailureDiagnostic {
  requestRole: ImageProbeNetworkRequestRole;
  method: string;
  targetOrigin?: string;
  pageOrigin?: string;
  crossOrigin?: boolean;
  securePage?: boolean;
  insecureTarget?: boolean;
  localNetworkAccessExpected?: boolean;
  corsPreflightExpected?: boolean;
  responseReached: false;
  browserErrorName?: string;
  likelyCauses: ImageProbeNetworkLikelyCause[];
}

export interface ImageGenerationVerificationRecord {
  verificationId: ImageGenerationVerificationId;
  scope: ImageProbeEvidenceScope;
  profileId: ImageApiProfileId;
  providerType: ImageProviderType;
  verdict: ImageGenerationVerificationVerdict;
  adapterRevision: string;
  connectionFingerprint?: string;
  executionFingerprint?: string;
  environment: ImageProbeEnvironment;
  startedAt: string;
  completedAt: string;
  durationMs?: number;
  completedStages: ImageProbeStage[];
  providerRequestId?: string;
  safeSummary: string;
  blockerOrFailureCode?: string;
  networkFailure?: ImageProbeNetworkFailureDiagnostic;
  probeArtifactId?: ImageProbeArtifactId;
}

export interface ImageProbeArtifact {
  artifactId: ImageProbeArtifactId;
  verificationId: ImageGenerationVerificationId;
  profileId: ImageApiProfileId;
  providerType: ImageProviderType;
  executionFingerprint: string;
  createdAt: string;
  mimeType: string;
  byteLength: number;
  width?: number;
  height?: number;
  blob: Blob;
}

export interface ImageProbeOutcome {
  record: ImageGenerationVerificationRecord;
  artifact?: ImageProbeArtifact;
}

export interface ImageProfileValidationIssue {
  path: string;
  message: string;
}

export type ImageProfileValidationResult =
  | { ok: true }
  | { ok: false; issues: ImageProfileValidationIssue[] };

export interface ImageProbeGeneratedImage {
  bytes: ArrayBuffer;
  mimeType: string;
  width?: number;
  height?: number;
}

export interface ImageProbeGeneratedBatch {
  images: ImageProbeGeneratedImage[];
  providerRequestId?: string;
}

export interface ImageProbeReferenceImage {
  imageId: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: ArrayBuffer;
  width: number;
  height: number;
  byteLength: number;
  contentHash: string;
}

export interface ImageProbeGenerationInput {
  prompt: string;
  negativePrompt?: string;
  referenceImages?: ImageProbeReferenceImage[];
  profile: unknown;
  credential?: unknown;
}

export type ImageProbeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type ImageProbeWait = (milliseconds: number, signal: AbortSignal) => Promise<void>;

export interface ImageProbeAdapterContext {
  signal: AbortSignal;
  fetch: ImageProbeFetch;
  wait: ImageProbeWait;
  reportStage(stage: Exclude<ImageProbeStage, 'local-validation' | 'blob-persist'>): void;
  reportRemoteTask?(remoteTaskId: string): void | Promise<void>;
}

export interface ImageGenerationProbeAdapter {
  readonly providerType: ImageProviderType;
  validate(input: ImageProbeGenerationInput): ImageProfileValidationResult | Promise<ImageProfileValidationResult>;
  generate(input: ImageProbeGenerationInput, context: ImageProbeAdapterContext): Promise<ImageProbeGeneratedBatch>;
}

export interface ImageProbeRunInput extends ImageProbeGenerationInput {
  adapter: ImageGenerationProbeAdapter;
  scope: ImageProbeEvidenceScope;
  profileId: ImageApiProfileId;
  environment: ImageProbeEnvironment;
  adapterRevision: string;
  connectionFingerprint?: string;
  executionFingerprint: string;
  signal?: AbortSignal;
  onStage?: (stage: ImageProbeStage) => void;
}
