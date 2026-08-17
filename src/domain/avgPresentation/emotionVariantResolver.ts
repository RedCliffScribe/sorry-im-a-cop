import type { AvgPortraitOutfitEntry } from '../avgResourcePack';
import type { StoryEmotion } from '../runtime/storyBlocks';

export const STORY_EMOTION_VARIANT_CANDIDATES: Readonly<
  Record<StoryEmotion, readonly string[]>
> = {
  neutral: ['default'],
  happy: ['happy', 'default'],
  excited: ['excited', 'happy', 'default'],
  ecstatic: ['ecstatic', 'excited_extreme', 'excited', 'happy', 'default'],
  sad: ['sad', 'serious', 'default'],
  angry: ['angry', 'serious', 'default'],
  surprised: ['surprised', 'default'],
  serious: ['serious', 'default'],
  worried: ['worried', 'serious', 'default'],
  afraid: ['afraid', 'surprised', 'default'],
  embarrassed: ['embarrassed', 'shy', 'default'],
  shy: ['shy', 'default'],
  tired: ['tired', 'default'],
  thinking: ['thinking', 'serious', 'default'],
  secretive: ['secretive', 'serious', 'default']
};

export interface AvgEmotionVariantResolution {
  variantId: string;
  emotionId: string;
  fallbackChain: string[];
}

function findVariant(outfit: AvgPortraitOutfitEntry, candidateId: string) {
  return (
    outfit.variants[candidateId] ??
    Object.values(outfit.variants).find((variant) => variant.emotionId === candidateId)
  );
}

function findDefaultVariant(outfit: AvgPortraitOutfitEntry) {
  const explicit = findVariant(outfit, 'default');
  if (explicit) return explicit;
  const configured = outfit.variants[outfit.defaultVariantId];
  return configured?.emotionId === 'default' ? configured : undefined;
}

export function resolveEmotionVariant(
  outfit: AvgPortraitOutfitEntry | undefined,
  emotion: StoryEmotion,
  mode: 'fixed' | 'generic'
): AvgEmotionVariantResolution | undefined {
  if (!outfit) return undefined;

  if (mode === 'generic') {
    const variant = findDefaultVariant(outfit);
    return variant
      ? {
          variantId: variant.variantId,
          emotionId: variant.emotionId,
          fallbackChain: ['default']
        }
      : undefined;
  }

  const candidates = STORY_EMOTION_VARIANT_CANDIDATES[emotion];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidateId = candidates[index]!;
    const variant = candidateId === 'default'
      ? findDefaultVariant(outfit)
      : findVariant(outfit, candidateId);
    if (variant) {
      return {
        variantId: variant.variantId,
        emotionId: variant.emotionId,
        fallbackChain: candidates.slice(0, index + 1)
      };
    }
  }
  return undefined;
}
