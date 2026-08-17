import { jsonrepair } from 'jsonrepair';
import {
  type NarratorAttemptRecord,
  type NarratorClient,
  type NarratorDetailedCompletion,
  type NarratorFinishReason,
  type NarratorImageInput,
  type NarratorInput,
  type NarratorStreamOptions
} from './NarratorClient';
import { NarratorAttemptError, NarratorTruncatedError } from './NarratorErrors';
import type { ApiProfileCapabilities } from '../settings/types';
import { resolveRequestOutputBudget } from './narratorLimits';
export { DEFAULT_API_MAX_TOKENS } from './narratorLimits';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface OpenAiCompatibleNarratorClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  capabilities?: ApiProfileCapabilities;
  requestTimeoutMs?: number;
  fetchImpl?: FetchLike;
}

export const DEFAULT_NARRATOR_REQUEST_TIMEOUT_MS = 600_000;

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function parseJsonObjectFromText(text: string): {
  value: unknown;
  localJsonRepairApplied: boolean;
} {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return { value: JSON.parse(candidate), localJsonRepairApplied: false };
  } catch {
    const jsonSlice = extractFirstCompleteJsonObject(candidate);
    if (jsonSlice) {
      try {
        return {
          value: JSON.parse(jsonSlice),
          localJsonRepairApplied: jsonSlice !== candidate
        };
      } catch {
        return {
          value: JSON.parse(jsonrepair(jsonSlice)),
          localJsonRepairApplied: true
        };
      }
    }
    if (candidate.includes('{')) {
      return {
        value: JSON.parse(jsonrepair(candidate.slice(candidate.indexOf('{')))),
        localJsonRepairApplied: true
      };
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

function readReasoningValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      const record = item as Record<string, unknown>;
      return typeof record.text === 'string'
        ? record.text
        : typeof record.summary === 'string'
          ? record.summary
          : '';
    })
    .filter(Boolean)
    .join('\n');
}

function parseOpenAiReasoning(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const first = choices[0];
  if (!first || typeof first !== 'object') return '';
  const delta = (first as { delta?: unknown }).delta;
  const message = (first as { message?: unknown }).message;
  for (const source of [delta, message]) {
    if (!source || typeof source !== 'object') continue;
    const record = source as Record<string, unknown>;
    const text =
      readReasoningValue(record.reasoning_content)
      || readReasoningValue(record.reasoning)
      || readReasoningValue(record.reasoning_details)
      || readReasoningValue(record.thought_summary);
    if (text) return text;
  }
  return '';
}

interface ProviderCompletion {
  rawText: string;
  reasoningText: string;
  finishReason: NarratorFinishReason;
  usage?: NarratorAttemptRecord['usage'];
}

function normalizeFinishReason(value: unknown): NarratorFinishReason {
  if (value === 'stop' || value === 'length' || value === 'content_filter' || value === 'tool_calls') {
    return value;
  }
  return 'unknown';
}

function isJsonObjectResponseFormatRejection(
  response: Response,
  body: string
): response is Response & { status: 400 | 422 } {
  return (
    (response.status === 400 || response.status === 422) &&
    /response[_ -]?format|json[_ -]?object/i.test(body)
  );
}

function parseUsage(payload: unknown): NarratorAttemptRecord['usage'] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokens = (usage as { prompt_tokens?: unknown }).prompt_tokens;
  const completionTokens = (usage as { completion_tokens?: unknown }).completion_tokens;
  if (typeof promptTokens !== 'number' && typeof completionTokens !== 'number') return undefined;
  return {
    ...(typeof promptTokens === 'number' ? { promptTokens } : {}),
    ...(typeof completionTokens === 'number' ? { completionTokens } : {})
  };
}

function parseChatCompletion(payload: unknown): ProviderCompletion {
  const choices = (
    payload as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: unknown;
          reasoning?: unknown;
          reasoning_details?: unknown;
          thought_summary?: unknown;
        };
        text?: string;
        finish_reason?: unknown;
      }>;
    }
  ).choices;
  const content = choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : choices?.[0]?.text;
  return {
    rawText: typeof text === 'string' ? text : '',
    reasoningText: parseOpenAiReasoning(payload),
    finishReason: normalizeFinishReason(choices?.[0]?.finish_reason),
    usage: parseUsage(payload)
  };
}

