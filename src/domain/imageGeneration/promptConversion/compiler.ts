import type { CharacterViewPrompt, SceneShotPromptOutput } from './schemas';
import type {
  CharacterComposition,
  CharacterVisualPurpose,
  ImagePromptModifier,
  ImagePromptModifierSet,
  SemanticImagePrompt,
  SemanticImagePromptSegment,
  SemanticImagePromptSegmentKind
} from './types';
import {
  CHARACTER_CAMERA_ELEVATION_PROMPTS,
  CHARACTER_VIEW_ANGLE_PROMPTS,
  DEFAULT_CHARACTER_COMPOSITION
} from './types';

function joinPromptParts(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join('\n');
}

function segment(
  segmentId: string,
  kind: SemanticImagePromptSegmentKind,
  priority: number,
  positive: string | undefined,
  negative: string | undefined,
  required = false
): SemanticImagePromptSegment {
  return {
    segmentId,
    kind,
    priority,
    positive: positive?.trim() ?? '',
    negative: negative?.trim() ?? '',
    required
  };
}

function compileSegments(segments: SemanticImagePromptSegment[]): SemanticImagePrompt {
  const visible = segments.filter((item) => item.positive || item.negative);
  return {
    positive: joinPromptParts(visible.map((item) => item.positive)),
    negative: joinPromptParts(visible.map((item) => item.negative)),
    segments: visible
  };
}

export function compileCharacterPrompt(
  view: CharacterViewPrompt,
  modifiers: ImagePromptModifierSet,
  styleModifiers: readonly ImagePromptModifier[] = [],
  composition: CharacterComposition = DEFAULT_CHARACTER_COMPOSITION,
  requirementMode: 'one-time' | 'persistent' | 'none' = 'one-time',
  externalStyleSegments: readonly SemanticImagePromptSegment[] = []
): SemanticImagePrompt {
  const purpose = view.purpose as CharacterVisualPurpose;
  const viewModifier = modifiers.characterViews[purpose];
  const compositionPositive = joinPromptParts([
    CHARACTER_VIEW_ANGLE_PROMPTS[composition.viewAngle],
    CHARACTER_CAMERA_ELEVATION_PROMPTS[composition.cameraElevation]
  ]);
  const appearance = segment(
    'character-appearance:current',
    'scene-appearance',
    view.appearanceSource === 'additional-requirement-override' ? 80 : 60,
    view.resolvedAppearancePositive,
    ''
  );
  const additional = requirementMode === 'none'
    ? []
    : [segment(
        requirementMode === 'persistent'
          ? 'persistent-requirement:character'
          : 'one-time-requirement:character',
        requirementMode === 'persistent' ? 'persistent-requirement' : 'one-time-requirement',
        80,
        view.resolvedAdditionalPositive,
        view.resolvedAdditionalNegative
      )];
  return compileSegments([
    segment('subject:character', 'subject', 50, view.basePositive, view.baseNegative, true),
    ...(view.appearanceSource !== 'additional-requirement-override' ? [appearance] : []),
    segment('character-identity:common', 'character-identity', 50,
      modifiers.characterCommon.positive, modifiers.characterCommon.negative),
    segment(`composition:${purpose}`, 'composition', 30,
      viewModifier.positive, viewModifier.negative),
    segment('composition:character-camera', 'composition', 75, compositionPositive, ''),
    ...styleModifiers.map((modifier, index) =>
      segment(`style:${index}`, 'style', 20, modifier.positive, modifier.negative)),
    ...structuredClone(externalStyleSegments),
    segment('quality:global', 'quality', 10, modifiers.global.positive, modifiers.global.negative),
    ...(view.appearanceSource === 'additional-requirement-override' ? [appearance] : []),
    ...additional
  ]);
}

export function compileScenePrompt(
  output: SceneShotPromptOutput,
  modifiers: ImagePromptModifierSet,
  styleModifiers: readonly ImagePromptModifier[] = [],
  externalStyleSegments: readonly SemanticImagePromptSegment[] = []
): SemanticImagePrompt {
  return compileSegments([
    segment('subject:scene', 'subject', 40, output.basePositive, output.baseNegative, true),
    ...output.participantResolutions.map((participant) =>
      segment(`character-identity:${participant.actorId}`, 'character-identity', 50,
        participant.fixedIdentityPositive, participant.fixedIdentityNegative, true)),
    ...output.participantResolutions.map((participant) =>
      segment(`scene-appearance:${participant.actorId}`, 'scene-appearance', 60,
        participant.resolvedAppearancePositive, '')),
    ...styleModifiers.map((modifier, index) =>
      segment(`style:${index}`, 'style', 20, modifier.positive, modifier.negative)),
    ...structuredClone(externalStyleSegments),
    segment('composition:scene-template', 'composition', 30,
      modifiers.narrativeScene.positive, modifiers.narrativeScene.negative),
    segment('quality:global', 'quality', 10, modifiers.global.positive, modifiers.global.negative),
    ...output.participantResolutions.map((participant) =>
      segment(`persistent-requirement:${participant.actorId}`, 'persistent-requirement', 70,
        participant.resolvedAdditionalPositive, participant.resolvedAdditionalNegative)),
    segment('one-time-requirement:scene', 'one-time-requirement', 80,
      output.resolvedOneTimePositive, output.resolvedOneTimeNegative)
  ]);
}
