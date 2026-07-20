import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  applyExperienceGain,
  normalizePlayerProgression,
  spendPlayerAttributePoint
} from './playerProgression';

describe('playerProgression', () => {
  it('normalizes invalid progression values to safe local defaults', () => {
    expect(
      normalizePlayerProgression({
        level: 0,
        experience: -12,
        unspentAttributePoints: -3
      })
    ).toEqual({
      level: 1,
      experience: 0,
      unspentAttributePoints: 0
    });
  });

  it('supports gaining several levels and awards five attribute points per level', () => {
    const result = applyExperienceGain(
      {
        level: 1,
        experience: 90,
        unspentAttributePoints: 0
      },
      220
    );

    expect(result).toEqual({
      progression: {
        level: 3,
        experience: 10,
        unspentAttributePoints: 10
      },
      levelsGained: 2,
      attributePointsGained: 10
    });
  });

  it('spends one free point on a player attribute', () => {
    const state = createInitialRuntimeState();
    state.player.progression.unspentAttributePoints = 1;
    state.player.attributes.body = 50;

    const result = spendPlayerAttributePoint(state.player, 'body');

    expect(result.applied).toBe(true);
    expect(result.player.attributes.body).toBe(51);
    expect(result.player.progression.unspentAttributePoints).toBe(0);
  });

  it('rejects spending when no free point remains', () => {
    const state = createInitialRuntimeState();
    state.player.progression.unspentAttributePoints = 0;

    const result = spendPlayerAttributePoint(state.player, 'body');

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('no_points');
  });

  it('rejects spending when the attribute already reached its cap', () => {
    const state = createInitialRuntimeState();
    state.player.progression.unspentAttributePoints = 1;
    state.player.attributes.body = 100;

    const result = spendPlayerAttributePoint(state.player, 'body');

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('attribute_at_cap');
    expect(result.player.progression.unspentAttributePoints).toBe(1);
  });
});