function mergeUsage(
  current: NarratorAttemptRecord['usage'] | undefined,
  next: NarratorAttemptRecord['usage'] | undefined
): NarratorAttemptRecord['usage'] | undefined {
  if (!next) return current;
  return {
    promptTokens: next.promptTokens ?? current?.promptTokens,
    completionTokens: next.completionTokens ?? current?.completionTokens
  };
}

async function readOpenAiCompatibleStream(
  response: Response,
  options?: NarratorStreamOptions
): Promise<ProviderCompletion> {
  if (!response.body) {
    const payload =
      typeof response.text === 'function'
        ? parseJsonObjectFromText(await response.text()).value
        : await response.json();
    const completion = parseChatCompletion(payload);
    const narrative = extractJsonStringPrefix(completion.rawText, 'narrativeText');
    if (narrative) options?.onTextDelta?.(narrative);
    return completion;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let reasoningText = '';
  let emittedNarrative = '';
  let finishReason: NarratorFinishReason = 'unknown';
  let usage: NarratorAttemptRecord['usage'];

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
      const payload = JSON.parse(eventData);
      const choices = (payload as { choices?: Array<{ finish_reason?: unknown }> }).choices;
      const eventFinishReason = normalizeFinishReason(choices?.[0]?.finish_reason);
      if (eventFinishReason !== 'unknown') finishReason = eventFinishReason;
      usage = mergeUsage(usage, parseUsage(payload));
      const deltaContent = parseOpenAiDeltaContent(payload);
      const reasoningDelta = parseOpenAiReasoning(payload);
      if (reasoningDelta) {
        reasoningText += reasoningDelta;
        options?.onReasoningDelta?.(reasoningDelta);
      }
      if (deltaContent) {
        content += deltaContent;
        options?.onRawDelta?.(deltaContent);
        emitNarrativeDelta();
      }
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
      const payload = JSON.parse(eventData);
      const choices = (payload as { choices?: Array<{ finish_reason?: unknown }> }).choices;
      const eventFinishReason = normalizeFinishReason(choices?.[0]?.finish_reason);
      if (eventFinishReason !== 'unknown') finishReason = eventFinishReason;
      usage = mergeUsage(usage, parseUsage(payload));
      const deltaContent = parseOpenAiDeltaContent(payload);
      const reasoningDelta = parseOpenAiReasoning(payload);
      if (reasoningDelta) {
        reasoningText += reasoningDelta;
        options?.onReasoningDelta?.(reasoningDelta);
      }
      if (deltaContent) {
        content += deltaContent;
        options?.onRawDelta?.(deltaContent);
        emitNarrativeDelta();
      }
    }
  }

  return { rawText: content, reasoningText, finishReason, usage };
}

