import { describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile } from './defaults';
import { listManualImageRoutingOptions, resolveManualImageRouting } from './manualRouting';
import type { ComfyWorkflowTemplate, ImageApiProfile } from './types';

const workflow: ComfyWorkflowTemplate = {
  workflowTemplateId: 'workflow_explicit',
  name: '显式工作流',
  apiWorkflow: { '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } } },
  workflowHash: 'a'.repeat(64),
  bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
  outputNodeIds: ['1'],
  revision: 1,
  createdAt: '2026-07-23T00:00:00.000Z',
  updatedAt: '2026-07-23T00:00:00.000Z'
};

describe('manual image routing', () => {
  it('lists only enabled profiles without auto-selecting one', async () => {
    const enabled = { ...createDefaultImageApiProfile('openai-images', 'profile_enabled'), enabled: true };
    const disabled = createDefaultImageApiProfile('sd-webui', 'profile_disabled');
    const result = await listManualImageRoutingOptions({
      listProfiles: vi.fn().mockResolvedValue([disabled, enabled]),
      listWorkflowTemplates: vi.fn().mockResolvedValue([workflow])
    });
    expect(result.profiles.map((profile) => profile.profileId)).toEqual(['profile_enabled']);
    expect(result.workflows).toEqual([workflow]);
  });

  it('requires an explicit profile and an explicit ComfyUI workflow', async () => {
    const comfy = { ...createDefaultImageApiProfile('comfyui-workflow', 'profile_comfy'), enabled: true } as ImageApiProfile;
    const profileRepository = {
      getProfile: vi.fn().mockResolvedValue(comfy),
      getWorkflowTemplate: vi.fn().mockResolvedValue(workflow)
    };
    const credentialRepository = { listCredentialSummaries: vi.fn().mockResolvedValue([]) };

    await expect(resolveManualImageRouting({
      profileRepository,
      credentialRepository,
      profileId: ''
    })).rejects.toThrow('明确选择本次使用的图片档案');
    await expect(resolveManualImageRouting({
      profileRepository,
      credentialRepository,
      profileId: comfy.profileId
    })).rejects.toThrow('明确选择 API 工作流');
    await expect(resolveManualImageRouting({
      profileRepository,
      credentialRepository,
      profileId: comfy.profileId,
      workflowTemplateId: workflow.workflowTemplateId
    })).resolves.toMatchObject({ profile: comfy, workflow });
  });
});
