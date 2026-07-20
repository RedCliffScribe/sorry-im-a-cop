import { describe, expect, it } from 'vitest';
import {
  canFetchModels,
  requiresApiKey,
  supportsAuxiliaryRouting,
  supportsEmbeddingRouting,
  supportsMainNarration
} from './apiCapabilities';

describe('API capability matrix', () => {
  it('exposes the supported OpenAI-compatible narration interfaces', () => {
    expect(supportsMainNarration('openai-compatible')).toBe(true);
    expect(supportsMainNarration('siliconflow')).toBe(true);
    expect(supportsAuxiliaryRouting('deepseek')).toBe(true);
    expect(supportsEmbeddingRouting('openrouter')).toBe(true);
  });

  it('keeps unadapted interfaces available only for profile and model catalog use', () => {
    expect(supportsMainNarration('anthropic')).toBe(false);
    expect(supportsMainNarration('google-gemini')).toBe(false);
    expect(supportsAuxiliaryRouting('azure-openai')).toBe(false);
    expect(supportsEmbeddingRouting('ollama')).toBe(false);
    expect(canFetchModels('anthropic')).toBe(true);
    expect(canFetchModels('google-gemini')).toBe(true);
    expect(canFetchModels('ollama')).toBe(true);
  });

  it('does not require an API key for Ollama profiles', () => {
    expect(requiresApiKey('ollama')).toBe(false);
    expect(requiresApiKey('openai-compatible')).toBe(true);
  });
});
