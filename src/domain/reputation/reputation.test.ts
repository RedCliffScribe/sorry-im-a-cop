import { describe, expect, it } from 'vitest';
import type { ReputationByCircle } from '../runtime/types';
import {
  createInitialReputationState,
  deriveOverallReputationFromCircles,
  normalizePlayerReputationState
} from './reputation';

function neutralCircles(): ReputationByCircle {
  return createInitialReputationState('civilian').circles;
}

describe('overall reputation aggregation', () => {
  it('keeps unknown circles neutral and gives a small audience proportionate influence', () => {
    const circles = neutralCircles();
    circles.neighborhoodMedia = {
      visibility: 10,
      standing: 50,
      summary: '少量街坊形成正面印象。'
    };

    expect(deriveOverallReputationFromCircles(circles, 0)).toBe(5);
  });

  it('combines multiple visible circles instead of copying one circle score', () => {
    const circles = neutralCircles();
    circles.police = { visibility: 500, standing: 50, summary: '警队评价正面。' };
    circles.neighborhoodMedia = { visibility: 500, standing: -10, summary: '公众略有质疑。' };

    expect(deriveOverallReputationFromCircles(circles, 0)).toBe(18);
  });

  it('does not let a zero-visibility circle alter overall reputation', () => {
    const circles = neutralCircles();
    circles.politics = { visibility: 0, standing: -100, summary: '尚未实际传播。' };

    expect(deriveOverallReputationFromCircles(circles, 0)).toBe(0);
  });

  it('migrates a legacy overall score without changing it or drifting on repeated loads', () => {
    const fallback = createInitialReputationState('civilian');
    const legacy = {
      ...fallback,
      overallReputation: 20,
      overallReputationBaseline: undefined,
      circles: {
        ...fallback.circles,
        business: { visibility: 100, standing: -20, summary: '商业圈评价转差。' }
      }
    };

    const first = normalizePlayerReputationState(legacy, fallback);
    const second = normalizePlayerReputationState(first, fallback);

    expect(first.overallReputationBaseline).toBe(60);
    expect(first.overallReputation).toBe(20);
    expect(second.overallReputation).toBe(first.overallReputation);
    expect(second.overallReputationBaseline).toBe(first.overallReputationBaseline);
  });
});
