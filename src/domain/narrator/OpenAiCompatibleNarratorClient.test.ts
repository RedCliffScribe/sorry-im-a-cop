import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NARRATOR_REQUEST_TIMEOUT_MS,
  OpenAiCompatibleNarratorClient
} from './OpenAiCompatibleNarratorClient';

describe('OpenAiCompatibleNarratorClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts a stalled request after the default 600 second timeout', async () => {
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

    const rejection = expect(client.complete('prompt')).rejects.toThrow('接口响应超时（600 秒）。');
    expect(DEFAULT_NARRATOR_REQUEST_TIMEOUT_MS).toBe(600_000);
    await vi.advanceTimersByTimeAsync(599_999);
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

  it('uses OpenAI-compatible multimodal message parts for explicitly selected local images', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"actorId":"actor_mei"}' } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'vision-model',
      fetchImpl
    });

    await expect(client.completeWithImages('extract anchor', [{
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AA=='
    }])).resolves.toEqual({ actorId: 'actor_mei' });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'extract anchor' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==', detail: 'high' } }
    ]);
    expect(body.stream).toBeUndefined();
  });

  it('preserves structured Tavern message roles and order in the provider request', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }]
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

    await client.complete({
      messages: [
        { role: 'system', content: 'GAME_PROTOCOL', source: 'game_protocol' },
        { role: 'user', content: 'TAVERN_USER', source: 'tavern_preset', sourceId: 'user-1' },
        { role: 'assistant', content: 'TAVERN_ASSISTANT', source: 'tavern_preset', sourceId: 'assistant-1' },
        { role: 'user', content: 'RUNTIME_CONTEXT', source: 'runtime_context' }
      ]
    });

    const [, requestInit] = fetchImpl.mock.calls[0] as unknown as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(requestInit.body)).messages).toEqual([
      { role: 'system', content: 'GAME_PROTOCOL' },
      { role: 'user', content: 'TAVERN_USER' },
      { role: 'assistant', content: 'TAVERN_ASSISTANT' },
      { role: 'user', content: 'RUNTIME_CONTEXT' }
    ]);
  });

  it('returns JSON reasoning only through the isolated callback', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: '{"reasoningText":"只供本次查看","narrativeText":"可见正文"}'
            },
            finish_reason: 'stop'
          }]
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
    const reasoningTexts: string[] = [];

    await expect(client.complete({
      messages: [
        { role: 'system', content: 'GAME_PROTOCOL', source: 'game_protocol' },
        { role: 'user', content: 'RUNTIME_CONTEXT', source: 'runtime_context' }
      ],
      reasoningOutput: { mode: 'json', maxCharacters: 200 }
    }, {
      onReasoningText: (reasoningText) => reasoningTexts.push(reasoningText)
    })).resolves.toEqual({ narrativeText: '可见正文' });
    expect(reasoningTexts).toEqual(['只供本次查看']);
  });

  it('streams provider reasoning deltas separately from narrative content', async () => {
    const streamBody = [
      'data: {"choices":[{"delta":{"reasoning_content":"先核对人物，"}}]}',
      '',
      'data: {"choices":[{"delta":{"reasoning_content":"再检查地点。"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"{\\"narrativeText\\":\\"可见正文\\"}"},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      ''
    ].join('\n');
    const fetchImpl = vi.fn(async () => new Response(streamBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' }
    }));
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'reasoning-model',
      fetchImpl
    });
    const reasoningDeltas: string[] = [];
    const reasoningTexts: string[] = [];

    await expect(client.complete({
      messages: [{ role: 'user', content: 'RUNTIME_CONTEXT', source: 'runtime_context' }],
      reasoningOutput: { mode: 'provider', maxCharacters: 200 }
    }, {
      onTextDelta: vi.fn(),
      onReasoningDelta: (delta) => reasoningDeltas.push(delta),
      onReasoningText: (reasoningText) => reasoningTexts.push(reasoningText)
    })).resolves.toEqual({ narrativeText: '可见正文' });

    expect(reasoningDeltas).toEqual(['先核对人物，', '再检查地点。']);
    expect(reasoningTexts).toEqual(['先核对人物，再检查地点。']);
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

  it('locally repairs an incomplete stop response while preserving the raw text for diagnostics', async () => {
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
    const attempts: Array<{ localJsonRepairApplied?: boolean; rawText: string }> = [];

    await expect(
      client.complete('prompt', {
        onRawText: (rawText) => rawTexts.push(rawText),
        onAttempt: (attempt) => attempts.push(attempt)
      })
    ).resolves.toEqual({
      narrativeText: '开局正文',
      suggestedActions: ['观察报案室']
    });
    expect(rawTexts).toEqual([malformedContent]);
    expect(attempts).toEqual([
      expect.objectContaining({
        localJsonRepairApplied: true,
        rawText: malformedContent,
        parseStatus: 'success'
      })
    ]);
  });

  it('reports request start before transport completion and reuses the same attempt id', async () => {
    const starts: Array<{ attemptId: string; purpose: string }> = [];
    const attempts: Array<{ attemptId: string; parseStatus: string }> = [];
    const fetchImpl = vi.fn(async () => {
      expect(starts).toEqual([
        expect.objectContaining({
          purpose: 'main_turn'
        })
      ]);
      expect(attempts).toEqual([]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"narrativeText":"正文","suggestedActions":["继续"]}'
              },
              finish_reason: 'stop'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      fetchImpl
    });

    await client.complete('prompt', {
      requestPurpose: 'main_turn',
      onAttemptStart: (attempt) => starts.push(attempt),
      onAttempt: (attempt) => attempts.push(attempt)
    });

    expect(attempts).toEqual([
      expect.objectContaining({
        attemptId: starts[0].attemptId,
        parseStatus: 'success'
      })
    ]);
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

  it('does not hide a second request when a compatible provider returns an empty stream', async () => {
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

    const attempts: unknown[] = [];
    await expect(
      client.complete('prompt', {
        onTextDelta: vi.fn(),
        onAttempt: (attempt) => attempts.push(attempt)
      })
    ).rejects.toThrow('主剧情服务没有返回可解析内容。');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({ stream: true });
    expect(attempts).toEqual([
      expect.objectContaining({
        stream: true,
        rawText: '',
        parseStatus: 'empty'
      })
    ]);
  });

  it('does not hide a second request when streamed JSON is malformed', async () => {
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

    const attempts: unknown[] = [];
    await expect(
      client.complete('prompt', {
        onTextDelta: vi.fn(),
        onRawText: (rawText) => rawTexts.push(rawText),
        onAttempt: (attempt) => attempts.push(attempt)
      })
    ).resolves.toEqual({ narrativeText: '半截正文' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rawTexts).toEqual(['{"narrativeText":"半截正文",']);
    expect(attempts).toEqual([
      expect.objectContaining({
        rawText: '{"narrativeText":"半截正文",',
        parseStatus: 'success',
        localJsonRepairApplied: true
      })
    ]);
  });

  it('captures a terminal streamed finish_reason=length event without a content delta', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"{\\"narrativeText\\":\\"半截"}}]}\n\n'
          )
        );
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{},"finish_reason":"length"}],"usage":{"prompt_tokens":20,"completion_tokens":32768}}\n\n'
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
    const attempts: unknown[] = [];

    await expect(
      client.complete('prompt', {
        onTextDelta: vi.fn(),
        maxTokensOverride: 32_768,
        requestPurpose: 'opening_blueprint',
        onAttempt: (attempt) => attempts.push(attempt)
      })
    ).rejects.toMatchObject({ name: 'NarratorTruncatedError' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([
      expect.objectContaining({
        purpose: 'opening_blueprint',
        requestedMaxTokens: 32_768,
        finishReason: 'length',
        rawText: '{"narrativeText":"半截',
        parseStatus: 'truncated',
        usage: { promptTokens: 20, completionTokens: 32768 }
      })
    ]);
  });

  it('rejects a non-streaming finish_reason=length before attempting JSON repair', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"narrativeText":"半截"' },
              finish_reason: 'length'
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

    await expect(client.complete('prompt')).rejects.toMatchObject({
      name: 'NarratorTruncatedError',
      attempt: expect.objectContaining({
        finishReason: 'length',
        parseStatus: 'truncated'
      })
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('uses maxTokensOverride without mutating the regular request budget', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const client = new OpenAiCompatibleNarratorClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'story-model',
      maxTokens: 8192,
      fetchImpl
    });

    await client.complete('opening', { maxTokensOverride: 32_768 });
    await client.complete('turn');

    const calls = fetchImpl.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    expect(JSON.parse(String(calls[0]?.[1]?.body)).max_tokens).toBe(32_768);
    expect(JSON.parse(String(calls[1]?.[1]?.body)).max_tokens).toBe(8192);
  });

  it('retries the same request once without response_format after an explicit 400 rejection', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'response_format json_object is not supported'
            }
          }),
          {
            status: 400,
            statusText: 'Bad Request',
            headers: { 'Content-Type': 'application/json' }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: '{"ok":true}' },
                finish_reason: 'stop'
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

    const completion = await client.completeDetailed('opening', {
      requestPurpose: 'opening_cast'
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const calls = fetchImpl.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit]
    >;
    expect(JSON.parse(String(calls[0]?.[1]?.body))).toHaveProperty(
      'response_format'
    );
    expect(JSON.parse(String(calls[1]?.[1]?.body))).not.toHaveProperty(
      'response_format'
    );
    expect(completion.attempt.providerCapabilityFallback).toEqual({
      capability: 'json_object_response_format',
      action: 'retried_without_capability',
      rejectedStatus: 400
    });
  });

  it('honors explicit provider capability limits for JSON mode, streaming, and output tokens', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: 'stop'
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
      maxTokens: 32_768,
      capabilities: {
        jsonObjectResponseFormat: 'unsupported',
        maxOutputTokens: 8_192,
        streamingJson: 'unsupported'
      },
      fetchImpl
    });

    const completion = await client.completeDetailed('opening', {
      onTextDelta: vi.fn(),
      maxTokensOverride: 12_288,
      requestPurpose: 'opening_actor_enrichment'
    });

    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            RequestInfo | URL,
            RequestInit
          ]
        )[1].body
      )
    );
    expect(body).not.toHaveProperty('response_format');
    expect(body).not.toHaveProperty('stream');
    expect(body.max_tokens).toBe(8_192);
    expect(completion.attempt).toMatchObject({
      stream: false,
      requestedMaxTokens: 8_192
    });
  });

  it('resolves V2 opening stage budgets against the player route limit', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: 'stop'
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
      maxTokens: 2_048,
      fetchImpl
    });

    const completion = await client.completeDetailed('opening', {
      requestPurpose: 'opening_actor_enrichment',
      stageMaxTokens: 12_288
    });
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            RequestInfo | URL,
            RequestInit
          ]
        )[1].body
      )
    );

    expect(body.max_tokens).toBe(2_048);
    expect(completion.attempt.outputBudget).toEqual({
      configuredMaxTokens: 2_048,
      configuredMaxTokensSource: 'player_route',
      stageMaxTokens: 12_288,
      requestedMaxTokens: 2_048,
      limitingSource: 'configured_max_tokens'
    });
  });

  it('reports provider capability as the limiting source for a V2 stage', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: 'stop'
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
      maxTokens: 32_768,
      capabilities: {
        jsonObjectResponseFormat: 'supported',
        maxOutputTokens: 8_192,
        streamingJson: 'unsupported'
      },
      fetchImpl
    });

    const completion = await client.completeDetailed('opening', {
      requestPurpose: 'opening_actor_enrichment',
      stageMaxTokens: 12_288
    });

    expect(completion.attempt.outputBudget).toMatchObject({
      configuredMaxTokens: 32_768,
      stageMaxTokens: 12_288,
      providerMaxOutputTokens: 8_192,
      requestedMaxTokens: 8_192,
      limitingSource: 'provider_capability'
    });
  });
});
