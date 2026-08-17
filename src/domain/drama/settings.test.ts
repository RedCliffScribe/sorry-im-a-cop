import { describe, expect, it } from 'vitest';
import {
  defaultDramaticContentSettings,
  normalizeDramaticContentSettings,
  resolveDramaMaterialBudget
} from './settings';

describe('dramatic content settings', () => {
  it('keeps the legacy flow as the default', () => {
    expect(defaultDramaticContentSettings).toEqual({
      pacing: 'original',
      materialLevel: 'standard',
      planningRoute: 'auto',
      channels: {
        work_livelihood: 'medium',
        relationships: 'medium',
        cases_law: 'medium',
        organizations: 'medium',
        city_news: 'medium',
        era_storypack: 'medium',
        screen_characters: 'medium',
        custom_characters: 'medium',
        custom_events: 'medium'
      }
    });
  });

  it.each([
    ['minimal', 4, 2, 1, 4],
    ['restrained', 5, 2, 1, 5],
    ['standard', 6, 3, 1, 6],
    ['rich', 8, 4, 1, 8],
    ['extended', 10, 5, 1, 10]
  ] as const)(
    'resolves the %s material budget',
    (materialLevel, dynamicLimit, staticLimit, supportLimit, quietWindowTurns) => {
      expect(resolveDramaMaterialBudget({
        ...defaultDramaticContentSettings,
        materialLevel
      })).toEqual({ dynamicLimit, staticLimit, supportLimit, quietWindowTurns });
    }
  );

  it('uses bounded custom values without changing preset budgets', () => {
    expect(resolveDramaMaterialBudget({
      ...defaultDramaticContentSettings,
      pacing: 'custom',
      materialLevel: 'rich',
      custom: {
        dynamicLimit: 0,
        staticLimit: -2,
        supportLimit: 5.9,
        quietWindowTurns: 0
      }
    })).toEqual({
      dynamicLimit: 1,
      staticLimit: 0,
      supportLimit: 1,
      quietWindowTurns: 1
    });
  });

  it('merges old partial settings with every registered channel', () => {
    expect(normalizeDramaticContentSettings({
      pacing: 'life',
      channels: {
        ...defaultDramaticContentSettings.channels,
        city_news: 'off'
      }
    }).channels).toEqual({
      ...defaultDramaticContentSettings.channels,
      city_news: 'off'
    });
  });
});
