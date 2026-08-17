import { describe, expect, it } from 'vitest';
import { selectHistoricalHongKongNewsAnchors } from './historicalHongKongNewsAnchors';

describe('historical Hong Kong news anchors', () => {
  it('never exposes a historical fact before its dated availability', () => {
    expect(
      selectHistoricalHongKongNewsAnchors({ year: 1990, month: 4, day: 3, hour: 20, minute: 0 })
    ).toEqual([]);
    expect(
      selectHistoricalHongKongNewsAnchors({ year: 1990, month: 4, day: 4, hour: 20, minute: 0 })
        .map((anchor) => anchor.id)
    ).toContain('hk_1990_basic_law');
  });

  it('provides dated public-news anchors for the supported opening eras', () => {
    const dates = [
      { year: 1980, month: 3, day: 3, hour: 8, minute: 30 },
      { year: 1984, month: 12, day: 20, hour: 19, minute: 20 },
      { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
      { year: 1990, month: 4, day: 6, hour: 14, minute: 10 },
      { year: 1994, month: 7, day: 8, hour: 17, minute: 45 },
      { year: 1996, month: 11, day: 1, hour: 22, minute: 5 }
    ];

    for (const date of dates) {
      expect(selectHistoricalHongKongNewsAnchors(date).length).toBeGreaterThan(0);
    }
  });
});
