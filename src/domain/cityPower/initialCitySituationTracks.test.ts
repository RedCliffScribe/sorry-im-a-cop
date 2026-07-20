import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createInitialCitySituationTrackSeeds } from './initialCitySituationTracks';

describe('initial city situation tracks', () => {
  it('starts a new 1988 save with sparse background tracks', () => {
    const state = createInitialRuntimeState();
    const tracks = Object.values(state.citySituationTracks);

    expect(tracks.length).toBeGreaterThanOrEqual(8);
    expect(tracks.length).toBeLessThanOrEqual(12);
    expect(tracks.map((track) => track.trackId)).toContain('track_1988_mong_kok_nightlife_society_pressure');
    expect(tracks.map((track) => track.trackId)).toContain('track_1988_stock_crash_finance_aftershock');
    expect(tracks.every((track) => track.nextReviewAt)).toBe(true);
    expect(tracks.every((track) => track.pressureLevel >= 0 && track.pressureLevel <= 5)).toBe(true);
  });

  it('creates valid review dates when an opening starts near year end', () => {
    const tracks = createInitialCitySituationTrackSeeds({
      year: 1984,
      month: 12,
      day: 27,
      hour: 19,
      minute: 35
    });

    expect(tracks.track_1988_mong_kok_nightlife_society_pressure.nextReviewAt).toEqual({
      year: 1985,
      month: 1,
      day: 3,
      hour: 19,
      minute: 35
    });
    expect(
      Object.values(tracks).every((track) => track.nextReviewAt !== undefined && track.nextReviewAt.day <= 31)
    ).toBe(true);
  });
});
