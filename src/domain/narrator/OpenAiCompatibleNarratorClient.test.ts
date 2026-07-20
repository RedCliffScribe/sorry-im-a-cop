import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleNarratorClient } from './OpenAiCompatibleNarratorClient';

describe('OpenAiCompatibleNarratorClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a stalled request after the default 120 second timeout', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    const rejection = expect(client.complete('prompt')).rejects.toThrow('接口响应超时');
    await vi.advanceTimersByTimeAsync(119_999);
    const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(requestInit.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    vi.useRealTimers();
  });

  it('does not report an external cancellation as a request timeout', async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });
    const controller = new AbortController();

    const pending = client.complete('prompt', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.not.toThrow('接口响应超时');
  });

  it('posts chat completions and parses JSON content', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"narrativeText":"开局正文","suggestedActions":["观察报案室"]}'
              }
            }
          ]
        })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'sk-test',
      model: 'story-model',
      maxTokens: 4096,
      temperature: 0.7,
      fetchImpl
    });

    const result = await client.complete('请生成开局');

    expect(result).toEqual({
      narrativeText: '开局正文',
      suggestedActions: ['观察报案室']
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json'
        })
      })
    );
    const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.model).toBe('story-model');
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.7);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages.at(-1).content).toBe('请生成开局');
  });

  it('parses fenced JSON when a provider wraps the response', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '```json\n{"narrativeText":"开局"}\n```' } }]
        })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt')).resolves.toEqual({ narrativeText: '开局' });
  });

  it('uses player-facing wording when the main story service returns no content', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '' } }] })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt')).rejects.toThrow('主剧情服务没有返回可解析内容。');
  });

  it('uses player-facing wording when the main story request fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }));
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt')).rejects.toThrow('主剧情服务请求失败：502 Bad Gateway bad gateway');
  });

  it('repairs syntax-only JSON mistakes from providers that ignore strict JSON mode', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"narrativeText":"开局正文","suggestedActions":["观察报案室" "询问值日官"]}'
              }
            }
          ]
        })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt')).resolves.toEqual({
      narrativeText: '开局正文',
      suggestedActions: ['观察报案室', '询问值日官']
    });
  });

  it('parses the first complete JSON object when a provider appends extra fragments', async () => {
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"narrativeText":"opening","suggestedActions":["look around"]}\n[{"ignored":true}]'
              }
            }
          ]
        })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt')).resolves.toEqual({
      narrativeText: 'opening',
      suggestedActions: ['look around']
    });
  });

  it('still passes the raw model text to diagnostics when JSON parsing fails', async () => {
    const malformedContent = '{"narrativeText":"开局正文","suggestedActions":["观察报案室"';
    const fetchImpl = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: malformedContent } }]
        })
      } as Response;
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });
    const rawTexts: string[] = [];

    await expect(client.complete('prompt', { onRawText: (rawText) => rawTexts.push(rawText) })).rejects.toThrow(
      /有效 JSON/
    );
    expect(rawTexts).toEqual([malformedContent]);
  });

  it('streams OpenAI-compatible deltas as narrative text before returning parsed JSON', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"{\\"narrativeText\\":\\"流式"}}]}\n\n')
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"正文\\",\\"suggestedActions\\":[\\"观察报案室\\"]}"}}]}\n\n'
          )
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 }));
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });
    const deltas: string[] = [];

    const result = await (
      client as unknown as {
        complete(prompt: string, options: { onTextDelta: (delta: string) => void }): Promise<unknown>;
      }
    ).complete('prompt', {
      onTextDelta: (delta) => deltas.push(delta)
    });

    expect(result).toEqual({
      narrativeText: '流式正文',
      suggestedActions: ['观察报案室']
    });
    expect(deltas.join('')).toBe('流式正文');
    const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({ stream: true });
  });

  it('accepts streamed message content from OpenAI-compatible providers that do not use delta content', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"message":{"content":"{\\"narrativeText\\":\\"兼容正文\\",\\"suggestedActions\\":[\\"继续巡逻\\"]}"}}]}\n\n'
          )
        );
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    const fetchImpl = vi.fn(async () => new Response(stream, { status: 200 }));
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt', { onTextDelta: vi.fn() })).resolves.toEqual({
      narrativeText: '兼容正文',
      suggestedActions: ['继续巡逻']
    });
  });

  it('falls back to a non-streaming request when a compatible provider returns an empty stream', async () => {
    const encoder = new TextEncoder();
    const emptyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(emptyStream, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"narrativeText":"重试正文","suggestedActions":["继续巡逻"]}'
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await expect(client.complete('prompt', { onTextDelta: vi.fn() })).resolves.toEqual({
      narrativeText: '重试正文',
      suggestedActions: ['继续巡逻']
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ stream: true });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).not.toHaveProperty('stream');
  });

  it('falls back to a non-streaming request when streamed JSON is truncated', async () => {
    const encoder = new TextEncoder();
    const truncatedStream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"{\\"narrativeText\\":\\"半截正文\\","}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(truncatedStream, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"narrativeText":"完整正文","suggestedActions":["继续巡逻"]}'
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });
    const rawTexts: string[] = [];

    await expect(
      client.complete('prompt', {
        onTextDelta: vi.fn(),
        onRawText: (rawText) => rawTexts.push(rawText)
      })
    ).resolves.toEqual({
      narrativeText: '完整正文',
      suggestedActions: ['继续巡逻']
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(rawTexts).toEqual(['完整正文'].map((text) => `{"narrativeText":"${text}","suggestedActions":["继续巡逻"]}`));
  });
});
