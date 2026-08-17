import { describe, expect, it, vi } from 'vitest';
import { GeminiImageProbeAdapter } from './GeminiImageProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { XaiImagesProbeAdapter } from './XaiImagesProbeAdapter';
import {
  createProviderTestContext,
  imageResponse,
  jsonResponse,
  requestBody,
  requestHeaders,
  TEST_JPEG_BASE64,
  TEST_PNG_BASE64
} from './providerTestUtils';

describe('OpenAI-family image probe adapters', () => {
  it('normalizes multiple OpenAI base64 images and sends only frozen fields', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      id: 'request-1',
      data: [{ b64_json: TEST_PNG_BASE64 }, { b64_json: TEST_PNG_BASE64 }]
    }));
    const context = createProviderTestContext(fetchMock);
    const adapter = new OpenAiImagesProbeAdapter();

    const result = await adapter.generate({
      prompt: 'detective',
      negativePrompt: 'blur',
      profile: {
        apiBaseUrl: 'https://api.openai.com/v1',
        model: 'gpt-image-1',
        n: 2,
        responseFormat: 'b64_json',
        size: '1024x1024',
        quality: 'high',
        outputFormat: 'png',
        outputCompression: 80,
        background: 'opaque'
      },
      credential: { apiKey: 'openai-secret' }
    }, context);

    expect(result.images).toHaveLength(2);
    expect(result.providerRequestId).toBe('request-1');
    expect(context.remoteTaskIds).toEqual(['request-1']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/generations');
    expect(requestHeaders(fetchMock.mock.calls[0]).get('Authorization')).toBe('Bearer openai-secret');
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      model: 'gpt-image-1',
      prompt: 'detective\n\nConstraints:\nDo not include or contradict any of the following: blur',
      n: 2,
      response_format: 'b64_json',
      size: '1024x1024',
      quality: 'high',
      output_format: 'png',
      output_compression: 80,
      background: 'opaque'
    });
  });

  it('downloads OpenAI URLs without credentials and keeps xAI image bytes in the first response', async () => {
    const openAiFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [{ url: 'https://cdn.example/openai.png' }] }))
      .mockResolvedValueOnce(imageResponse());
    await new OpenAiImagesProbeAdapter().generate({
      prompt: 'scene',
      profile: { apiBaseUrl: 'https://api.example/v1', model: 'image', n: 1 },
      credential: { apiKey: 'openai-key' }
    }, createProviderTestContext(openAiFetch));
    expect(requestHeaders(openAiFetch.mock.calls[1]).has('Authorization')).toBe(false);

    const xaiFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ id: 'xai-request-1', data: [
      { b64_json: TEST_JPEG_BASE64 },
      { b64_json: TEST_JPEG_BASE64 }
    ] }));
    const xaiContext = createProviderTestContext(xaiFetch);
    const result = await new XaiImagesProbeAdapter().generate({
      prompt: 'scene',
      profile: {
        apiBaseUrl: 'https://api.x.ai/v1',
        model: 'grok-imagine-image',
        n: 2,
        aspectRatio: '16:9',
        resolution: '2k'
      },
      credential: { apiKey: 'xai-key' }
    }, xaiContext);
    expect(result.images).toHaveLength(2);
    expect(result.images.every((image) => image.mimeType === 'image/jpeg')).toBe(true);
    expect(result.providerRequestId).toBe('xai-request-1');
    expect(xaiContext.remoteTaskIds).toEqual(['xai-request-1']);
    expect(requestBody(xaiFetch.mock.calls[0])).toEqual({
      model: 'grok-imagine-image',
      prompt: 'scene',
      n: 2,
      response_format: 'b64_json',
      aspect_ratio: '16:9',
      resolution: '2k'
    });
    expect(xaiFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a response request id before a later image normalization failure', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'request-before-failure', data: [] }));
    const context = createProviderTestContext(fetchMock);

    await expect(new OpenAiImagesProbeAdapter().generate({
      prompt: 'neutral object',
      profile: { apiBaseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', n: 1 },
      credential: { apiKey: 'openai-secret' }
    }, context)).rejects.toMatchObject({ code: 'provider-no-image' });

    expect(context.remoteTaskIds).toEqual(['request-before-failure']);
  });
});

describe('Gemini image probe adapter', () => {
  it('uses non-stored Interactions requests and parses REST model-output image blocks', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      id: 'interaction-1',
      steps: [{ type: 'model_output', content: [
        { type: 'image', data: TEST_PNG_BASE64, mime_type: 'image/png' },
        { type: 'image', data: TEST_PNG_BASE64, mime_type: 'image/png' }
      ] }]
    }));
    const adapter = new GeminiImageProbeAdapter();
    const context = createProviderTestContext(fetchMock);
    const result = await adapter.generate({
      prompt: 'rainy street',
      negativePrompt: 'watermark',
      profile: {
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-3-pro-image-preview',
        apiMode: 'interactions',
        aspectRatio: '16:9',
        imageSize: '0.5K',
        mimeType: 'image/png'
      },
      credential: { apiKey: 'gemini-key' }
    }, context);

    expect(result.images).toHaveLength(2);
    expect(result.providerRequestId).toBe('interaction-1');
    expect(context.remoteTaskIds).toEqual(['interaction-1']);
    expect(requestHeaders(fetchMock.mock.calls[0]).get('x-goog-api-key')).toBe('gemini-key');
    expect(requestBody(fetchMock.mock.calls[0])).toEqual({
      model: 'gemini-3-pro-image-preview',
      input: [{
        type: 'text',
        text: 'rainy street\n\nAvoid the following visual elements or contradictions: watermark'
      }],
      response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '16:9', image_size: '0.5K' },
      store: false
    });
  });

  it('supports legacy generateContent inlineData without merging its protocol verdict', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      candidates: [{ content: { parts: [{ inlineData: { data: TEST_PNG_BASE64, mimeType: 'image/png' } }] } }]
    }));
    const result = await new GeminiImageProbeAdapter().generate({
      prompt: 'portrait',
      profile: {
        apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-2.5-flash-image',
        apiMode: 'generate-content-legacy',
        mimeType: 'image/png'
      },
      credential: { apiKey: 'gemini-key' }
    }, createProviderTestContext(fetchMock));

    expect(result.images).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-2.5-flash-image:generateContent');
  });

});
