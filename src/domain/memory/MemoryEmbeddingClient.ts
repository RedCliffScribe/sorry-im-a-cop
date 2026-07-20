export interface MemoryEmbeddingClient {
  readonly model?: string;
  embed(text: string, options?: { signal?: AbortSignal }): Promise<number[]>;
}
