import { jsonrepair } from 'jsonrepair';
import type { NarratorClient, NarratorStreamOptions } from './NarratorClient';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OpenAiCompatibleNarratorClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

const defaultRequestTimeoutMs = 120_000;

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function parseJsonObjectFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const jsonSlice = extractFirstCompleteJsonObject(candidate);
    if (jsonSlice) {
      try {
        return JSON.parse(jsonSlice);
      } catch {
        return JSON.parse(jsonrepair(jsonSlice));
      }
    }
    throw new Error('LLM 返回内容不是有效 JSON。');
  }
}

function extractFirstCompleteJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractJsonStringPrefix(text: string, key: string): string {
  const match = new RegExp(`"${key}"\\s*:\\s*"`).exec(text);
  if (!match) return '';

  let result = '';
  for (let index = match.index + match[0].length; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') return result;
    if (char !== '\\') {
      result += char;
      continue;
    }

    if (index + 1 >= text.length) break;
    const escaped = text[index + 1];
    if (escaped === 'u') {
      const hex = text.slice(index + 2, index + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) break;
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
      continue;
    }

    const escapes: Record<string, string> = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t'
    };
    result += escapes[escaped] ?? escaped;
    index += 1;
  }

  return result;
}

function parseOpenAiDeltaContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const delta = (first as { delta?: unknown }).delta;
  if (delta && typeof delta === 'object') {
    const content = (delta as { content?: unknown }).content;
    if (typeof content === 'string') return content;
  }
  const message = (first as { message?: unknown }).message;
  if (message && typeof message === 'object') {
    const content = (message as { content?: unknown }).content;
    if (typeof content === 'string') return content;
  }
  const text = (first as { text?: unknown }).text;
  return typeof text === 'string' ? text : '';
}

function parseChatContent(payload: unknown): string {
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> }).choices;
  const content = choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('主剧情服务没有返回可解析内容。');
  }
  return content;
}

async function readOpenAiCompatibleStream(response: Response, options?: NarratorStreamOptions): Promise<string> {
  if (!response.body) {
    const payload =
      typeof response.text === 'function'
        ? parseJsonObjectFromText(await response.text())
        : await response.json();
    const content = parseChatContent(payload);
    const narrative = extractJsonStringPrefix(content, 'narrativeText');
    if (narrative) options?.onTextDelta?.(narrative);
    return content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let emittedNarrative = '';

  function emitNarrativeDelta() {
    const narrativePrefix = extractJsonStringPrefix(content, 'narrativeText');
    if (narrativePrefix.length <= emittedNarrative.length) return;
    options?.onTextDelta?.(narrativePrefix.slice(emittedNarrative.length));
    emittedNarrative = narrativePrefix;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      const eventData = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');

      if (!eventData || eventData === '[DONE]') continue;
      const deltaContent = parseOpenAiDeltaContent(JSON.parse(eventData));
      if (!deltaContent) continue;
      content += deltaContent;
      emitNarrativeDelta();
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const eventData = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');

    if (eventData && eventData !== '[DONE]') {
      const deltaContent = parseOpenAiDeltaContent(JSON.parse(eventData));
      if (deltaContent) {
        content += deltaContent;
        emitNarrativeDelta();
      }
    }
  }

  if (!content.trim()) {
    throw new Error('主剧情服务流式返回缺少可解析内容。');
  }

  return content;
}

function isEmptyStreamError(error: unknown): boolean {
  return error instanceof Error && error.message === '主剧情服务流式返回缺少可解析内容。';
}

function isJsonParseError(error: unknown): boolean {
  return error instanceof Error && error.message === 'LLM 返回内容不是有效 JSON。';
}

export class OpenAiCompatibleNarratorClient implements NarratorClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens?: number;
  private readonly temperature?: number;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleNarratorClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private createRequestBody(prompt: string, stream: boolean) {
    return {
      model: this.model,
      messages: [
        {
          role: 'system',
          content: '你必须只返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
      ...(stream ? { stream: true } : {}),
      ...(this.maxTokens === undefined ? {} : { max_tokens: this.maxTokens }),
      ...(this.temperature === undefined ? {} : { temperature: this.temperature })
    };
  }

  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const requestController = new AbortController();
    let timedOut = false;
    let rejectOnAbort: ((reason: unknown) => void) | undefined;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      rejectOnAbort = reject;
    });
    const handleRequestAbort = () => {
      if (timedOut) {
        rejectOnAbort?.(new Error(`接口响应超时（${Math.ceil(this.requestTimeoutMs / 1000)} 秒）。`));
        return;
      }
      const reason = requestController.signal.reason;
      rejectOnAbort?.(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
    };
    requestController.signal.addEventListener('abort', handleRequestAbort, { once: true });

    const relayExternalAbort = () => requestController.abort(options?.signal?.reason);
    if (options?.signal?.aborted) relayExternalAbort();
    else options?.signal?.addEventListener('abort', relayExternalAbort, { once: true });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, this.requestTimeoutMs);

    const execute = async (): Promise<unknown> => {
      const shouldStream = Boolean(options?.onTextDelta);
      const createRequest = (stream: boolean): RequestInit => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(this.createRequestBody(prompt, stream)),
        signal: requestController.signal
      });

      const fetchContent = async (stream: boolean): Promise<string> => {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, createRequest(stream));

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `主剧情服务请求失败：${response.status} ${response.statusText}${body ? ` ${body}` : ''}`
          );
        }

        return stream ? readOpenAiCompatibleStream(response, options) : parseChatContent(await response.json());
      };

      let content: string;
      if (shouldStream) {
        try {
          content = await fetchContent(true);
        } catch (error) {
          if (!isEmptyStreamError(error)) throw error;
          content = await fetchContent(false);
          const narrative = extractJsonStringPrefix(content, 'narrativeText');
          if (narrative) options?.onTextDelta?.(narrative);
        }
      } else {
        content = await fetchContent(false);
      }

      try {
        const parsed = parseJsonObjectFromText(content);
        options?.onRawText?.(content);
        return parsed;
      } catch (error) {
        if (!shouldStream || !isJsonParseError(error)) {
          options?.onRawText?.(content);
          throw error;
        }

        const retryContent = await fetchContent(false);
        try {
          const parsed = parseJsonObjectFromText(retryContent);
          options?.onRawText?.(retryContent);
          return parsed;
        } catch (retryError) {
          options?.onRawText?.(content);
          throw retryError;
        }
      }
    };

    try {
      return await Promise.race([execute(), abortPromise]);
    } finally {
      clearTimeout(timeoutId);
      requestController.signal.removeEventListener('abort', handleRequestAbort);
      options?.signal?.removeEventListener('abort', relayExternalAbort);
    }
  }
}
