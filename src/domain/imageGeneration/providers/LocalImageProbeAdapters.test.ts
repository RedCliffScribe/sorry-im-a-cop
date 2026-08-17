import { zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { ComfyUiWorkflowProbeAdapter, createComfyWorkflow } from './ComfyUiWorkflowProbeAdapter';
import { NovelAiImageProbeAdapter } from './NovelAiImageProbeAdapter';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';
import type { ComfyUiProbeProfile } from './providerSchemas';
import {
  createProviderTestContext,
  imageResponse,
  jsonResponse,
  requestBody,
  requestHeaders,
  TEST_PNG_BASE64,
  TEST_PNG_BYTES
} from './providerTestUtils';

const comfyProfile = {
  apiBaseUrl: 'http://127.0.0.1:8188',
  deployment: 'core-server',
  authMode: 'none',
  workflow: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: 'old positive' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative' } },
    '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 6, sampler_name: 'old', scheduler: 'old' } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'old.safetensors' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
    '6': { class_type: 'CustomStyle', inputs: { denoise: 1, enabled: false, method: 'soft' } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'output' } },
    '10': { class_type: 'PreviewImage', inputs: { source: ['9', 0] } }
  },
  bindings: {
    positivePrompt: { nodeId: '1', inputName: 'text' },
    negativePrompt: { nodeId: '2', inputName: 'text' },
    checkpoint: { nodeId: '4', inputName: 'ckpt_name' },
    seed: { nodeId: '3', inputName: 'seed' },
    width: { nodeId: '5', inputName: 'width' },
    height: { nodeId: '5', inputName: 'height' },
    steps: { nodeId: '3', inputName: 'steps' },
    cfg: { nodeId: '3', inputName: 'cfg' },
    sampler: { nodeId: '3', inputName: 'sampler_name' },
    scheduler: { nodeId: '3', inputName: 'scheduler' }
  },
  outputNodeIds: ['9'],
  seed: 42,
  checkpoint: 'new.safetensors',
  width: 768,
  height: 1024,
  steps: 30,
  cfg: 7,
  sampler: 'euler',
  scheduler: 'normal',
  parameterOverrides: [
    { key: 'denoise', binding: { nodeId: '6', inputName: 'denoise' }, value: 0.48 },
    { key: 'enabled', binding: { nodeId: '6', inputName: 'enabled' }, value: true },
    { key: 'method', binding: { nodeId: '6', inputName: 'method' }, value: 'strong' }
  ],
  pollIntervalMs: 0,
  maxPollAttempts: 3
} satisfies ComfyUiProbeProfile;

describe('NovelAiImageProbeAdapter', () => {
  const profile = {
    apiBaseUrl: 'https://image.novelai.net',
    model: 'nai-diffusion-4-full',
    responseFormat: 'auto',
    width: 832,
    height: 1216,
    nSamples: 2,
    steps: 28,
    scale: 6.5,
    cfgRescale: 0.4,
    sampler: 'k_euler',
    seed: 7,
    noiseSchedule: 'native',
    qualityToggle: true,
    undesiredContentPreset: 2,
    smea: true,
    smeaDynamic: false
  } as const;

  it('normalizes JSON multi-image, ZIP multi-image, and direct binary responses', async () => {
    const jsonFetch = vi.fn(async () => new Response(JSON.stringify({ images: [TEST_PNG_BASE64, TEST_PNG_BASE64] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'novel-request-1' }
    }));
    const jsonContext = createProviderTestContext(jsonFetch);
    const jsonResult = await new NovelAiImageProbeAdapter().generate({
      prompt: 'character',
      negativePrompt: 'bad hands',
      profile,
      credential: { apiKey: 'nai-key' }
    }, jsonContext);
    expect(jsonResult.images).toHaveLength(2);
    expect(jsonResult.providerRequestId).toBe('novel-request-1');
    expect(jsonContext.remoteTaskIds).toEqual(['novel-request-1']);
    expect(requestHeaders(jsonFetch.mock.calls[0]).get('Accept')).toContain('binary/octet-stream');
    expect(requestBody(jsonFetch.mock.calls[0])).toEqual({
      input: 'character',
      model: 'nai-diffusion-4-full',
      action: 'generate',
      parameters: {
        params_version: 3,
        width: 832, height: 1216, n_samples: 2, uc: 'bad hands',
        steps: 28, scale: 6.5, cfg_rescale: 0.4, sampler: 'k_euler', seed: 7,
        noise_schedule: 'native', qualityToggle: true, ucPreset: 2, sm: true, sm_dyn: false,
        legacy_v3_extend: false, dynamic_thresholding: false,
        v4_prompt: {
          caption: { base_caption: 'character', char_captions: [] },
          use_coords: false, use_order: true, legacy_uc: false
        },
        v4_negative_prompt: {
          caption: { base_caption: 'bad hands', char_captions: [] },
          use_coords: false, use_order: false, legacy_uc: false
        }
      }
    });

    const zip = zipSync({ 'one.png': TEST_PNG_BYTES, 'two.png': TEST_PNG_BYTES });
    const zipFetch = vi.fn(async () => new Response(zip.slice().buffer, {
      status: 200,
      headers: { 'Content-Type': 'binary/octet-stream' }
    }));
    const zipResult = await new NovelAiImageProbeAdapter().generate({
      prompt: 'character', profile, credential: { apiKey: 'nai-key' }
    }, createProviderTestContext(zipFetch));
    expect(zipResult.images).toHaveLength(2);

    const imageFetch = vi.fn(async () => imageResponse());
    const imageResult = await new NovelAiImageProbeAdapter().generate({
      prompt: 'character', profile, credential: { apiKey: 'nai-key' }
    }, createProviderTestContext(imageFetch));
    expect(imageResult.images).toHaveLength(1);
  });

  it('rejects invalid ZIP responses', async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]).buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/zip' }
    }));
    await expect(new NovelAiImageProbeAdapter().generate({
      prompt: 'character', profile, credential: { apiKey: 'nai-key' }
    }, createProviderTestContext(fetchMock))).rejects.toMatchObject({ code: 'provider-invalid-zip' });
  });
});

