import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyCitySituationTrackPatches } from './citySituationTrackPatch';

describe('city situation track patches', () => {
  it('upserts, updates, and resolves tracks', () => {
    const state = createInitialRuntimeState();
    const upsert = applyCitySituationTrackPatches(state, [
      {
        operation: 'upsert',
        trackId: 'track_test_factory_shift',
        title: '工厂北移压力',
        trackType: 'labor_dispute',
        status: 'active',
        pressureLevel: 2,
        visibility: 'public',
        summary: '厂商正在考虑把订单转到内地。',
        currentBeat: '工人听到欠薪风声。',
        possibleDevelopments: ['劳资争议'],
        nextReviewAt: { year: 1988, month: 9, day: 20, hour: 8, minute: 0 }
      }
    ]);

    expect(upsert.tracks.track_test_factory_shift.title).toBe('工厂北移压力');

    const updated = applyCitySituationTrackPatches(
      { ...state, citySituationTracks: upsert.tracks },
      [
        {
          operation: 'update',
          trackId: 'track_test_factory_shift',
          pressureLevel: 4,
          currentBeat: '工人代表开始找报馆放风。'
        }
      ]
    );

    expect(updated.tracks.track_test_factory_shift.pressureLevel).toBe(4);
    expect(updated.tracks.track_test_factory_shift.currentBeat).toContain('报馆');

    const resolved = applyCitySituationTrackPatches(
      { ...state, citySituationTracks: updated.tracks },
      [{ operation: 'resolve', trackId: 'track_test_factory_shift' }]
    );

    expect(resolved.tracks.track_test_factory_shift.status).toBe('resolved');
  });

  it('records diagnostics for invalid update and unknown references', () => {
    const state = createInitialRuntimeState();
    const result = applyCitySituationTrackPatches(state, [
      {
        operation: 'update',
        trackId: 'track_missing',
        currentBeat: 'This update has no target.'
      },
      {
        operation: 'upsert',
        trackId: 'track_bad_refs',
        title: '坏引用测试',
        trackType: 'media_campaign',
        summary: '报馆想追一个还没证实的故事。',
        currentBeat: '编辑部暂时只当风声处理。',
        relatedPlaceIds: ['place_missing'],
        relatedActorIds: ['npc_missing'],
        relatedOrganizationIds: ['org_missing'],
        relatedPowerFigureIds: ['power_missing'],
        possibleDevelopments: ['传闻降温']
      }
    ]);

    expect(result.tracks.track_bad_refs.relatedPlaceIds).toEqual([]);
    expect(result.tracks.track_bad_refs.relatedActorIds).toEqual([]);
    expect(result.tracks.track_bad_refs.relatedOrganizationIds).toEqual([]);
    expect(result.tracks.track_bad_refs.relatedPowerFigureIds).toEqual([]);
    expect(result.diagnostics.some((issue) => issue.code === 'missing_city_situation_track')).toBe(true);
    expect(result.diagnostics.some((issue) => issue.code === 'city_situation_track_bad_reference')).toBe(true);
  });
});
