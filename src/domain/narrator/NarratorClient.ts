export interface NarratorStreamOptions {
  onTextDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
  signal?: AbortSignal;
}

export interface NarratorClient {
  complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown>;
}
