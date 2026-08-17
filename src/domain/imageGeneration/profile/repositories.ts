import type { ImageApiProfileId } from '../probe';
import type {
  ComfyWorkflowTemplate,
  ComfyWorkflowTemplateId,
  ImageApiCredential,
  ImageApiCredentialId,
  ImageApiCredentialSummary,
  ImageApiProfile,
  ImageProfileProbeResult
} from './types';

export interface ImageProfileRepository {
  listProfiles(): Promise<ImageApiProfile[]>;
  getProfile(profileId: ImageApiProfileId): Promise<ImageApiProfile | null>;
  putProfile(profile: ImageApiProfile): Promise<void>;
  deleteProfile(profileId: ImageApiProfileId): Promise<void>;
  listWorkflowTemplates(): Promise<ComfyWorkflowTemplate[]>;
  getWorkflowTemplate(workflowTemplateId: ComfyWorkflowTemplateId): Promise<ComfyWorkflowTemplate | null>;
  putWorkflowTemplate(template: ComfyWorkflowTemplate): Promise<void>;
  deleteWorkflowTemplate(workflowTemplateId: ComfyWorkflowTemplateId): Promise<void>;
  listProfileProbeResults(profileId: ImageApiProfileId): Promise<ImageProfileProbeResult[]>;
  putProfileProbeResult(result: ImageProfileProbeResult): Promise<void>;
  clearProfileProbeResults(profileId: ImageApiProfileId): Promise<void>;
}

export interface ImageCredentialRepository {
  listCredentialSummaries(): Promise<ImageApiCredentialSummary[]>;
  getCredentialSummary(credentialId: ImageApiCredentialId): Promise<ImageApiCredentialSummary | null>;
  resolveCredential(credentialId: ImageApiCredentialId): Promise<ImageApiCredential | null>;
  putCredential(credential: ImageApiCredential): Promise<void>;
  deleteCredential(credentialId: ImageApiCredentialId): Promise<void>;
}
