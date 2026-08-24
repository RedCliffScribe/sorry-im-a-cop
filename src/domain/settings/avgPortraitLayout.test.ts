import {
  DEFAULT_AVG_PORTRAIT_LAYOUT,
  areAvgPortraitLayoutsEqual,
  normalizeAvgPortraitLayout
} from './avgPortraitLayout';

describe('avg portrait layout settings', () => {
  it('uses the legacy-safe default for missing or invalid values', () => {
    expect(normalizeAvgPortraitLayout(undefined)).toEqual(DEFAULT_AVG_PORTRAIT_LAYOUT);
    expect(normalizeAvgPortraitLayout({
      scalePercent: 'huge',
      horizontalOffsetPercent: Number.NaN,
      verticalOffsetPercent: null
    })).toEqual(DEFAULT_AVG_PORTRAIT_LAYOUT);
  });

  it('rounds and clamps layout values to visible presentation bounds', () => {
    expect(normalizeAvgPortraitLayout({
      scalePercent: 999,
      horizontalOffsetPercent: -999,
      verticalOffsetPercent: 18.6
    })).toEqual({
      scalePercent: 180,
      horizontalOffsetPercent: -40,
      verticalOffsetPercent: 19
    });
  });

  it('compares all three persisted layout axes', () => {
    const baseline = normalizeAvgPortraitLayout(undefined);
    expect(areAvgPortraitLayoutsEqual(baseline, { ...baseline })).toBe(true);
    expect(areAvgPortraitLayoutsEqual(baseline, {
      ...baseline,
      scalePercent: 101
    })).toBe(false);
  });
});
