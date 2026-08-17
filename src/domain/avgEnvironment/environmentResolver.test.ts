import { describe, expect, it } from 'vitest';
import type { StoryEntry, WeatherCondition } from '../runtime/types';
import { hk1988AvgEnvironmentAdapter } from '../worldpack/hk1988AvgSceneEnvironment';
import { resolveAvgEnvironmentVisualState } from './environmentResolver';

function entry(input: {
  hour?: number;
  minute?: number;
  weather?: WeatherCondition;
  intensity?: number;
  legacyWeatherDescription?: string;
  withVisualContext?: boolean;
} = {}): StoryEntry {
  const withVisualContext = input.withVisualContext ?? true;
  return {
    turnId: 'turn_environment',
    speaker: 'narrator',
    text: '正文不参与环境解析。',
    gameTime: {
      year: 1988,
      month: 8,
      day: 10,
      hour: input.hour ?? 12,
      minute: input.minute ?? 0
    },
    ...(withVisualContext
      ? {
          visualContext: {
            timeDescription: '冻结时间',
            locationDescription: '冻结地点',
            ...(input.legacyWeatherDescription
              ? { weatherDescription: input.legacyWeatherDescription }
              : {}),
            presentActorIds: [],
            ...(input.weather
              ? {
                  structuredEnvironment: {
                    weatherCondition: input.weather,
                    weatherIntensity: input.intensity ?? 50,
                    placeId: 'place_fixture'
                  }
                }
              : {})
          }
        }
      : {})
  };
}

function resolve(input: {
  storyEntry?: StoryEntry;
  sceneAssetId?: string;
  registryTags?: string[];
}) {
  return resolveAvgEnvironmentVisualState({
    ...input,
    worldpackAdapter: hk1988AvgEnvironmentAdapter
  });
}

describe('AVG environment visual resolver', () => {
  it('keeps clear daytime close to the accepted base art', () => {
    const { state } = resolve({
      storyEntry: entry({ weather: 'clear', intensity: 20 }),
      sceneAssetId: 'mong_kok_dense_street'
    });
    expect(state).toMatchObject({
      timePhase: 'day',
      weatherKind: 'clear',
      sceneExposure: 'outdoor',
      overlays: []
    });
    expect(state.backgroundGrade).toMatchObject({ brightness: 1, contrast: 1, saturation: 1 });
    expect(state.portraitGrade).toMatchObject({ brightness: 1, contrast: 1, saturation: 1 });
  });

  it('shows precipitation outdoors and clamps a late-night storm to readable grades', () => {
    const { state } = resolve({
      storyEntry: entry({ hour: 2, weather: 'thunderstorm', intensity: 100 }),
      sceneAssetId: 'mong_kok_dense_street'
    });
    expect(state.timePhase).toBe('late_night');
    expect(state.weatherKind).toBe('storm');
    expect(state.overlays).toEqual([
      expect.objectContaining({ kind: 'rain' })
    ]);
    expect(state.backgroundGrade.brightness).toBeGreaterThanOrEqual(0.64);
    expect(state.portraitGrade.brightness).toBeGreaterThanOrEqual(0.82);
    expect(state.portraitGrade.brightness).toBeGreaterThan(state.backgroundGrade.brightness);
  });

  it('keeps rain lines out of indoor scenes while retaining a restrained weather grade', () => {
    const { state } = resolve({
      storyEntry: entry({ hour: 22, weather: 'heavy_rain', intensity: 80 }),
      sceneAssetId: 'police_cid_office'
    });
    expect(state.sceneExposure).toBe('indoor');
    expect(state.lightingProfile).toBe('artificial');
    expect(state.overlays).toEqual([]);
    expect(state.backgroundGrade.brightness).toBeLessThan(1);
    expect(state.backgroundGrade.brightness).toBeGreaterThan(0.8);
    expect(state.portraitGrade.brightness).toBeGreaterThanOrEqual(0.82);
  });

  it('keeps a late-night nightclub brighter than an outdoor street', () => {
    const storyEntry = entry({ hour: 1, weather: 'clear', intensity: 20 });
    const nightclub = resolve({ storyEntry, sceneAssetId: 'nightclub' }).state;
    const street = resolve({ storyEntry, sceneAssetId: 'mong_kok_dense_street' }).state;
    expect(nightclub.lightingProfile).toBe('nightlife');
    expect(nightclub.backgroundGrade.brightness).toBeGreaterThan(street.backgroundGrade.brightness);
  });

  it('suppresses heavy precipitation when exposure is unknown', () => {
    const { state } = resolve({
      storyEntry: entry({ weather: 'heavy_rain', intensity: 90 }),
      sceneAssetId: 'extension_scene_without_profile'
    });
    expect(state.sceneExposure).toBe('unknown');
    expect(state.overlays).toEqual([]);
  });

  it('uses explicit registry exposure tags before worldpack metadata', () => {
    const { state } = resolve({
      storyEntry: entry({ weather: 'light_rain', intensity: 45 }),
      sceneAssetId: 'police_cid_office',
      registryTags: ['outdoor']
    });
    expect(state.sceneExposure).toBe('outdoor');
    expect(state.source.exposureSource).toBe('registry_tags');
    expect(state.overlays[0]?.kind).toBe('rain');
  });

  it('supports legacy frozen weather descriptions and leaves missing legacy context neutral', () => {
    const legacy = resolve({
      storyEntry: entry({ legacyWeatherDescription: '细雨；路面略湿' }),
      sceneAssetId: 'mong_kok_dense_street'
    }).state;
    const missing = resolve({
      storyEntry: entry({ withVisualContext: false }),
      sceneAssetId: 'mong_kok_dense_street'
    }).state;
    expect(legacy.weatherKind).toBe('rain');
    expect(legacy.source.weatherSource).toBe('visual_context');
    expect(missing.weatherKind).toBe('unknown');
    expect(missing.overlays).toEqual([]);
  });

  it('does not mutate the StoryEntry and changes only the visual key for environment changes', () => {
    const original = entry({ hour: 17, weather: 'cloudy', intensity: 35 });
    const before = structuredClone(original);
    const dusk = resolve({ storyEntry: original, sceneAssetId: 'victoria_harbour_view' }).state;
    const nightEntry = structuredClone(original);
    nightEntry.gameTime.hour = 21;
    const night = resolve({ storyEntry: nightEntry, sceneAssetId: 'victoria_harbour_view' }).state;
    expect(original).toEqual(before);
    expect(dusk.key).not.toBe(night.key);
    expect(dusk.source.sceneAssetId).toBe(night.source.sceneAssetId);
  });

  it('renders outdoor fog without applying it to an indoor portrait foreground', () => {
    const outdoor = resolve({
      storyEntry: entry({ weather: 'foggy', intensity: 55 }),
      sceneAssetId: 'peak_mountain_road'
    }).state;
    const indoor = resolve({
      storyEntry: entry({ weather: 'foggy', intensity: 55 }),
      sceneAssetId: 'hospital_corridor'
    }).state;
    expect(outdoor.overlays[0]?.kind).toBe('fog');
    expect(indoor.overlays).toEqual([]);
    expect(outdoor.portraitGrade.contrast).toBeGreaterThanOrEqual(0.9);
  });
});
