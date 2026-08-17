import { describe, expect, it } from 'vitest';
import {
  filterCustomCharacterGenerationModels,
  isModelNotFoundGenerationError,
  isObviouslyNonTextCharacterModel
} from './customCharacterModelCatalog';

describe('custom character model catalog', () => {
  it('hides obvious non-text models without mutating the API profile catalog', () => {
    const models = [
      'mimo-v2.5',
      'gemini-3-flash',
      'speech-asr',
      'voiceclone-v1',
      'text-embedding-3',
      'image-generation'
    ];

    expect(filterCustomCharacterGenerationModels(models, false)).toEqual([
      'mimo-v2.5',
      'gemini-3-flash'
    ]);
    expect(filterCustomCharacterGenerationModels(models, true)).toEqual(models);
    expect(models).toHaveLength(6);
  });

  it('recognizes non-text names and provider model-not-found responses', () => {
    expect(isObviouslyNonTextCharacterModel('mimo-tts-v2')).toBe(true);
    expect(isObviouslyNonTextCharacterModel('grok-4.3-fast')).toBe(false);
    expect(
      isModelNotFoundGenerationError(
        new Error('503 {"code":"model_not_found"}')
      )
    ).toBe(true);
  });
});
