import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import {
  createInitialCitySituationTrackSeeds,
  refreshPristineCitySituationTrackSeeds
} from './initialCitySituationTracks';

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

  it('uses the opening era instead of projecting later events backward', () => {
    const tracks1986 = createInitialCitySituationTrackSeeds({
      year: 1986,
      month: 6,
      day: 1,
      hour: 9,
      minute: 0
    });
    const tracks1994 = createInitialCitySituationTrackSeeds({
      year: 1994,
      month: 7,
      day: 1,
      hour: 9,
      minute: 0
    });

    expect(tracks1986.track_1988_stock_crash_finance_aftershock.title).toBe('香港股市与融资压力');
    expect(tracks1986.track_1988_stock_crash_finance_aftershock.summary).not.toContain('八七股灾');
    expect(tracks1986.track_1988_clear_water_bay_tv_studio_pressure.title).toBe('电视制作与片场迁移压力');
    expect(tracks1994.track_1988_kowloon_walled_city_clearance_pressure.title).toBe(
      '九龙城寨清拆后的安置与重建'
    );
    expect(tracks1994.track_1988_clear_water_bay_tv_studio_pressure.title).toBe('清水湾电视制作压力');
  });

  it('refreshes only untouched legacy era seeds when loading an old save', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1994, month: 7, day: 1, hour: 9, minute: 0 };
    const stock = state.citySituationTracks.track_1988_stock_crash_finance_aftershock;
    const walledCity = state.citySituationTracks.track_1988_kowloon_walled_city_clearance_pressure;
    stock.title = '八七股灾余波';
    stock.summary = '旧默认资料';
    walledCity.lastOutputTurnId = 'turn_city_changed';
    walledCity.currentBeat = '玩家存档已经演化出的事实。';

    const refreshed = refreshPristineCitySituationTrackSeeds(state.citySituationTracks, state.time);
    const defaulted = withRuntimeDefaults({ ...state, citySituationTracks: refreshed });

    expect(defaulted.citySituationTracks.track_1988_stock_crash_finance_aftershock.title).toBe(
      '香港股市与融资压力'
    );
    expect(defaulted.citySituationTracks.track_1988_kowloon_walled_city_clearance_pressure.currentBeat).toBe(
      '玩家存档已经演化出的事实。'
    );
  });
});
