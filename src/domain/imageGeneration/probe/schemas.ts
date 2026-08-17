import { z } from 'zod';
import {
  IMAGE_PROBE_NETWORK_LIKELY_CAUSES,
  IMAGE_PROBE_NETWORK_REQUEST_ROLES,
  IMAGE_PROBE_STAGES,
  IMAGE_PROVIDER_TYPES
} from './types';
import type { ImageGenerationVerificationRecord, ImageProbeArtifact } from './types';

export const imageProviderTypeSchema = z.enum(IMAGE_PROVIDER_TYPES);
export const imageProbeStageSchema = z.enum(IMAGE_PROBE_STAGES);
export const imageGenerationVerificationVerdictSchema = z.enum([
  'real-passed',
  'mock-passed',
  'blocked-unverified',
  'real-failed'
]);
export const imageProbeEvidenceScopeSchema = z.enum(['project-adapter', 'runtime-profile']);
export const imageProbeEnvironmentSchema = z.enum(['pages-browser', 'local-browser', 'test-runner']);
export const imageProbeNetworkRequestRoleSchema = z.enum(IMAGE_PROBE_NETWORK_REQUEST_ROLES);
export const imageProbeNetworkLikelyCauseSchema = z.enum(IMAGE_PROBE_NETWORK_LIKELY_CAUSES);
export const imageProbeNetworkFailureDiagnosticSchema = z.object({
  requestRole: imageProbeNetworkRequestRoleSchema,
  method: z.string().min(1).max(16),
  targetOrigin: z.string().min(1).max(300).optional(),
  pageOrigin: z.string().min(1).max(300).optional(),
  crossOrigin: z.boolean().optional(),
  securePage: z.boolean().optional(),
  insecureTarget: z.boolean().optional(),
  localNetworkAccessExpected: z.boolean().optional(),
  corsPreflightExpected: z.boolean().optional(),
  responseReached: z.literal(false),
  browserErrorName: z.string().min(1).max(80).optional(),
  likelyCauses: z.array(imageProbeNetworkLikelyCauseSchema).max(5)
}).strict();

export const imageGenerationVerificationRecordSchema = z
  .object({
    verificationId: z.string().min(1),
    scope: imageProbeEvidenceScopeSchema,
    profileId: z.string().min(1),
    providerType: imageProviderTypeSchema,
    verdict: imageGenerationVerificationVerdictSchema,
    adapterRevision: z.string().min(1),
    connectionFingerprint: z.string().min(1).optional(),
    executionFingerprint: z.string().min(1).optional(),
    environment: imageProbeEnvironmentSchema,
    startedAt: z.string().min(1),
    completedAt: z.string().min(1),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
    completedStages: z.array(imageProbeStageSchema),
    providerRequestId: z.string().min(1).max(200).optional(),
    safeSummary: z.string().min(1).max(2000),
    blockerOrFailureCode: z.string().min(1).max(120).optional(),
    networkFailure: imageProbeNetworkFailureDiagnosticSchema.optional(),
    probeArtifactId: z.string().min(1).optional()
  })
  .strict()
  .superRefine((record, context) => {
    const passed = record.verdict === 'real-passed' || record.verdict === 'mock-passed';
    if (passed && !record.completedStages.includes('blob-persist')) {
      context.addIssue({ code: 'custom', path: ['completedStages'], message: '通过的探针必须完成 Blob 持久化。' });
    }
    if (!passed && record.probeArtifactId) {
      context.addIssue({ code: 'custom', path: ['probeArtifactId'], message: '未通过的探针不能关联测试图片。' });
    }
    if (record.networkFailure && record.blockerOrFailureCode !== 'provider-network-failed') {
      context.addIssue({
        code: 'custom',
        path: ['networkFailure'],
        message: '网络失败诊断只能附着在 provider-network-failed 记录上。'
      });
    }
    if (record.verdict === 'mock-passed') {
      if (record.environment !== 'test-runner' || record.scope !== 'project-adapter') {
        context.addIssue({ code: 'custom', path: ['verdict'], message: 'mock-passed 只允许用于项目级测试运行器。' });
      }
    }
    if ((record.verdict === 'real-passed' || record.verdict === 'real-failed') && record.environment === 'test-runner') {
      context.addIssue({ code: 'custom', path: ['environment'], message: '测试运行器不能产生真实通过或真实失败结论。' });
    }
    if (record.verdict === 'real-passed' && !record.executionFingerprint) {
      context.addIssue({ code: 'custom', path: ['executionFingerprint'], message: '真实通过必须绑定执行指纹。' });
    }
  });

const imageProbeArtifactMetadataSchema = z
  .object({
    artifactId: z.string().min(1),
    verificationId: z.string().min(1),
    profileId: z.string().min(1),
    providerType: imageProviderTypeSchema,
    executionFingerprint: z.string().min(1),
    createdAt: z.string().min(1),
    mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/i),
    byteLength: z.number().int().positive(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional()
  })
  .strict();

export function parseImageGenerationVerificationRecord(value: unknown): ImageGenerationVerificationRecord {
  return imageGenerationVerificationRecordSchema.parse(value) as ImageGenerationVerificationRecord;
}

export function parseImageProbeArtifact(value: unknown): ImageProbeArtifact {
  if (!value || typeof value !== 'object') throw new Error('测试图片记录无效。');
  const { blob, ...metadata } = value as { blob?: unknown } & Record<string, unknown>;
  const parsed = imageProbeArtifactMetadataSchema.parse(metadata);
  if (!(blob instanceof Blob)) throw new Error('测试图片 Blob 无效。');
  if (blob.size !== parsed.byteLength || blob.type !== parsed.mimeType) {
    throw new Error('测试图片 Blob 与元数据不一致。');
  }
  return { ...parsed, blob };
}