describe('ComfyUiWorkflowProbeAdapter', () => {
  it('changes only declared bindings without mutating the saved workflow', () => {
    const before = structuredClone(comfyProfile.workflow);
    const workflow = createComfyWorkflow(comfyProfile, {
      prompt: 'new',
      negativePrompt: 'avoid',
      profile: comfyProfile
    });

    expect(comfyProfile.workflow).toEqual(before);
    expect(workflow['1'].inputs.text).toBe('new');
    expect(workflow['2'].inputs.text).toBe('avoid');
    expect(workflow['3'].inputs.seed).toBe(42);
    expect(workflow['3'].inputs).toMatchObject({ steps: 30, cfg: 7, sampler_name: 'euler', scheduler: 'normal' });
    expect(workflow['4'].inputs.ckpt_name).toBe('new.safetensors');
    expect(workflow['5'].inputs).toMatchObject({ width: 768, height: 1024 });
    expect(workflow['6'].inputs).toEqual({ denoise: 0.48, enabled: true, method: 'strong' });
    expect(workflow['9']).toEqual(before['9']);
  });

  it('polls history and downloads images only from configured output nodes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'prompt-1' }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({
        'prompt-1': {
          status: { completed: true, status_str: 'success' },
          outputs: {
            '9': { images: [
              { filename: 'kept.png', subfolder: 'out', type: 'output' },
              { filename: 'kept-2.png', subfolder: 'out', type: 'output' }
            ] },
            '10': { images: [{ filename: 'ignored.png' }] }
          }
        }
      }))
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse());
    const context = createProviderTestContext(fetchMock);
    const result = await new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'scene', profile: comfyProfile, credential: { mode: 'none' }
    }, context);

    expect(result.images).toHaveLength(2);
    expect(result.providerRequestId).toBe('prompt-1');
    expect(context.wait).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[3][0])).toContain('filename=kept.png');
    expect(String(fetchMock.mock.calls[3][0])).not.toContain('ignored.png');
  });

  it('recovers the output reference from an identical successful history entry when ComfyUI fully caches a rerun', async () => {
    const submittedWorkflow = createComfyWorkflow(comfyProfile, {
      prompt: 'scene',
      profile: comfyProfile,
      credential: { mode: 'none' }
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'cached-rerun' }))
      .mockResolvedValueOnce(jsonResponse({
        'cached-rerun': {
          status: { completed: true, status_str: 'success' },
          outputs: {},
          prompt: [2, 'cached-rerun', submittedWorkflow, {}, ['9']]
        }
      }))
      .mockResolvedValueOnce(jsonResponse({
        'original-run': {
          status: { completed: true, status_str: 'success' },
          outputs: { '9': { images: [{ filename: 'cached-result.png', type: 'output' }] } },
          prompt: [1, 'original-run', submittedWorkflow, {}, ['9']]
        },
        'cached-rerun': {
          status: { completed: true, status_str: 'success' },
          outputs: {},
          prompt: [2, 'cached-rerun', submittedWorkflow, {}, ['9']]
        }
      }))
      .mockResolvedValueOnce(imageResponse());
    const result = await new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'scene',
      profile: comfyProfile,
      credential: { mode: 'none' }
    }, createProviderTestContext(fetchMock));

    expect(result.images).toHaveLength(1);
    expect(String(fetchMock.mock.calls[2][0])).toContain('/history?max_items=20');
    expect(String(fetchMock.mock.calls[3][0])).toContain('filename=cached-result.png');
  });

  it('removes credentials before following an explicit authenticated image redirect', async () => {
    const cloudProfile = {
      ...comfyProfile,
      apiBaseUrl: 'https://cloud.comfy.example',
      deployment: 'comfy-cloud',
      authMode: 'comfy-cloud-api-key'
    } as const;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'cloud-1' }))
      .mockResolvedValueOnce(jsonResponse({
        'cloud-1': { outputs: { '9': { images: [{ filename: 'cloud.png' }] } } }
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { Location: 'https://signed.example/cloud.png' }
      }))
      .mockResolvedValueOnce(imageResponse());
    await new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'scene', profile: cloudProfile, credential: { mode: 'api-key', apiKey: 'cloud-key' }
    }, createProviderTestContext(fetchMock));

    expect(fetchMock.mock.calls[0][0]).toContain('/api/prompt');
    expect(requestHeaders(fetchMock.mock.calls[2]).get('X-API-Key')).toBe('cloud-key');
    expect(requestHeaders(fetchMock.mock.calls[3]).has('X-API-Key')).toBe(false);
    expect((fetchMock.mock.calls[2][1] as RequestInit).redirect).toBe('manual');
  });

  it('fails on completed jobs without configured output and on bounded timeouts', async () => {
    const noImageFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'empty' }))
      .mockResolvedValueOnce(jsonResponse({ empty: { status: { completed: true }, outputs: {} } }))
      .mockResolvedValueOnce(jsonResponse({}));
    await expect(new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'scene', profile: comfyProfile, credential: { mode: 'none' }
    }, createProviderTestContext(noImageFetch))).rejects.toMatchObject({ code: 'comfy-no-configured-output-image' });

    const timeoutFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'waiting' }))
      .mockImplementation(async () => jsonResponse({}));
    await expect(new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'scene',
      profile: { ...comfyProfile, maxPollAttempts: 2 },
      credential: { mode: 'none' }
    }, createProviderTestContext(timeoutFetch))).rejects.toMatchObject({ code: 'comfy-poll-timeout' });
    expect(timeoutFetch.mock.calls.filter((call) => (call[1] as RequestInit).method === 'POST')).toHaveLength(1);
  });
});

