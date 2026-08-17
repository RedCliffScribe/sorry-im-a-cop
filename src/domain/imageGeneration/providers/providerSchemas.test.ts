import { describe, expect, it } from 'vitest';
import { ImageProbeAdapterRegistry, IMAGE_PROVIDER_TYPES } from '../probe';
import { createPhase0ImageProbeAdapters } from '.';
import { ComfyUiWorkflowProbeAdapter } from './ComfyUiWorkflowProbeAdapter';
import { OpenAiImagesProbeAdapter } from './OpenAiImagesProbeAdapter';
import { SdWebUiProbeAdapter } from './SdWebUiProbeAdapter';

describe('strict provider profile contracts', () => {
  it('registers exactly the seven frozen provider adapters independently', () => {
    const registry = new ImageProbeAdapterRegistry(createPhase0ImageProbeAdapters());

    expect(registry.listRegisteredProviderTypes()).toEqual(IMAGE_PROVIDER_TYPES);
    expect(() => registry.assertComplete()).not.toThrow();
  });

  it('rejects arbitrary OpenAI fields and non-HTTP endpoints', () => {
    const adapter = new OpenAiImagesProbeAdapter();
    const arbitrary = adapter.validate({
      prompt: 'scene',
      profile: { apiBaseUrl: 'https://api.example/v1', model: 'image', n: 1, arbitrary: true },
      credential: { apiKey: 'key' }
    });
    const fileUrl = adapter.validate({
      prompt: 'scene',
      profile: { apiBaseUrl: 'file:///tmp', model: 'image', n: 1 },
      credential: { apiKey: 'key' }
    });

    expect(arbitrary).toMatchObject({ ok: false });
    expect(fileUrl).toMatchObject({ ok: false });
  });

  it('requires local auth mode to match credentials and validates Comfy bindings', () => {
    const sd = new SdWebUiProbeAdapter().validate({
      prompt: 'scene',
      profile: {
        apiBaseUrl: 'http://127.0.0.1:7860',
        authMode: 'basic-auth',
        width: 512,
        height: 512,
        batchSize: 1
      },
      credential: { mode: 'none' }
    });
    const comfy = new ComfyUiWorkflowProbeAdapter().validate({
      prompt: 'scene',
      profile: {
        apiBaseUrl: 'http://127.0.0.1:8188',
        deployment: 'core-server',
        authMode: 'none',
        workflow: { '1': { class_type: 'Node', inputs: { text: '' } } },
        bindings: { positivePrompt: { nodeId: 'missing', inputName: 'text' } },
        outputNodeIds: ['missing'],
        pollIntervalMs: 0,
        maxPollAttempts: 1
      },
      credential: { mode: 'none' }
    });

    expect(sd).toMatchObject({ ok: false });
    expect(comfy).toMatchObject({ ok: false });
    if (!comfy.ok) expect(comfy.issues.some((issue) => issue.message.includes('不存在'))).toBe(true);
  });
});
