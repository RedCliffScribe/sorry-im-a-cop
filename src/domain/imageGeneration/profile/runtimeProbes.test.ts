import { describe, expect, it, vi } from 'vitest';
import { IMAGE_PROVIDER_TYPES } from '../probe';
import { createDefaultImageApiProfile } from './defaults';
import { createComfyWorkflowHash } from './fingerprints';
import { prepareImageGenerationProbe } from './generationExecution';
import { runImageLocalValidationProbe, validateImageProfileLocally } from './localValidation';
import { runImageMetadataProbe } from './metadataProbe';
import type {
  ComfyWorkflowTemplate,
  ImageApiCredential,
  ImageApiProfile
} from './types';

const NOW = '2026-07-23T00:00:00.000Z';

function credentialFor(profile: ImageApiProfile): ImageApiCredential | undefined {
  if (profile.providerType === 'comfyui-workflow' || profile.providerType === 'sd-webui') return undefined;
  return {
    credentialId: `credential-${profile.providerType}`,
    label: '测试凭据',
    providerAffinity: profile.providerType,
    material: profile.providerType === 'gemini-image'
      ? { kind: 'api-key-header', apiKey: 'secret-gemini' }
      : { kind: 'bearer-token', token: `secret-${profile.providerType}` },
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW
  };
}

function configuredProfile(providerType: (typeof IMAGE_PROVIDER_TYPES)[number], index = 0): ImageApiProfile {
  const profile = createDefaultImageApiProfile(providerType, `profile-${providerType}`, NOW);
  profile.enabled = true;
  const credential = credentialFor(profile);
  if (credential) profile.credentialId = credential.credentialId;
  if ('models' in profile) {
    profile.models = [{ modelId: `model-${index}`, source: 'manual' }];
    profile.defaultModelId = `model-${index}`;
  }
  if (profile.providerType === 'novelai-image') profile.config.usageNoticeAcceptedAt = NOW;
  return profile;
}

async function comfyWorkflow(): Promise<ComfyWorkflowTemplate> {
  const apiWorkflow = {
    '1': { class_type: 'Text', inputs: { text: '' } },
    '2': { class_type: 'KSampler', inputs: { denoise: 0.55 } },
    '9': { class_type: 'SaveImage', inputs: {} }
  };
  const bindings = { positivePrompt: { nodeId: '1', inputName: 'text' } };
  const exposedParameters = [{
    key: 'denoise',
    label: '重绘幅度',
    binding: { nodeId: '2', inputName: 'denoise' },
    valueType: 'number' as const,
    min: 0,
    max: 1,
    step: 0.01
  }];
  const outputNodeIds = ['9'];
  return {
    workflowTemplateId: 'workflow',
    name: '测试工作流',
    apiWorkflow,
    workflowHash: await createComfyWorkflowHash({ apiWorkflow, bindings, exposedParameters, outputNodeIds }),
    bindings,
    exposedParameters,
    outputNodeIds,
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW
  };
}