export class OpenAiCompatibleNarratorClient implements NarratorClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens?: number;
  readonly configuredMaxTokens?: number;
  private readonly temperature?: number;
  private readonly capabilities: ApiProfileCapabilities;
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleNarratorClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.maxTokens = options.maxTokens;
    this.configuredMaxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.capabilities = options.capabilities ?? {
      jsonObjectResponseFormat: 'auto',
      streamingJson: 'auto'
    };
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_NARRATOR_REQUEST_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  private createRequestBody(
    input: NarratorInput,
    stream: boolean,
    maxTokens?: number,
    images: readonly NarratorImageInput[] = [],
    includeJsonObjectResponseFormat =
      this.capabilities.jsonObjectResponseFormat !== 'unsupported'
  ) {
    const messages = typeof input === 'string'
      ? [
          {
            role: 'system',
            content: '你必须只返回一个合法 JSON object，不要 Markdown，不要代码块，不要额外解释。'
          },
          {
            role: 'user',
            content: images.length
              ? [
                  { type: 'text', text: input },
                  ...images.map((image) => ({
                    type: 'image_url',
                    image_url: { url: image.dataUrl, detail: 'high' }
                  }))
                ]
              : input
          }
        ]
      : input.messages.map(({ role, content }) => ({ role, content }));
    return {
      model: this.model,
      messages,
      ...(includeJsonObjectResponseFormat
        ? { response_format: { type: 'json_object' } }
        : {}),
      ...(stream ? { stream: true } : {}),
      ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
      ...(this.temperature === undefined ? {} : { temperature: this.temperature })
    };
  }

  async completeDetailed(
    input: NarratorInput,
    options?: NarratorStreamOptions
  ): Promise<NarratorDetailedCompletion> {
    return this.completeDetailedInternal(input, [], options);
  }

  async completeWithImages(
    prompt: string,
    images: readonly NarratorImageInput[],
    options?: NarratorStreamOptions
  ): Promise<unknown> {
    if (!images.length) throw new Error('多模态请求至少需要一张图片。');
    for (const image of images) {
      if (!image.dataUrl.startsWith(`data:${image.mimeType};base64,`)) {
        throw new Error('多模态图片必须是 MIME 匹配的 base64 data URL。');
      }
    }
    return (await this.completeDetailedInternal(prompt, images, options)).value;
  }

  private async completeDetailedInternal(
    input: NarratorInput,
    images: readonly NarratorImageInput[],
    options?: NarratorStreamOptions
  ): Promise<NarratorDetailedCompletion> {
    const startedAt = new Date().toISOString();
    const stream =
      images.length === 0 &&
      this.capabilities.streamingJson !== 'unsupported' &&
      Boolean(options?.onTextDelta || options?.onRawDelta);
    const outputBudget =
      options?.stageMaxTokens === undefined
        ? undefined
        : resolveRequestOutputBudget({
            configuredMaxTokens: this.maxTokens,
            stageMaxTokens: options.stageMaxTokens,
            providerMaxOutputTokens: this.capabilities.maxOutputTokens
          });
    const configuredRequestMaxTokens =
      options?.maxTokensOverride ?? this.maxTokens;
    const requestedMaxTokens =
      outputBudget?.requestedMaxTokens ??
      (configuredRequestMaxTokens === undefined
        ? this.capabilities.maxOutputTokens
        : this.capabilities.maxOutputTokens === undefined
          ? configuredRequestMaxTokens
          : Math.min(
              configuredRequestMaxTokens,
              this.capabilities.maxOutputTokens
            ));
    const attemptBase = {
      attemptId:
        typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `attempt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      purpose: options?.requestPurpose ?? 'main_turn',
      stream,
      requestedMaxTokens,
      ...(outputBudget ? { outputBudget } : {}),
      startedAt
    } satisfies Pick<
      NarratorAttemptRecord,
      | 'attemptId'
      | 'purpose'
      | 'stream'
      | 'requestedMaxTokens'
      | 'outputBudget'
      | 'startedAt'
    >;
    options?.onAttemptStart?.({ ...attemptBase });
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

    const createAttempt = (
      completion: ProviderCompletion,
      parseStatus: NarratorAttemptRecord['parseStatus'],
      errorMessage?: string,
      localJsonRepairApplied = false,
      providerCapabilityFallback?: NarratorAttemptRecord['providerCapabilityFallback']
    ): NarratorAttemptRecord => ({
      ...attemptBase,
      finishReason: completion.finishReason,
      rawText: completion.rawText,
      parseStatus,
      ...(errorMessage ? { errorMessage } : {}),
      ...(localJsonRepairApplied ? { localJsonRepairApplied: true } : {}),
      ...(providerCapabilityFallback ? { providerCapabilityFallback } : {}),
      ...(completion.reasoningText ? {
        reasoningText: completion.reasoningText.slice(
          0,
          typeof input === 'string'
            ? 0
            : Math.max(0, Math.min(8000, input.reasoningOutput?.maxCharacters ?? 0))
        )
      } : {}),
      finishedAt: new Date().toISOString(),
      usage: completion.usage
    });
    let completionSettled = false;
    const reportAttempt = (attempt: NarratorAttemptRecord) => {
      if (!completionSettled) options?.onAttempt?.(attempt);
    };

    const execute = async (): Promise<NarratorDetailedCompletion> => {
      const createRequest = (
        includeJsonObjectResponseFormat: boolean
      ): RequestInit => ({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(
          this.createRequestBody(
            input,
            stream,
            requestedMaxTokens,
            images,
            includeJsonObjectResponseFormat
          )
        ),
        signal: requestController.signal
      });

      let completion: ProviderCompletion = {
        rawText: '',
        reasoningText: '',
        finishReason: 'unknown'
      };
      let providerCapabilityFallback:
        | NarratorAttemptRecord['providerCapabilityFallback']
        | undefined;
      try {
        const includeJsonObjectResponseFormat =
          this.capabilities.jsonObjectResponseFormat !== 'unsupported';
        let response = await this.fetchImpl(
          `${this.baseUrl}/chat/completions`,
          createRequest(includeJsonObjectResponseFormat)
        );
        let providerErrorBody = '';

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          if (
            includeJsonObjectResponseFormat &&
            isJsonObjectResponseFormatRejection(response, body)
          ) {
            providerCapabilityFallback = {
              capability: 'json_object_response_format',
              action: 'retried_without_capability',
              rejectedStatus: response.status
            };
            response = await this.fetchImpl(
              `${this.baseUrl}/chat/completions`,
              createRequest(false)
            );
          } else {
            providerErrorBody = body;
          }
        }

        if (!response.ok) {
          const body =
            providerErrorBody || (await response.text().catch(() => ''));
          const openingBudgetRejected =
            attemptBase.purpose.startsWith('opening_') &&
            [400, 413, 422].includes(response.status);
          throw new Error(
            `主剧情服务请求失败：${response.status} ${response.statusText}${body ? ` ${body}` : ''}${
              openingBudgetRejected
                ? ` 当前开局阶段的最终请求上限为 ${requestedMaxTokens ?? '未指定'}，请检查线路设置与模型支持的输出上限。`
                : ''
            }`
          );
        }

        completion = stream
          ? await readOpenAiCompatibleStream(response, options)
          : parseChatCompletion(await response.json());
        options?.onRawText?.(completion.rawText);
        const reasoningLimit = typeof input === 'string'
          ? 0
          : Math.max(0, Math.min(8000, input.reasoningOutput?.maxCharacters ?? 0));
        let reasoningText = input && typeof input !== 'string' && input.reasoningOutput?.mode === 'provider'
          ? completion.reasoningText.slice(0, reasoningLimit)
          : '';

        if (completion.finishReason === 'length') {
          const attempt = createAttempt(
            completion,
            'truncated',
            '输出长度不足，JSON 被截断。',
            false,
            providerCapabilityFallback
          );
          reportAttempt(attempt);
          throw new NarratorTruncatedError(attempt);
        }

        if (!completion.rawText.trim()) {
          const attempt = createAttempt(
            completion,
            'empty',
            '主剧情服务没有返回可解析内容。',
            false,
            providerCapabilityFallback
          );
          reportAttempt(attempt);
          throw new NarratorAttemptError(attempt.errorMessage!, attempt);
        }

        try {
          const parsed = parseJsonObjectFromText(completion.rawText);
          let value = parsed.value;
          if (
            typeof input !== 'string'
            && input.reasoningOutput?.mode === 'json'
            && value
            && typeof value === 'object'
            && !Array.isArray(value)
          ) {
            const { reasoningText: jsonReasoning, ...cleanValue } = value as Record<string, unknown>;
            if (typeof jsonReasoning === 'string') {
              reasoningText = jsonReasoning.slice(0, reasoningLimit);
            }
            value = cleanValue;
          }
          if (reasoningText) options?.onReasoningText?.(reasoningText);
          const attempt = createAttempt(
            { ...completion, reasoningText },
            'success',
            undefined,
            parsed.localJsonRepairApplied,
            providerCapabilityFallback
          );
          reportAttempt(attempt);
          return {
            value,
            attempt,
            ...(reasoningText ? { reasoningText } : {})
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const attempt = createAttempt(
            completion,
            'malformed_json',
            message,
            false,
            providerCapabilityFallback
          );
          reportAttempt(attempt);
          throw new NarratorAttemptError(message, attempt);
        }
      } catch (error) {
        if (error instanceof NarratorAttemptError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const attempt = createAttempt(
          completion,
          completion.rawText ? 'malformed_json' : 'empty',
          message,
          false,
          providerCapabilityFallback
        );
        reportAttempt(attempt);
        throw new NarratorAttemptError(message, attempt);
      }
    };

    try {
      return await Promise.race([execute(), abortPromise]);
    } catch (error) {
      if (error instanceof NarratorAttemptError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const attempt: NarratorAttemptRecord = {
        ...attemptBase,
        finishReason: 'unknown',
        rawText: '',
        parseStatus: 'empty',
        errorMessage: message,
        finishedAt: new Date().toISOString()
      };
      reportAttempt(attempt);
      throw new NarratorAttemptError(message, attempt);
    } finally {
      completionSettled = true;
      clearTimeout(timeoutId);
      requestController.signal.removeEventListener('abort', handleRequestAbort);
      options?.signal?.removeEventListener('abort', relayExternalAbort);
    }
  }

  async complete(input: NarratorInput, options?: NarratorStreamOptions): Promise<unknown> {
    return (await this.completeDetailed(input, options)).value;
  }
}
