import { describe, expect, it, vi } from 'vitest';
import type { ImageGenerationProbeAdapter, ImageProbeGenerationInput } from '../probe';
import { AlibabaModelStudioProbeAdapter } from './AlibabaModelStudioProbeAdapter';
import { ComfyUiWorkflowProbeAdapter } from './ComfyUiWorkflowProbeAdapter';
import { GeminiImageProbeAdapter } from './GeminiImageProbeAdapter';
import { NovelAiImageProbeAdapter } from './NovelAiImageProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { createProviderTestContext } from './providerTestUtils';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';
import { XaiImagesProbeAdapter } from './XaiImagesProbeAdapter';

interface ProviderFailureFixture {
  name: string;
  adapter: ImageGenerationProbeAdapter;
  input: ImageProbeGenerationInput;
  secret: string;
}

function createFailureFixtures(): ProviderFailureFixture[] {
  const cloudSecret = 'provider-super-secret-value';
  return [
    {
      name: 'OpenAI',
      adapter: new OpenAiImagesProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: { apiBaseUrl: 'https://openai.example/v1', model: 'image', n: 1 },
        credential: { apiKey: cloudSecret }
      },
      secret: cloudSecret
    },
    {
      name: 'xAI',
      adapter: new XaiImagesProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: { apiBaseUrl: 'https://xai.example/v1', model: 'image', n: 1 },
        credential: { apiKey: cloudSecret }
      },
      secret: cloudSecret
    },
    {
      name: 'Gemini',
      adapter: new GeminiImageProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: {
          apiBaseUrl: 'https://gemini.example/v1beta',
          model: 'gemini-image',
          apiMode: 'interactions'
        },
        credential: { apiKey: cloudSecret }
      },
      secret: cloudSecret
    },
    {
      name: 'Alibaba',
      adapter: new AlibabaModelStudioProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: {
          apiBaseUrl: 'https://alibaba.example/api/v1',
          model: 'wan',
          protocolVariant: 'multimodal-generation-sync',
          n: 1,
          pollIntervalMs: 0,
          maxPollAttempts: 1
        },
        credential: { apiKey: cloudSecret }
      },
      secret: cloudSecret
    },
    {
      name: 'NovelAI',
      adapter: new NovelAiImageProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: {
          apiBaseUrl: 'https://novelai.example',
          model: 'nai',
          responseFormat: 'json-base64',
          width: 512,
          height: 512,
          nSamples: 1
        },
        credential: { apiKey: cloudSecret }
      },
      secret: cloudSecret
    },
    {
      name: 'ComfyUI',
      adapter: new ComfyUiWorkflowProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: {
          apiBaseUrl: 'https://comfy.example',
          deployment: 'core-server',
          authMode: 'basic-auth',
          workflow: {
            '1': { class_type: 'Text', inputs: { text: '' } },
            '9': { class_type: 'Output', inputs: {} }
          },
          bindings: { positivePrompt: { nodeId: '1', inputName: 'text' } },
          outputNodeIds: ['9'],
          pollIntervalMs: 0,
          maxPollAttempts: 1
        },
        credential: { mode: 'basic', username: 'user', password: 'local-super-secret-value' }
      },
      secret: 'local-super-secret-value'
    },
    {
      name: 'SD WebUI',
      adapter: new SdWebUiProbeAdapter(),
      input: {
        prompt: 'scene',
        profile: {
          apiBaseUrl: 'https://sd.example',
          authMode: 'bearer-token',
          width: 512,
          height: 512,
          batchSize: 1
        },
        credential: { mode: 'bearer', token: 'local-super-secret-value' }
      },
      secret: 'local-super-secret-value'
    }
  ];
}

describe('independent provider failure contracts', () => {
  for (const fixture of createFailureFixtures()) {
    it(`${fixture.name} rejects an invalid successful JSON response`, async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      await expect(fixture.adapter.generate(
        fixture.input,
        createProviderTestContext(fetchMock)
      )).rejects.toMatchObject({ code: 'provider-invalid-json' });
    });

    it(`${fixture.name} preserves HTTP status while redacting its own credential`, async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
        error: { message: `credential ${fixture.secret} rejected` }
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      }));

      try {
        await fixture.adapter.generate(fixture.input, createProviderTestContext(fetchMock));
        throw new Error('expected provider failure');
      } catch (error) {
        expect(error).toMatchObject({ code: 'provider-http-401' });
        expect((error as Error).message).not.toContain(fixture.secret);
      }
    });
  }
});
