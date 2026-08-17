import type { ImageCredentialRepository, ImageProfileRepository } from './repositories';
import type { ComfyWorkflowTemplate, ImageApiCredentialSummary, ImageApiProfile } from './types';

export interface ManualImageRoutingOptions {
  profiles: ImageApiProfile[];
  workflows: ComfyWorkflowTemplate[];
}

export interface ResolvedManualImageRouting {
  profile: ImageApiProfile;
  credential?: ImageApiCredentialSummary;
  workflow?: ComfyWorkflowTemplate;
}

export async function listManualImageRoutingOptions(
  repository: Pick<ImageProfileRepository, 'listProfiles' | 'listWorkflowTemplates'>
): Promise<ManualImageRoutingOptions> {
  const [profiles, workflows] = await Promise.all([
    repository.listProfiles(),
    repository.listWorkflowTemplates()
  ]);
  return {
    profiles: profiles.filter((profile) => profile.enabled),
    workflows
  };
}

export async function resolveManualImageRouting(input: {
  profileRepository: Pick<ImageProfileRepository, 'getProfile' | 'getWorkflowTemplate'>;
  credentialRepository: Pick<ImageCredentialRepository, 'listCredentialSummaries'>;
  profileId: string;
  workflowTemplateId?: string;
}): Promise<ResolvedManualImageRouting> {
  if (!input.profileId.trim()) throw new Error('请先明确选择本次使用的图片档案。');
  const profile = await input.profileRepository.getProfile(input.profileId);
  if (!profile || !profile.enabled) throw new Error('所选图片档案不存在或已经停用，请重新选择。');

  let workflow: ComfyWorkflowTemplate | undefined;
  if (profile.providerType === 'comfyui-workflow') {
    if (!input.workflowTemplateId?.trim()) throw new Error('ComfyUI 手动生成必须明确选择 API 工作流。');
    const selectedWorkflow = await input.profileRepository.getWorkflowTemplate(input.workflowTemplateId);
    if (!selectedWorkflow) throw new Error('所选 ComfyUI API 工作流不存在，请重新选择。');
    workflow = selectedWorkflow;
  }

  const credential = (await input.credentialRepository.listCredentialSummaries())
    .find((item) => item.credentialId === profile.credentialId);
  return { profile, credential, workflow };
}