describe('SdWebUiProbeAdapter', () => {
  it('sends only the safe core txt2img fields and normalizes all batch images', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ images: [TEST_PNG_BASE64, TEST_PNG_BASE64] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'sd-request-1' }
    }));
    const context = createProviderTestContext(fetchMock);
    const result = await new SdWebUiProbeAdapter().generate({
      prompt: 'scene',
      negativePrompt: 'blur',
      profile: {
        apiBaseUrl: 'http://127.0.0.1:7860',
        authMode: 'basic-auth',
        width: 768,
        height: 512,
        steps: 20,
        cfgScale: 6,
        samplerName: 'Euler',
        scheduler: 'Karras',
        seed: -1,
        batchSize: 2,
        checkpoint: 'model.safetensors',
        clipSkip: 2,
        restoreFaces: true,
        tiling: false,
        hiresFix: { enabled: true, scale: 2, upscaler: 'Latent', secondPassSteps: 10, denoisingStrength: 0.4 }
      },
      credential: { mode: 'basic', username: 'user', password: 'pass' }
    }, context);

    expect(result.images).toHaveLength(2);
    expect(result.providerRequestId).toBe('sd-request-1');
    expect(context.remoteTaskIds).toEqual(['sd-request-1']);
    expect(requestHeaders(fetchMock.mock.calls[0]).get('Authorization')).toMatch(/^Basic /);
    const body = requestBody(fetchMock.mock.calls[0]);
    expect(body).toEqual({
      prompt: 'scene',
      negative_prompt: 'blur',
      width: 768,
      height: 512,
      batch_size: 2,
      steps: 20,
      cfg_scale: 6,
      sampler_name: 'Euler',
      scheduler: 'Karras',
      seed: -1,
      restore_faces: true,
      tiling: false,
      enable_hr: true,
      hr_scale: 2,
      hr_upscaler: 'Latent',
      hr_second_pass_steps: 10,
      denoising_strength: 0.4,
      override_settings: { sd_model_checkpoint: 'model.safetensors', CLIP_stop_at_last_layers: 2 }
    });
    expect(body).not.toHaveProperty('script_name');
    expect(body).not.toHaveProperty('alwayson_scripts');
  });
});
