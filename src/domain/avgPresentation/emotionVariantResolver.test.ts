import { describe, expect, it } from 'vitest';
import { resolveEmotionVariant } from './emotionVariantResolver';
import { fixtureOutfit } from './testFixtures';

describe('AVG emotion variant resolver', () => {
  it('uses exact fixed variants before conservative semantic fallbacks', () => {
    const outfit = fixtureOutfit(['default', 'serious', 'happy']);

    expect(resolveEmotionVariant(outfit, 'happy', 'fixed')).toMatchObject({
      variantId: 'happy',
      fallbackChain: ['happy']
    });
    expect(resolveEmotionVariant(outfit, 'angry', 'fixed')).toMatchObject({
      variantId: 'serious',
      fallbackChain: ['angry', 'serious']
    });
  });

  it('maps ecstatic to the accepted excited_extreme variant when present', () => {
    const outfit = fixtureOutfit(['default', 'excited_extreme']);

    expect(resolveEmotionVariant(outfit, 'ecstatic', 'fixed')).toMatchObject({
      variantId: 'excited_extreme',
      fallbackChain: ['ecstatic', 'excited_extreme']
    });
  });

  it('never treats generic alternates as emotion variants', () => {
    const outfit = fixtureOutfit(['default', 'alternate_01', 'alternate_02']);

    expect(resolveEmotionVariant(outfit, 'excited', 'generic')).toEqual({
      variantId: 'default',
      emotionId: 'default',
      fallbackChain: ['default']
    });
  });

  it('fails soft when the required default image does not exist', () => {
    expect(
      resolveEmotionVariant(
        fixtureOutfit(['alternate_01'], 'alternate_01'),
        'neutral',
        'generic'
      )
    ).toBeUndefined();
  });
});
