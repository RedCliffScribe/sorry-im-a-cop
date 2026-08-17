import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import type { NarratorClient, NarratorInput } from '../narrator/NarratorClient';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import type { TurnApiRoute, TurnApiUsage } from '../runtime/types';

function serializeOutput(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value ?? '');
  }
}

function serializeInput(input: NarratorInput): string {
  return typeof input === 'string'
    ? input
    : input.messages.map((message) => message.content).join('\n');
}

export class TurnUsageMeter {
  private readonly usageByRoute = new Map<TurnApiRoute, TurnApiUsage>();

  private record(route: TurnApiRoute, inputTokens: number, outputTokens: number, responseMs: number): void {
    const current = this.usageByRoute.get(route);
    if (current) {
      current.callCount += 1;
      current.inputTokens += inputTokens;
      current.outputTokens += outputTokens;
      current.responseMs += responseMs;
      return;
    }

    this.usageByRoute.set(route, {
      route,
      callCount: 1,
      inputTokens,
      outputTokens,
      responseMs
    });
  }

  wrapNarrator(route: TurnApiRoute, client: NarratorClient): NarratorClient {
    return {
      complete: async (prompt, options) => {
        const startedAt = Date.now();
        let rawText = '';

        try {
          const result = await client.complete(prompt, {
            ...options,
            onRawText: (value) => {
              rawText = value;
              options?.onRawText?.(value);
            }
          });
          this.record(
            route,
            estimateNarrativeTokens(serializeInput(prompt)),
            estimateNarrativeTokens(rawText || serializeOutput(result)),
            Math.max(0, Date.now() - startedAt)
          );
          return result;
        } catch (error) {
          this.record(
            route,
            estimateNarrativeTokens(serializeInput(prompt)),
            0,
            Math.max(0, Date.now() - startedAt)
          );
          throw error;
        }
      }
    };
  }

  wrapMemoryEmbedding(client: MemoryEmbeddingClient): MemoryEmbeddingClient {
    return {
      model: client.model,
      embed: async (text, options) => {
        const startedAt = Date.now();
        try {
          const result = await client.embed(text, options);
          this.record(
            'memoryEmbedding',
            estimateNarrativeTokens(text),
            0,
            Math.max(0, Date.now() - startedAt)
          );
          return result;
        } catch (error) {
          this.record(
            'memoryEmbedding',
            estimateNarrativeTokens(text),
            0,
            Math.max(0, Date.now() - startedAt)
          );
          throw error;
        }
      }
    };
  }

  snapshot(): TurnApiUsage[] {
    return [...this.usageByRoute.values()].map((usage) => ({ ...usage }));
  }
}
