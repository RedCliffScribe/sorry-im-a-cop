import { describe, expect, it } from 'vitest';
import { compileCharacterPrompt, compileScenePrompt } from './compiler';
import { DEFAULT_CHARACTER_VISUAL_PURPOSE, type ImagePromptModifierSet } from './types';

const modifiers: ImagePromptModifierSet = {
  global: { positive: 'global+', negative: 'global-' },
  characterCommon: { positive: 'common+', negative: 'common-' },
  characterViews: {
    'avatar-close-up': { positive: 'avatar+', negative: 'avatar-' },
    'half-body-medium': { positive: 'half+', negative: 'half-' },
    'knee-up-medium-full': { positive: 'knee-up+', negative: 'knee-up-' },
    'full-body': { positive: 'full+', negative: 'full-' }
  },
  narrativeScene: { positive: 'scene+', negative: 'scene-' }
};

describe('semantic prompt compiler priority', () => {
  it('freezes half-body as the default single character preview purpose', () => {
    expect(DEFAULT_CHARACTER_VISUAL_PURPOSE).toBe('half-body-medium');
  });

  it('places resolved character additions last without appending raw natural-language input', () => {
    const result = compileCharacterPrompt({
      purpose: 'half-body-medium',
      basePositive: 'base+',
      baseNegative: 'base-',
      appearanceSource: 'anchor-default',
      resolvedAppearancePositive: 'default outfit+',
      resolvedAdditionalPositive: 'resolved+',
      resolvedAdditionalNegative: 'resolved-'
    }, modifiers, [{ positive: 'style+', negative: 'style-' }]);

    expect(result.positive.split('\n')).toEqual([
      'base+', 'default outfit+', 'common+', 'half+', 'style+', 'global+', 'resolved+'
    ]);
    expect(result.negative.split('\n')).toEqual(['base-', 'common-', 'half-', 'style-', 'global-', 'resolved-']);
    expect(result.positive).not.toContain('原始自然语言');
    expect(result.segments.map((segment) => [segment.segmentId, segment.kind, segment.priority])).toEqual([
      ['subject:character', 'subject', 50],
      ['character-appearance:current', 'scene-appearance', 60],
      ['character-identity:common', 'character-identity', 50],
      ['composition:half-body-medium', 'composition', 30],
      ['style:0', 'style', 20],
      ['quality:global', 'quality', 10],
      ['one-time-requirement:character', 'one-time-requirement', 80]
    ]);
  });

  it('places an additional-requirement outfit override after ordinary character styling and audits persistent mode', () => {
    const result = compileCharacterPrompt({
      purpose: 'half-body-medium',
      basePositive: 'fixed identity+',
      baseNegative: 'identity drift-',
      appearanceSource: 'additional-requirement-override',
      resolvedAppearancePositive: 'wet white shirt, jacket removed',
      resolvedAdditionalPositive: 'red hair clip',
      resolvedAdditionalNegative: ''
    }, modifiers, [], undefined, 'persistent');

    expect(result.positive.split('\n')).toEqual([
      'fixed identity+', 'common+', 'half+', 'global+', 'wet white shirt, jacket removed', 'red hair clip'
    ]);
    expect(result.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        segmentId: 'character-appearance:current',
        kind: 'scene-appearance',
        priority: 80
      }),
      expect.objectContaining({
        segmentId: 'persistent-requirement:character',
        kind: 'persistent-requirement',
        priority: 80
      })
    ]));
  });

  it('adds explicit character orientation without using the ambiguous cowboy token', () => {
    const result = compileCharacterPrompt({
      purpose: 'knee-up-medium-full',
      basePositive: 'base+',
      baseNegative: 'base-',
      resolvedAdditionalPositive: '',
      resolvedAdditionalNegative: ''
    }, modifiers, [], {
      viewAngle: 'three-quarter-right',
      cameraElevation: 'slight-high'
    });

    expect(result.positive).toContain('右前方四分之三视角');
    expect(result.positive).toContain('镜头轻微高于人物视线');
    expect(result.positive.toLowerCase()).not.toContain('cowboy');
    expect(result.segments).toContainEqual(expect.objectContaining({
      segmentId: 'composition:character-camera',
      kind: 'composition',
      priority: 75
    }));
  });

  it('resolves fixed identity, scene appearance, persistent additions and one-time additions in order', () => {
    const result = compileScenePrompt({
      basePositive: 'base+',
      baseNegative: 'base-',
      participantResolutions: [{
        actorId: 'actor_1',
        fixedIdentityPositive: 'identity+',
        fixedIdentityNegative: 'identity-',
        appearanceSource: 'scene-specific-override',
        resolvedAppearancePositive: 'wet-shirt+',
        resolvedAdditionalPositive: 'persistent+',
        resolvedAdditionalNegative: 'persistent-'
      }],
      resolvedOneTimePositive: 'one-time+',
      resolvedOneTimeNegative: 'one-time-'
    }, modifiers, [{ positive: 'style+', negative: 'style-' }]);

    expect(result.positive.split('\n')).toEqual([
      'base+', 'identity+', 'wet-shirt+', 'style+', 'scene+', 'global+', 'persistent+', 'one-time+'
    ]);
    expect(result.negative.split('\n')).toEqual([
      'base-', 'identity-', 'style-', 'scene-', 'global-', 'persistent-', 'one-time-'
    ]);
  });
});
