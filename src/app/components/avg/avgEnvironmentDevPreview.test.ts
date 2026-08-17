import { createInitialRuntimeState } from '../../../domain/runtime/initialState';
import type { StoryEntry } from '../../../domain/runtime/types';
import {
  applyAvgEnvironmentDevPreview,
  applyAvgFixedIdentityDevPreview
} from './avgEnvironmentDevPreview';

const entry: StoryEntry = {
  turnId: 'turn_1',
  speaker: 'narrator',
  text: '测试正文',
  gameTime: { year: 1988, month: 9, day: 12, hour: 10, minute: 15 },
  visualContext: {
    timeDescription: '上午十时',
    locationDescription: 'CID办公室',
    weatherDescription: 'clear',
    presentActorIds: [],
    structuredEnvironment: {
      weatherCondition: 'clear',
      weatherIntensity: 20,
      placeId: 'place_mong_kok_police_station'
    }
  }
};

describe('AVG environment development preview', () => {
  it('applies a non-persistent visual QA combination when explicitly enabled', () => {
    const result = applyAvgEnvironmentDevPreview(
      entry,
      '?avgEnvQa=1&avgHour=23&avgWeather=heavy_rain&avgWeatherIntensity=88&avgScene=mong_kok_dense_street&avgQaLabel=Rain',
      true
    );

    expect(result.storyEntry).not.toBe(entry);
    expect(result.storyEntry.gameTime.hour).toBe(23);
    expect(result.storyEntry.visualContext?.structuredEnvironment).toEqual(
      expect.objectContaining({ weatherCondition: 'heavy_rain', weatherIntensity: 88 })
    );
    expect(result.sceneInput).toEqual(expect.objectContaining({
      runtimeSceneId: 'scene_mong_kok_dense_street'
    }));
    expect(result.label).toBe('Rain');
    expect(entry.gameTime.hour).toBe(10);
    expect(entry.visualContext?.structuredEnvironment?.weatherCondition).toBe('clear');
  });

  it('is inert outside development preview mode and rejects unsafe values', () => {
    expect(applyAvgEnvironmentDevPreview(entry, '?avgEnvQa=1&avgHour=23', false))
      .toEqual({ storyEntry: entry });
    const result = applyAvgEnvironmentDevPreview(
      entry,
      '?avgEnvQa=1&avgHour=99&avgWeather=acid&avgScene=../secret',
      true
    );
    expect(result.storyEntry.gameTime.hour).toBe(10);
    expect(result.storyEntry.visualContext?.structuredEnvironment?.weatherCondition).toBe('clear');
    expect(result.sceneInput).toBeUndefined();
  });

  it('can bind a fixed identity in a cloned development runtime without mutating the save', () => {
    const state = createInitialRuntimeState();
    const player = state.actors[state.player.actorId]!;
    const runtimeState = {
      ...state,
      actors: {
        ...state.actors,
        npc_fixture: { ...player, actorId: 'npc_fixture', name: '固定人物验收' }
      }
    };
    const preview = applyAvgFixedIdentityDevPreview(
      runtimeState,
      '?avgEnvQa=1&avgFixedActorId=npc_fixture&avgFixedIdentityKind=era_seed&avgFixedCanonicalId=fig_red_chung_glamour_star',
      true
    );

    expect(preview).not.toBe(runtimeState);
    expect(preview.actors.npc_fixture?.stableIdentityRef).toEqual({
      worldpackId: 'hk1988',
      kind: 'era_seed',
      canonicalId: 'fig_red_chung_glamour_star'
    });
    expect(runtimeState.actors.npc_fixture?.stableIdentityRef).toBeUndefined();
  });
});
