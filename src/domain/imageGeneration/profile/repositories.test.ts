import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDefaultImageApiProfile } from './defaults';
import { createComfyWorkflowHash, createConnectionFingerprint } from './fingerprints';
import { IndexedDbImageCredentialRepository } from './IndexedDbImageCredentialRepository';
import { IndexedDbImageProfileRepository } from './IndexedDbImageProfileRepository';
import type { ComfyWorkflowTemplate, ImageApiCredential } from './types';

const NOW = '2026-07-23T00:00:00.000Z';

describe('independent image profile and credential repositories', () => {
  it('round-trips strict profiles and API workflow templates', async () => {
    const repository = new IndexedDbImageProfileRepository(`image-profile-test-${crypto.randomUUID()}`);
    const profile = createDefaultImageApiProfile('comfyui-workflow', 'profile-comfy', NOW);
    const apiWorkflow = {
      '1': { class_type: 'Text', inputs: { text: '' } },
      '9': { class_type: 'SaveImage', inputs: {} }
    };
    const bindings = { positivePrompt: { nodeId: '1', inputName: 'text' } };
    const outputNodeIds = ['9'];
    const template: ComfyWorkflowTemplate = {
      workflowTemplateId: 'workflow-1',
      name: '最小测试工作流',
      apiWorkflow,
      workflowHash: await createComfyWorkflowHash({ apiWorkflow, bindings, outputNodeIds }),
      bindings,
      outputNodeIds,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW
    };

    await repository.putProfile(profile);
    await repository.putWorkflowTemplate(template);
    await repository.putProfileProbeResult({
      probeId: 'local-probe',
      profileId: profile.profileId,
      kind: 'local-validation',
      status: 'warning',
      connectionFingerprint: await createConnectionFingerprint(profile),
      startedAt: NOW,
      completedAt: NOW,
      safeMessage: '字段有效；仍需浏览器验证。'
    });

    expect(await repository.listProfiles()).toEqual([profile]);
    expect(await repository.getWorkflowTemplate('workflow-1')).toEqual(template);
    expect(await repository.listProfileProbeResults(profile.profileId)).toHaveLength(1);
    await repository.clearProfileProbeResults(profile.profileId);
    await repository.deleteProfile(profile.profileId);
    await repository.deleteWorkflowTemplate(template.workflowTemplateId);
    expect(await repository.listProfiles()).toEqual([]);
    expect(await repository.listWorkflowTemplates()).toEqual([]);
    expect(await repository.listProfileProbeResults(profile.profileId)).toEqual([]);

    await repository.putProfile(profile);
    await repository.putWorkflowTemplate(template);
    await repository.clearAll();
    expect(await repository.listProfiles()).toEqual([]);
    expect(await repository.listWorkflowTemplates()).toEqual([]);
  });

  it('returns only masked summaries while resolving secrets through the credential boundary', async () => {
    const repository = new IndexedDbImageCredentialRepository(`image-credential-test-${crypto.randomUUID()}`);
    const credential: ImageApiCredential = {
      credentialId: 'credential-openai',
      label: 'OpenAI Key',
      providerAffinity: 'openai-images',
      material: { kind: 'api-key-header', apiKey: 'super-secret-1234' },
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW
    };

    await repository.putCredential(credential);
    const summaries = await repository.listCredentialSummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      credentialId: 'credential-openai',
      materialKind: 'api-key-header',
      maskedHint: '••••1234'
    });
    expect(JSON.stringify(summaries)).not.toContain('super-secret');
    expect(await repository.resolveCredential('credential-openai')).toEqual(credential);

    await repository.putCredential({
      ...credential,
      material: { kind: 'api-key-header', apiKey: 'rotated-5678' },
      revision: 2,
      updatedAt: '2026-07-23T01:00:00.000Z'
    });
    expect(await repository.getCredentialSummary('credential-openai')).toMatchObject({ revision: 2, maskedHint: '••••5678' });
    await repository.deleteCredential('credential-openai');
    expect(await repository.resolveCredential('credential-openai')).toBeNull();
    await repository.putCredential(credential);
    await repository.clearAll();
    expect(await repository.listCredentialSummaries()).toEqual([]);
  });

  it('rejects workflow bindings that do not exist in the immutable API workflow', async () => {
    const repository = new IndexedDbImageProfileRepository(`image-workflow-invalid-${crypto.randomUUID()}`);
    const apiWorkflow = { '1': { class_type: 'Text', inputs: { text: '' } } };
    await expect(repository.putWorkflowTemplate({
      workflowTemplateId: 'workflow-invalid',
      name: '无效工作流',
      apiWorkflow,
      workflowHash: await createComfyWorkflowHash({
        apiWorkflow,
        bindings: { positivePrompt: { nodeId: 'missing', inputName: 'text' } },
        outputNodeIds: ['1']
      }),
      bindings: { positivePrompt: { nodeId: 'missing', inputName: 'text' } },
      outputNodeIds: ['1'],
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW
    })).rejects.toThrow(/节点 missing 不存在/);
  });
});
