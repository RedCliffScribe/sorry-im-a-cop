import type { ImagePromptModifierSet } from '../imageGeneration/promptConversion';
import type { AvgSceneExposure } from '../avgEnvironment';
import { toStableIdentityKey } from '../avgResourcePack/stableIdentity';
import { createAvgSceneOverrideAnchor } from '../avgVisualOverride';
import type { Actor, RuntimeState } from '../runtime/types';
import type { AvgPortraitGenerationContext, AvgSceneGenerationContext } from './types';

const MAX_FACT_LENGTH = 1800;

function clean(value: string | undefined, max = MAX_FACT_LENGTH): string {
  return value?.replace(/\s+/gu, ' ').trim().slice(0, max) ?? '';
}

function cleanPortraitVisualFact(value: string | undefined, max = MAX_FACT_LENGTH): string {
  return clean(value, max)
    .replace(/\b(?:solid\s+)?black\s+silhouettes?\b/giu, 'fully rendered body shape')
    .replace(/\bsilhouettes?\b/giu, 'body shape')
    .replace(/(?:纯黑色?|黑色)?(?:人物)?剪影/gu, '完整人物体态')
    .slice(0, max);
}

function labeled(label: string, value: string | undefined): string {
  const normalized = clean(value);
  return normalized ? `${label}: ${normalized}` : '';
}

export function buildAvgPortraitGenerationContext(
  runtimeState: RuntimeState,
  actor: Actor
): AvgPortraitGenerationContext {
  return {
    worldpackId: runtimeState.world.worldpackId,
    worldYear: runtimeState.time.year,
    actorId: actor.actorId,
    targetKey: `actor:${actor.actorId}`,
    identityLabel: [actor.name, actor.englishName].filter(Boolean).join(' / '),
    gender: actor.gender,
    visualAge: actor.visualAgeAnchor || (actor.computedAge ? `${actor.computedAge} years old` : undefined),
    appearance: [actor.appearance, actor.femaleProfile?.appearanceDescription, actor.femaleProfile?.appearanceExtension]
      .filter(Boolean).join('；'),
    bodyDescription: actor.femaleProfile?.bodyDescription,
    roleDescription: [actor.publicIdentity, actor.positionSummary].filter(Boolean).join('；'),
    clothingDescription: [actor.clothing, actor.femaleProfile?.clothingStyle].filter(Boolean).join('；'),
    ...(actor.stableIdentityRef
      ? { stableIdentityKey: toStableIdentityKey(actor.stableIdentityRef) }
      : {})
  };
}

export function buildAvgOutfitGenerationContext(
  runtimeState: RuntimeState,
  actor: Actor,
  outfit: {
    outfitId: string;
    displayName: string;
    description?: string;
  }
): AvgPortraitGenerationContext {
  return {
    ...buildAvgPortraitGenerationContext(runtimeState, actor),
    targetKey: `actor:${actor.actorId}:outfit:${outfit.outfitId}`,
    generationPurpose: 'outfit',
    outfitId: outfit.outfitId,
    outfitDisplayName: clean(outfit.displayName, 80),
    outfitDescription: clean(outfit.description, 1200)
  };
}

export function buildAvgSceneGenerationContext(
  runtimeState: RuntimeState,
  presentation?: {
    exposure?: AvgSceneExposure;
    stableSceneTags?: readonly string[];
  }
): AvgSceneGenerationContext | undefined {
  const runtimeSceneId = runtimeState.location.currentSceneId;
  const runtimePlaceId = runtimeState.location.currentPlaceId;
  const anchor = createAvgSceneOverrideAnchor({ runtimeSceneId, runtimePlaceId });
  if (!anchor) return undefined;
  const scene = runtimeSceneId ? runtimeState.scenes[runtimeSceneId] : undefined;
  const placeId = scene?.placeId ?? runtimePlaceId;
  const place = placeId ? runtimeState.places[placeId] : undefined;
  return {
    worldpackId: runtimeState.world.worldpackId,
    worldYear: runtimeState.time.year,
    targetKey: `${anchor.type}:${anchor.id}`,
    anchor,
    locationName: scene?.name || place?.name || '当前地点',
    district: place?.districtId || place?.regionId,
    placeType: [place?.type, place?.category].filter(Boolean).join(' / ') || undefined,
    // Runtime scene/place summaries are narrative writeback fields and may contain
    // recent plot events or temporary occupants.  Reusable AVG background prompts
    // must stay on structural/public place metadata instead.
    stableDescription: undefined,
    publicKnowledge: place?.publicKnowledge,
    streetAddress: place?.streetAddressText,
    roadAnchors: place?.roadAnchors,
    historicalNote: place?.historicalNote,
    exposure: presentation?.exposure,
    stableSceneTags: presentation?.stableSceneTags ? [...presentation.stableSceneTags] : undefined
  };
}

