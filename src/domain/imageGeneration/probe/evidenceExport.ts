import { sanitizeImageProbeIdentifier, sanitizeImageProbeText } from './errors';
import { parseImageGenerationVerificationRecord } from './schemas';
import type {
  ImageGenerationVerificationRecord,
  ImageProbeArtifact,
  ImageProviderType
} from './types';

export interface ImageProbeEvidenceBundle {
  schemaVersion: 'image-probe-evidence-v1';
  exportedAt: string;
  profileId: string;
  providerType: ImageProviderType;
  records: ImageGenerationVerificationRecord[];
  latestArtifact?: {
    artifactId: string;
    verificationId: string;
    executionFingerprint: string;
    createdAt: string;
    mimeType: string;
    byteLength: number;
    width?: number;
    height?: number;
  };
}

export function createImageProbeEvidenceBundle(input: {
  profileId: string;
  providerType: ImageProviderType;
  records: ImageGenerationVerificationRecord[];
  latestArtifact?: ImageProbeArtifact | null;
  exportedAt?: string;
}): ImageProbeEvidenceBundle {
  const records = input.records.map((value) => {
    const record = parseImageGenerationVerificationRecord(value);
    if (record.profileId !== input.profileId || record.providerType !== input.providerType) {
      throw new Error('脱敏证据只能包含当前图片档案及其供应商的记录。');
    }
    return {
      ...record,
      completedStages: [...record.completedStages],
      providerRequestId: record.providerRequestId
        ? sanitizeImageProbeIdentifier(record.providerRequestId)
        : undefined,
      safeSummary: sanitizeImageProbeText(record.safeSummary),
      networkFailure: record.networkFailure ? {
        ...record.networkFailure,
        likelyCauses: [...record.networkFailure.likelyCauses]
      } : undefined
    };
  });
  const artifact = input.latestArtifact;
  if (artifact && (artifact.profileId !== input.profileId || artifact.providerType !== input.providerType)) {
    throw new Error('脱敏证据中的测试图片不属于当前图片档案。');
  }
  return {
    schemaVersion: 'image-probe-evidence-v1',
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    profileId: input.profileId,
    providerType: input.providerType,
    records,
    latestArtifact: artifact ? {
      artifactId: artifact.artifactId,
      verificationId: artifact.verificationId,
      executionFingerprint: artifact.executionFingerprint,
      createdAt: artifact.createdAt,
      mimeType: artifact.mimeType,
      byteLength: artifact.byteLength,
      width: artifact.width,
      height: artifact.height
    } : undefined
  };
}

export function serializeImageProbeEvidenceBundle(bundle: ImageProbeEvidenceBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}
