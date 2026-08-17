import { describe, expect, it, vi } from 'vitest';
import type { ImageProbeReferenceImage } from '../probe';
import { AlibabaModelStudioProbeAdapter } from './AlibabaModelStudioProbeAdapter';
import { ComfyUiWorkflowProbeAdapter } from './ComfyUiWorkflowProbeAdapter';
import { GeminiImageProbeAdapter } from './GeminiImageProbeAdapter';
import { NovelAiImageProbeAdapter } from './NovelAiImageProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';
import { XaiImagesProbeAdapter } from './XaiImagesProbeAdapter';
import {
  createProviderTestContext,
  imageResponse,
  jsonResponse,
  requestBody,
  TEST_PNG_BASE64,
  TEST_PNG_BYTES
} from './providerTestUtils';

const reference: ImageProbeReferenceImage = {
  imageId: 'image-reference',
  mimeType: 'image/png',
  bytes: TEST_PNG_BYTES.slice().buffer,
  width: 640,
  height: 960,
  byteLength: TEST_PNG_BYTES.byteLength,
  contentHash: 'a'.repeat(64)
};

describe('typed reference-image provider transports', () => {
  it('uses OpenAI multipart image[] and the edits endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      jsonResponse({ data: [{ b64_json: TEST_PNG_BASE64 }] })
    ));
    await new OpenAiImagesProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'https://api.openai.com/v1',
        apiVariant: 'openai-official',
        model: 'gpt-image-1',
        n: 1
      },
      credential: { apiKey: 'key' }
    }, createProviderTestContext(fetchMock));

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/edits');
    const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.getAll('image[]')).toHaveLength(1);
    expect(form.get('prompt')).toBe('portrait');
  });

  it('uses xAI image.url data URI and the edits endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      jsonResponse({ data: [{ b64_json: TEST_PNG_BASE64 }] })
    ));
    await new XaiImagesProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: { apiBaseUrl: 'https://api.x.ai/v1', model: 'grok-imagine-image', n: 1 },
      credential: { apiKey: 'key' }
    }, createProviderTestContext(fetchMock));

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.x.ai/v1/images/edits');
    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      image: { type: 'image_url', url: `data:image/png;base64,${TEST_PNG_BASE64}` }
    });
  });

  it('places Gemini reference image blocks before the text instruction', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      steps: [{ type: 'model_output', content: [
        { type: 'image', data: TEST_PNG_BASE64, mime_type: 'image/png' }
      ] }]
    }));
    await new GeminiImageProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-3-pro-image-preview',
        apiMode: 'interactions',
        mimeType: 'image/png'
      },
      credential: { apiKey: 'key' }
    }, createProviderTestContext(fetchMock));

    expect(requestBody(fetchMock.mock.calls[0]).input).toEqual([
      { type: 'image', mime_type: 'image/png', data: TEST_PNG_BASE64 },
      { type: 'text', text: 'portrait' }
    ]);
  });

  it('uses Alibaba sync multimodal image content before text', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { results: [{ url: 'https://cdn.example/out.png' }] } }))
      .mockResolvedValueOnce(imageResponse());
    await new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        model: 'qwen-image-edit',
        protocolVariant: 'multimodal-generation-sync',
        n: 1,
        pollIntervalMs: 0,
        maxPollAttempts: 1
      },
      credential: { apiKey: 'key' }
    }, createProviderTestContext(fetchMock));

    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      input: {
        messages: [{
          role: 'user',
          content: [
            { image: `data:image/png;base64,${TEST_PNG_BASE64}` },
            { text: 'portrait' }
          ]
        }]
      }
    });
  });

  it('uses NovelAI Image2Image image, strength and noise fields', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      jsonResponse({ images: [TEST_PNG_BASE64] })
    ));
    await new NovelAiImageProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'https://image.novelai.net',
        model: 'nai-diffusion-4-full',
        responseFormat: 'json-base64',
        width: 832,
        height: 1216,
        nSamples: 1,
        imageToImageStrength: 0.72,
        imageToImageNoise: 0.18
      },
      credential: { apiKey: 'key' }
    }, createProviderTestContext(fetchMock));

    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      parameters: { image: TEST_PNG_BASE64, strength: 0.72, noise: 0.18 }
    });
  });

  it('uploads a ComfyUI input image and writes only the declared workflow binding', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ name: 'server-reference.png' }))
      .mockResolvedValueOnce(jsonResponse({ prompt_id: 'prompt-reference' }))
      .mockResolvedValueOnce(jsonResponse({
        'prompt-reference': {
          outputs: { '9': { images: [{ filename: 'out.png', type: 'output' }] } }
        }
      }))
      .mockResolvedValueOnce(imageResponse());
    await new ComfyUiWorkflowProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'http://127.0.0.1:8188',
        deployment: 'core-server',
        authMode: 'none',
        workflow: {
          '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
          '6': { class_type: 'LoadImage', inputs: { image: 'old.png' } },
          '9': { class_type: 'SaveImage', inputs: {} }
        },
        bindings: {
          positivePrompt: { nodeId: '1', inputName: 'text' },
          referenceImage: { nodeId: '6', inputName: 'image' }
        },
        outputNodeIds: ['9'],
        pollIntervalMs: 0,
        maxPollAttempts: 1
      },
      credential: { mode: 'none' }
    }, createProviderTestContext(fetchMock));

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8188/upload/image');
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      prompt: { '6': { inputs: { image: 'server-reference.png' } } }
    });
  });

  it('uses SD WebUI init_images, denoising strength and img2img endpoint', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      jsonResponse({ images: [TEST_PNG_BASE64] })
    ));
    await new SdWebUiProbeAdapter().generate({
      prompt: 'portrait',
      referenceImages: [reference],
      profile: {
        apiBaseUrl: 'http://127.0.0.1:7860',
        authMode: 'none',
        width: 768,
        height: 1024,
        batchSize: 1,
        imageToImageDenoisingStrength: 0.48
      },
      credential: { mode: 'none' }
    }, createProviderTestContext(fetchMock));

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:7860/sdapi/v1/img2img');
    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      init_images: [`data:image/png;base64,${TEST_PNG_BASE64}`],
      denoising_strength: 0.48
    });
  });
});