describe('runtime image profile probes', () => {
  it('fails locally on missing credentials without sending metadata requests', async () => {
    const profile = configuredProfile('openai-images');
    const fetchMock = vi.fn();

    const local = await validateImageProfileLocally(profile, undefined, 'https://game.pages.dev');
    const metadata = await runImageMetadataProbe(profile, undefined, { fetch: fetchMock, pageUrl: 'https://game.pages.dev' });

    expect(local.ok).toBe(false);
    expect(local.issues).toContain('档案引用的本机凭据不存在。');
    expect(metadata.status).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks unsupported low-cost probes honestly instead of claiming connection success', async () => {
    const profile = configuredProfile('novelai-image');
    const credential = credentialFor(profile);
    const fetchMock = vi.fn();

    const result = await runImageMetadataProbe(profile, credential, { fetch: fetchMock });

    expect(result.status).toBe('unsupported');
    expect(result.safeMessage).toMatch(/不代表连接失败/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses provider-specific auth for metadata and reports partial endpoint evidence as warning', async () => {
    const openAi = configuredProfile('openai-images');
    const openAiCredential = credentialFor(openAi);
    const openAiFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-openai-images');
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const openAiResult = await runImageMetadataProbe(openAi, openAiCredential, { fetch: openAiFetch });
    expect(openAiResult.status).toBe('passed');
    expect(openAiResult.safeMessage).not.toContain('secret-openai-images');

    const sd = configuredProfile('sd-webui');
    let calls = 0;
    const sdResult = await runImageMetadataProbe(sd, undefined, {
      fetch: vi.fn(async () => new Response('{}', { status: calls++ === 0 ? 200 : 503 }))
    });
    expect(sdResult.status).toBe('warning');
    expect(sdResult.safeMessage).toMatch(/元数据结果不能证明图片生成可用/);
  });

  it('prepares strict adapter inputs and isolated execution fingerprints for all seven backends', async () => {
    const prepared = [];
    for (const [index, providerType] of IMAGE_PROVIDER_TYPES.entries()) {
      const profile = configuredProfile(providerType, index);
      const credential = credentialFor(profile);
      const target = providerType === 'comfyui-workflow'
        ? { presetRevision: 1, workflowTemplate: await comfyWorkflow(), width: 512, height: 512 }
        : { presetRevision: 1, modelId: `model-${index}`, width: 512, height: 512 };
      const execution = await prepareImageGenerationProbe(profile, credential, target);
      const validation = await execution.adapter.validate({
        prompt: 'neutral test image',
        profile: execution.profile,
        credential: execution.credential
      });
      expect(validation).toEqual({ ok: true });
      expect(execution.adapter.providerType).toBe(providerType);
      prepared.push(execution.executionFingerprint);
    }
    expect(new Set(prepared).size).toBe(IMAGE_PROVIDER_TYPES.length);
  });

  it('honors the OpenAI-compatible result transport preference in the submitted request profile', async () => {
    const profile = configuredProfile('openai-images');
    if (profile.providerType !== 'openai-images') throw new Error('test profile mismatch');
    profile.config.resultTransportPreference = 'base64-json';

    const prepared = await prepareImageGenerationProbe(profile, credentialFor(profile), {
      presetRevision: 1,
      modelId: 'model-0'
    });

    expect(prepared.profile).toMatchObject({ responseFormat: 'b64_json' });
  });

  it('requires fresh runtime evidence when generation dimensions change', async () => {
    const profile = configuredProfile('sd-webui', 6);
    const portrait = await prepareImageGenerationProbe(profile, undefined, {
      presetId: 'character-half-body', presetRevision: 1, modelId: 'model-6', width: 768, height: 1024
    });
    const fullBody = await prepareImageGenerationProbe(profile, undefined, {
      presetId: 'character-full-body', presetRevision: 1, modelId: 'model-6', width: 576, height: 1024
    });

    expect(fullBody.executionFingerprint).not.toBe(portrait.executionFingerprint);
  });

  it('resolves declared ComfyUI player parameters into adapter inputs and fingerprints their values', async () => {
    const profile = configuredProfile('comfyui-workflow');
    const workflow = await comfyWorkflow();
    const first = await prepareImageGenerationProbe(profile, undefined, {
      presetRevision: 1,
      workflowTemplate: workflow,
      workflowParameterOverrides: { denoise: 0.48 }
    });
    const second = await prepareImageGenerationProbe(profile, undefined, {
      presetRevision: 1,
      workflowTemplate: workflow,
      workflowParameterOverrides: { denoise: 0.35 }
    });

    expect(first.profile).toMatchObject({
      parameterOverrides: [{
        key: 'denoise',
        binding: { nodeId: '2', inputName: 'denoise' },
        value: 0.48
      }]
    });
    expect(second.executionFingerprint).not.toBe(first.executionFingerprint);
    await expect(prepareImageGenerationProbe(profile, undefined, {
      presetRevision: 1,
      workflowTemplate: workflow,
      workflowParameterOverrides: { hiddenNodeInput: 1 }
    })).rejects.toThrow('没有对应的开放参数声明');
  });

  it('refuses unknown models and ComfyUI probes without a workflow before any provider request', async () => {
    const openAi = configuredProfile('openai-images');
    await expect(prepareImageGenerationProbe(openAi, credentialFor(openAi), {
      presetRevision: 1,
      modelId: 'unknown'
    })).rejects.toThrow(/模型必须先存在/);

    const comfy = configuredProfile('comfyui-workflow');
    await expect(prepareImageGenerationProbe(comfy, undefined, { presetRevision: 1 })).rejects.toThrow(/必须选择 API 工作流/);
  });

  it('warns about final Pages access to HTTP localhost without treating it as a local shape failure', async () => {
    const comfy = configuredProfile('comfyui-workflow');
    const result = await validateImageProfileLocally(comfy, undefined, 'https://game.pages.dev/play');
    const record = await runImageLocalValidationProbe(comfy, undefined, {
      pageUrl: 'https://game.pages.dev/play',
      createId: () => 'local-probe',
      now: () => new Date(NOW)
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringMatching(/混合内容/),
      expect.stringMatching(/Local Network Access/)
    ]));
    expect(record).toMatchObject({ probeId: 'local-probe', status: 'warning', kind: 'local-validation' });
  });
});
