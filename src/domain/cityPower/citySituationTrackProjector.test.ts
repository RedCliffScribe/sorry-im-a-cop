import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { projectCitySituationTrackContext } from './citySituationTrackProjector';

describe('city situation track projector', () => {
  it('selects at most four visible relevant tracks', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `track_public_${index}`,
        {
          trackId: `track_public_${index}`,
          title: `公开轨道 ${index}`,
          trackType: 'media_campaign',
          status: 'active',
          pressureLevel: 1,
          visibility: 'public',
          startedAt: state.time,
          nextReviewAt: state.time,
          relatedOrganizationIds: [],
          relatedPowerFigureIds: [],
          relatedPlaceIds: [],
          relatedActorIds: [],
          summary: '报馆正在追一个公开议题。',
          currentBeat: '编辑部继续追问。',
          possibleDevelopments: ['新闻']
        }
      ])
    );

    const projection = projectCitySituationTrackContext(state, '问报馆有什么风声');

    expect(projection.tracks).toHaveLength(4);
    expect(projection.tracks.every((track) => track.visibility !== 'hidden')).toBe(true);
  });

  it('keeps hidden tracks out of prompt projection', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {
      track_hidden: {
        trackId: 'track_hidden',
        title: '隐藏轨道',
        trackType: 'icac_investigation',
        status: 'active',
        pressureLevel: 3,
        visibility: 'hidden',
        startedAt: state.time,
        nextReviewAt: state.time,
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: [],
        relatedActorIds: [],
        summary: '隐藏调查不能投喂。',
        currentBeat: '隐藏调查仍在后台。',
        possibleDevelopments: ['内部约谈']
      }
    };

    expect(projectCitySituationTrackContext(state, '廉署有什么消息').tracks).toEqual([]);
  });
});
