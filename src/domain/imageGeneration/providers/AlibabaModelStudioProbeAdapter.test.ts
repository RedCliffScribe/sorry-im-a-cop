import { describe, expect, it, vi } from 'vitest';
import { AlibabaModelStudioProbeAdapter } from './AlibabaModelStudioProbeAdapter';
import {
  createProviderTestContext,
  imageResponse,
  jsonResponse,
  requestBody,
  requestHeaders
} from './providerTestUtils';

function profile(protocolVariant: 'multimodal-generation-sync' | 'image-generation-async' | 'legacy-text2image-async') {
  return {
    apiBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    model: 'wan2.6-t2i',
    protocolVariant,
    size: '1280*720',
    n: 1,
    seed: 7,
    watermark: false,
    promptExtend: true,
    thinkingMode: false,
    pollIntervalMs: 0,
    maxPollAttempts: 3
  } as const;
}

describe('AlibabaModelStudioProbeAdapter', () => {
  it('handles the synchronous multimodal choices response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        request_id: 'req-sync',
        output: { choices: [{ message: { content: [
          { image: 'https://cdn.example/sync-1.png' },
          { image: 'https://cdn.example/sync-2.png' }
        ] } }] }
      }))
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse());
    const context = createProviderTestContext(fetchMock);
    const result = await new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'police station',
      negativePrompt: 'blur',
      profile: { ...profile('multimodal-generation-sync'), n: 2 },
      credential: { apiKey: 'ali-key' }
    }, context);

    expect(result.images).toHaveLength(2);
    expect(result.providerRequestId).toBe('req-sync');
    expect(context.remoteTaskIds).toEqual(['req-sync']);
    expect(fetchMock.mock.calls[0][0]).toContain('/services/aigc/multimodal-generation/generation');
    expect(requestHeaders(fetchMock.mock.calls[0]).has('X-DashScope-Async')).toBe(false);
    expect(requestHeaders(fetchMock.mock.calls[1]).has('Authorization')).toBe(false);
    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      model: 'wan2.6-t2i',
      parameters: {
        n: 2, negative_prompt: 'blur', seed: 7, watermark: false,
        prompt_extend: true, thinking_mode: false
      }
    });
  });

  it('polls the modern asynchronous protocol once per bounded attempt and never resubmits', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'task-modern', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'task-modern', task_status: 'RUNNING' } }))
      .mockResolvedValueOnce(jsonResponse({
        output: { task_id: 'task-modern', task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example/modern.png' }] }
      }))
      .mockResolvedValueOnce(imageResponse());
    const context = createProviderTestContext(fetchMock);
    const result = await new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: profile('image-generation-async'),
      credential: { apiKey: 'ali-key' }
    }, context);

    expect(result.providerRequestId).toBe('task-modern');
    expect(context.remoteTaskIds).toContain('task-modern');
    expect(result.images).toHaveLength(1);
    expect(context.wait).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter((call) => (call[1] as RequestInit).method === 'POST')).toHaveLength(1);
    expect(requestHeaders(fetchMock.mock.calls[0]).get('X-DashScope-Async')).toBe('enable');
  });

  it('supports legacy async results and rejects a changed task id', async () => {
    const legacyFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'legacy', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(jsonResponse({
        output: { task_id: 'legacy', task_status: 'SUCCEEDED', results: [{ url: 'https://cdn.example/legacy.png' }] }
      }))
      .mockResolvedValueOnce(imageResponse());
    await new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: profile('legacy-text2image-async'),
      credential: { apiKey: 'ali-key' }
    }, createProviderTestContext(legacyFetch));
    expect(legacyFetch.mock.calls[0][0]).toContain('/services/aigc/text2image/image-synthesis');
    expect(requestBody(legacyFetch.mock.calls[0])).toMatchObject({ input: { prompt: 'street' } });

    const mismatchFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'expected', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'other', task_status: 'RUNNING' } }));
    await expect(new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: profile('image-generation-async'),
      credential: { apiKey: 'ali-key' }
    }, createProviderTestContext(mismatchFetch))).rejects.toMatchObject({ code: 'alibaba-task-id-mismatch' });
  });

  it('bounds timeouts, surfaces terminal failures, and stops immediately on cancellation', async () => {
    const timeoutFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'timeout', task_status: 'PENDING' } }))
      .mockImplementation(async () => jsonResponse({ output: { task_id: 'timeout', task_status: 'RUNNING' } }));
    await expect(new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: { ...profile('image-generation-async'), maxPollAttempts: 2 },
      credential: { apiKey: 'ali-key' }
    }, createProviderTestContext(timeoutFetch))).rejects.toMatchObject({ code: 'alibaba-poll-timeout' });
    expect(timeoutFetch.mock.calls.filter((call) => (call[1] as RequestInit).method === 'POST')).toHaveLength(1);

    const failedFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'failed', task_status: 'PENDING' } }))
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'failed', task_status: 'FAILED', message: 'policy' } }));
    await expect(new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: profile('image-generation-async'),
      credential: { apiKey: 'ali-key' }
    }, createProviderTestContext(failedFetch))).rejects.toMatchObject({ code: 'alibaba-task-failed' });

    const controller = new AbortController();
    const cancelFetch = vi.fn().mockResolvedValueOnce(jsonResponse({ output: { task_id: 'cancel', task_status: 'PENDING' } }));
    const context = createProviderTestContext(cancelFetch, controller.signal);
    context.wait = vi.fn(async () => { controller.abort(); });
    await expect(new AlibabaModelStudioProbeAdapter().generate({
      prompt: 'street',
      profile: profile('image-generation-async'),
      credential: { apiKey: 'ali-key' }
    }, context)).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelFetch).toHaveBeenCalledTimes(1);
  });
});
