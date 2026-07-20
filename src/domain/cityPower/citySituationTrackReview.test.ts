import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { reviewCitySituationTracks } from './citySituationTrackReview';

describe('city situation track review', () => {
  it('does not emit visible output when no track is due', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {
      track_film_wrap: {
        trackId: 'track_film_wrap',
        title: '金禾片场警匪片拍摄',
        trackType: 'film_production',
        status: 'active',
        pressureLevel: 2,
        visibility: 'rumor',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 20, hour: 10, minute: 0 },
        relatedOrganizationIds: ['org_golden_harvest'],
        relatedPowerFigureIds: ['power_golden_harvest_chow_boss'],
        relatedPlaceIds: ['place_golden_harvest_studio'],
        relatedActorIds: [],
        summary: '金禾片场有警匪片正在拍摄，片场保安和道具枪管理紧张。',
        currentBeat: '外景队还在赶夜戏。',
        possibleDevelopments: ['杀青新闻', '朋友邀约探班'],
        lastOutputTurnId: undefined
      }
    };

    const result = reviewCitySituationTracks(state, { maxTracks: 2 });

    expect(result.tracks.track_film_wrap.status).toBe('active');
    expect(result.currentMatterPatches).toEqual([]);
    expect(result.newsIssuePatches).toEqual([]);
  });

  it('emits one news item for a due film production track', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 21, hour: 12, minute: 0 };
    state.citySituationTracks = {
      track_film_wrap: {
        trackId: 'track_film_wrap',
        title: '金禾片场警匪片拍摄',
        trackType: 'film_production',
        status: 'active',
        pressureLevel: 2,
        visibility: 'rumor',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 20, hour: 10, minute: 0 },
        relatedOrganizationIds: ['org_golden_harvest'],
        relatedPowerFigureIds: ['power_golden_harvest_chow_boss'],
        relatedPlaceIds: ['place_golden_harvest_studio'],
        relatedActorIds: [],
        summary: '金禾片场有警匪片正在拍摄，片场保安和道具枪管理紧张。',
        currentBeat: '外景队还在赶夜戏。',
        possibleDevelopments: ['杀青新闻', '朋友邀约探班'],
        lastOutputTurnId: undefined
      }
    };

    const result = reviewCitySituationTracks(state, { maxTracks: 2 });

    expect(result.tracks.track_film_wrap.currentBeat).toContain('杀青');
    expect(result.newsIssuePatches).toHaveLength(1);
    expect(result.newsIssuePatches[0]?.articles[0]?.relatedOrganizationIds).toContain('org_golden_harvest');
  });

  it('advances a due hidden film production track without visible patches', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 21, hour: 12, minute: 0 };
    state.citySituationTracks = {
      track_hidden_film_wrap: {
        trackId: 'track_hidden_film_wrap',
        title: '金禾片场秘密补拍',
        trackType: 'film_production',
        status: 'active',
        pressureLevel: 2,
        visibility: 'hidden',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 20, hour: 10, minute: 0 },
        relatedOrganizationIds: ['org_golden_harvest'],
        relatedPowerFigureIds: ['power_golden_harvest_chow_boss'],
        relatedPlaceIds: ['place_golden_harvest_studio'],
        relatedActorIds: [],
        summary: '金禾片场有一组未公开的警匪片补拍安排。',
        currentBeat: '补拍队伍仍在低调收尾。',
        possibleDevelopments: ['杀青新闻', '内部饭局'],
        lastOutputTurnId: undefined
      }
    };

    const result = reviewCitySituationTracks(state, { maxTracks: 2 });

    expect(result.tracks.track_hidden_film_wrap.status).toBe('cooling');
    expect(result.tracks.track_hidden_film_wrap.currentBeat).toContain('杀青');
    expect(result.diagnostics).toContain('advanced:track_hidden_film_wrap');
    expect(result.newsIssuePatches).toEqual([]);
    expect(result.currentMatterPatches).toEqual([]);
  });

  it('caps visible output while still advancing due tracks', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 10, day: 1, hour: 9, minute: 0 };
    state.citySituationTracks = Object.fromEntries(
      ['a', 'b', 'c'].map((suffix) => [
        `track_due_${suffix}`,
        {
          trackId: `track_due_${suffix}`,
          title: `到期公开轨道 ${suffix}`,
          trackType: 'market_pressure',
          status: 'active',
          pressureLevel: 2,
          visibility: 'public',
          startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
          nextReviewAt: { year: 1988, month: 9, day: 20, hour: 8, minute: 0 },
          relatedOrganizationIds: [],
          relatedPowerFigureIds: [],
          relatedPlaceIds: [],
          relatedActorIds: [],
          summary: '公开市场压力继续发酵。',
          currentBeat: '财经版继续追问。',
          possibleDevelopments: ['财经新闻']
        }
      ])
    );

    const result = reviewCitySituationTracks(state, { maxTracks: 2, maxVisibleOutputs: 1 });

    expect(result.diagnostics.filter((item) => item.startsWith('advanced:'))).toHaveLength(2);
    expect(result.newsIssuePatches.length + result.currentMatterPatches.length + result.signalPatches.length).toBe(1);
  });

  it('turns rumor triad expansion into signal and gray network pressure, not public news', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 25, hour: 9, minute: 0 };
    state.citySituationTracks = {
      track_triad_rumor: {
        trackId: 'track_triad_rumor',
        title: '旺角夜场插旗风声',
        trackType: 'triad_expansion',
        status: 'active',
        pressureLevel: 2,
        visibility: 'rumor',
        startedAt: { year: 1988, month: 9, day: 12, hour: 8, minute: 0 },
        nextReviewAt: { year: 1988, month: 9, day: 20, hour: 8, minute: 0 },
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: ['place_portland_street'],
        relatedActorIds: [],
        summary: '旺角夜场有基层社团试探。',
        currentBeat: '看场和收数风声变密。',
        possibleDevelopments: ['街面传闻']
      }
    };

    const result = reviewCitySituationTracks(state, { maxTracks: 2 });

    expect(result.signalPatches).toHaveLength(1);
    expect(result.grayNetworkPatches).toHaveLength(1);
    expect(result.newsIssuePatches).toEqual([]);
  });

  it('rolls the next review date across month and year boundaries', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1984, month: 12, day: 31, hour: 19, minute: 35 };
    state.citySituationTracks = {
      track_year_end: {
        trackId: 'track_year_end',
        title: '跨年厂商北运安排',
        trackType: 'market_pressure',
        status: 'active',
        pressureLevel: 2,
        visibility: 'public',
        cadenceDays: 14,
        startedAt: { year: 1984, month: 12, day: 1, hour: 8, minute: 0 },
        nextReviewAt: { year: 1984, month: 12, day: 31, hour: 18, minute: 0 },
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: [],
        relatedActorIds: [],
        summary: '厂商继续协调北运档期。',
        currentBeat: '货运安排仍在调整。',
        possibleDevelopments: ['档期延后']
      }
    };

    const result = reviewCitySituationTracks(state);

    expect(result.tracks.track_year_end.nextReviewAt).toEqual({
      year: 1985,
      month: 1,
      day: 14,
      hour: 19,
      minute: 35
    });
  });
});
