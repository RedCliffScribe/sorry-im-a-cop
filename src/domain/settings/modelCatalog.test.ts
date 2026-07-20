import { describe, expect, it, vi } from 'vitest';
import { fetchAvailableModels } from './modelCatalog';

describe('fetchAvailableModels', () => {
  it('loads OpenAI-compatible model ids from /models', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: 'gemini-3.1-pro-preview' }, { id: 'gemini-3.1-flash' }]
      })
    })) as unknown as typeof fetch;

    const models = await fetchAvailableModels({
      interfaceType: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      fetchImpl: fetchMock
    });

    expect(models).toEqual(['gemini-3.1-pro-preview', 'gemini-3.1-flash']);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      headers: { Authorization: 'Bearer sk-test' }
    });
  });

  it('loads Gemini model names and strips the models prefix', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [{ name: 'models/gemini-2.5-pro' }, { name: 'models/gemini-2.5-flash' }]
      })
    })) as unknown as typeof fetch;

    const models = await fetchAvailableModels({
      interfaceType: 'google-gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'gemini-key',
      fetchImpl: fetchMock
    });

    expect(models).toEqual(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(fetchMock).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models?key=gemini-key', {
      headers: {}
    });
  });

  it('throws a readable error when the provider rejects the request', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid api key'
    })) as unknown as typeof fetch;

    await expect(
      fetchAvailableModels({
        interfaceType: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'bad-key',
        fetchImpl: fetchMock
      })
    ).rejects.toThrow('模型列表获取失败：401 invalid api key');
  });
});