export function buildAvgPortraitPromptParts(
  context: AvgPortraitGenerationContext,
  additionalInstruction = ''
): {
  anchorText: string;
  basePositive: string;
  baseNegative: string;
  appearancePositive: string;
  additionalPositive: string;
  additionalNegative: string;
} {
  const isOutfit = context.generationPurpose === 'outfit';
  const stableAppearance = cleanPortraitVisualFact(context.appearance);
  const bodyDescription = cleanPortraitVisualFact(context.bodyDescription);
  const targetClothing = cleanPortraitVisualFact(isOutfit
    ? context.outfitDescription || context.outfitDisplayName
    : context.clothingDescription);
  const identityFacts = [
    labeled('Identity', context.identityLabel),
    labeled('Gender', context.gender),
    labeled('Visual age', context.visualAge),
    labeled('Stable appearance', stableAppearance),
    labeled('Body build and proportions', bodyDescription),
    labeled('Public role', context.roleDescription)
  ].filter(Boolean);
  const clothingFact = labeled(isOutfit ? 'Target outfit' : 'Default clothing', targetClothing);
  const anchorText = [
    `【固定外貌】${stableAppearance || clean(context.identityLabel)}`,
    isOutfit
      ? `【目标服装】${clean(targetClothing) || '符合人物身份与年代的新服装'}`
      : `【默认服装】${targetClothing || '符合人物公开身份与年代的完整日常服装'}`,
    '【一致性要求】保持同一人物的脸、发型、年龄、体态、身材比例与身份特征稳定。',
    '【漂移规避】不要参考当前剧情情绪、关系、记忆、临时事件或当前对话。'
  ].join('\n');
  return {
    anchorText,
    basePositive: [
      `One adult character ${isOutfit ? 'outfit variant' : 'portrait'} for an AVG game set in ${context.worldYear}.`,
      'single person, neutral natural expression, stable identity, full body from head to toe, complete hands and feet',
      'vertical character sprite composition, centered full-body character, safe margins around the whole body',
      'fully rendered human figure, visible facial features and eyes, natural skin detail, distinct hair and clothing tones, detailed fabric and material texture, normal tonal range',
      'plain unobtrusive background or transparent background when the selected image provider supports true alpha',
      ...identityFacts
    ].join('\n'),
    baseNegative: [
      'multiple people, duplicate person, child, cropped head, cropped hands, cropped feet, bust shot, close-up portrait',
      'black silhouette, solid black figure, featureless face, faceless person, shadow-only character, monochrome cutout, flat vector icon, pictogram, placeholder character',
      'complex narrative background, poster layout, text, subtitles, logo, watermark, UI, speech bubble',
      'exaggerated emotion, crying, rage, surprise, action scene, identity drift, face drift, age drift, body proportion distortion',
      ...(isOutfit ? ['default outfit, clothing substitution, unintended wardrobe, changed face, changed hairstyle, changed body shape'] : [])
    ].join(', '),
    appearancePositive: clothingFact,
    additionalPositive: clean(additionalInstruction, 2000),
    additionalNegative: ''
  };
}

export function buildAvgScenePromptParts(
  context: AvgSceneGenerationContext,
  additionalInstruction = ''
): {
  stableDescription: string;
  basePositive: string;
  baseNegative: string;
  additionalPositive: string;
  additionalNegative: string;
  modifiers: Pick<ImagePromptModifierSet, 'narrativeScene'>;
} {
  const stableFacts = [
    labeled('Location', context.locationName),
    labeled('District', context.district),
    labeled('Place type', context.placeType),
    labeled('Stable spatial description', context.stableDescription),
    labeled('Publicly known features', context.publicKnowledge),
    labeled('Address context', context.streetAddress),
    context.roadAnchors?.length ? labeled('Road anchors', context.roadAnchors.join(', ')) : '',
    labeled('Historical context', context.historicalNote),
    context.exposure && context.exposure !== 'unknown' ? labeled('Exposure', context.exposure) : '',
    context.stableSceneTags?.length ? labeled('Stable tags', context.stableSceneTags.join(', ')) : ''
  ].filter(Boolean);
  const stableDescription = stableFacts.join('\n');
  return {
    stableDescription,
    basePositive: [
      `Reusable AVG background base plate set in ${context.worldYear}.`,
      'landscape 16:9 composition, coherent architectural space, clear foreground midground and background depth',
      'clean central and side zones for overlaid character sprites, stable reusable camera, no plot-specific action',
      'neutral base illumination that can accept later time-of-day and weather effects',
      ...stableFacts
    ].join('\n'),
    baseNegative: [
      'prominent foreground character, portrait subject, crowd blocking the stage, plot-specific action',
      'locked night, locked sunset, rain, snow, fog, storm, dramatic weather, weather particles',
      'modern post-period landmark, text, readable signage close-up, subtitles, logo, watermark, UI, map, poster'
    ].join(', '),
    additionalPositive: clean(additionalInstruction, 2000),
    additionalNegative: '',
    modifiers: {
      narrativeScene: {
        positive: 'AVG reusable environment background; preserve spatial continuity and leave practical room for character sprites.',
        negative: 'Avoid foreground character subjects, current actors, current dialogue, current emotion, current time, current weather and one-off plot events.'
      }
    }
  };
}
