import type { MemoryEmbeddingClient } from './MemoryEmbeddingClient';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface OpenAiCompatibleMemoryEmbeddingClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: FetchLike;
}

function trimTrailingSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function parseEmbedding(payload: unknown): number[] {
  const data = (payload as { data?: Array<{ embedding?: unknown }> }).data;
  const embedding = data?.[0]?.embedding;
  if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('向量模型没有返回可用 embedding。');
  }
  return embedding;
}

export class OpenAiCompatibleMemoryEmbeddingClient implements MemoryEmbeddingClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly model: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: OpenAiCompatibleMemoryEmbeddingClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async embed(text: string, options?: { signal?: AbortSignal }): Promise<number[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: text
      }),
      signal: options?.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`向量模型请求失败：${response.status} ${response.statusText}${body ? ` ${body}` : ''}`);
    }

    return parseEmbedding(await response.json());
  }
}
