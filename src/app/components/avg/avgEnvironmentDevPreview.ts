import {
  normalizeAvgWorldpackId,
  type AvgScenePresentationInput
} from '../../../domain/avgPresentation';
import type { StableIdentityKind } from '../../../domain/avgResourcePack';
import type { RuntimeState, StoryEntry, WeatherCondition } from '../../../domain/runtime/types';

export interface AvgEnvironmentDevPreview {
  storyEntry: StoryEntry;
  sceneInput?: AvgScenePresentationInput;
  label?: string;
}

const WEATHER_ALIASES: Readonly<Record<string, WeatherCondition>> = {
  clear: 'clear',
  cloudy: 'cloudy',
  rain: 'light_rain',
  heavy_rain: 'heavy_rain',
  storm: 'thunderstorm',
  fog: 'foggy'
};

const STABLE_IDENTITY_KINDS = new Set<StableIdentityKind>([
  'era_seed',
  'screen_character',
  'city_power',
  'custom_character'
]);

function previewHour(value: string | null): number | undefined {
  if (value === null || !/^\d{1,2}$/u.test(value)) return undefined;
  const hour = Number(value);
  return hour >= 0 && hour <= 23 ? hour : undefined;
}

function previewIntensity(value: string | null): number | undefined {
  if (value === null || !/^\d{1,3}$/u.test(value)) return undefined;
  const intensity = Number(value);
  return intensity >= 0 && intensity <= 100 ? intensity : undefined;
}

function previewSceneAssetId(value: string | null): string | undefined {
  if (!value || !/^[a-z0-9][a-z0-9_]{0,119}$/u.test(value)) return undefined;
  return value;
}

export function applyAvgEnvironmentDevPreview(
  storyEntry: StoryEntry,
  search: string,
  enabled: boolean
): AvgEnvironmentDevPreview {
  if (!enabled) return { storyEntry };
  const params = new URLSearchParams(search);
  if (params.get('avgEnvQa') !== '1') return { storyEntry };

  const hour = previewHour(params.get('avgHour'));
  const weatherCondition = WEATHER_ALIASES[params.get('avgWeather') ?? ''];
  const weatherIntensity = previewIntensity(params.get('avgWeatherIntensity'));
  const sceneAssetId = previewSceneAssetId(params.get('avgScene'));
  const label = params.get('avgQaLabel')?.trim().slice(0, 80) || undefined;
  const visualContext = storyEntry.visualContext;
  const structuredEnvironment = storyEntry.visualContext?.structuredEnvironment;
  const previewVisualContext = weatherCondition
    ? {
        timeDescription: visualContext?.timeDescription ?? '',
        locationDescription: visualContext?.locationDescription ?? '',
        presentActorIds: visualContext?.presentActorIds ?? [],
        weatherDescription: weatherCondition,
        structuredEnvironment: {
          ...structuredEnvironment,
          weatherCondition,
          weatherIntensity: weatherIntensity ?? structuredEnvironment?.weatherIntensity ?? 50,
          placeId: structuredEnvironment?.placeId ?? `place_avg_qa_${sceneAssetId ?? 'environment'}`,
          ...(structuredEnvironment?.sceneId
            ? { sceneId: structuredEnvironment.sceneId }
            : sceneAssetId
              ? { sceneId: `scene_${sceneAssetId}` }
              : {})
        }
      }
    : visualContext;

  return {
    storyEntry: {
      ...storyEntry,
      gameTime: hour === undefined
        ? storyEntry.gameTime
        : { ...storyEntry.gameTime, hour },
      ...(previewVisualContext ? { visualContext: previewVisualContext } : {})
    },
    ...(sceneAssetId
      ? {
          sceneInput: {
            runtimeSceneId: `scene_${sceneAssetId}`,
            runtimePlaceId: `place_avg_qa_${sceneAssetId}`,
            tags: sceneAssetId.split('_')
          }
        }
      : {}),
    label
  };
}

export function readAvgEnvironmentDevPreview(storyEntry: StoryEntry): AvgEnvironmentDevPreview {
  if (typeof window === 'undefined') return { storyEntry };
  return applyAvgEnvironmentDevPreview(storyEntry, window.location.search, import.meta.env.DEV);
}

export function readAvgEnvironmentDevPreviewLabel(): string | undefined {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  if (params.get('avgEnvQa') !== '1') return undefined;
  return params.get('avgQaLabel')?.trim().slice(0, 80) || '环境视觉验收';
}

export function applyAvgFixedIdentityDevPreview(
  runtimeState: RuntimeState,
  search: string,
  enabled: boolean
): RuntimeState {
  if (!enabled) return runtimeState;
  const params = new URLSearchParams(search);
  if (params.get('avgEnvQa') !== '1') return runtimeState;
  const actorId = params.get('avgFixedActorId');
  const kind = params.get('avgFixedIdentityKind') as StableIdentityKind | null;
  const canonicalId = params.get('avgFixedCanonicalId');
  if (
    !actorId ||
    !/^[a-zA-Z0-9._:-]{1,180}$/u.test(actorId) ||
    !kind ||
    !STABLE_IDENTITY_KINDS.has(kind) ||
    !canonicalId ||
    !/^[a-zA-Z0-9._:-]{1,180}$/u.test(canonicalId)
  ) {
    return runtimeState;
  }
  const actor = runtimeState.actors[actorId];
  if (!actor) return runtimeState;
  return {
    ...runtimeState,
    actors: {
      ...runtimeState.actors,
      [actorId]: {
        ...actor,
        stableIdentityRef: {
          worldpackId: normalizeAvgWorldpackId(runtimeState.world.worldpackId),
          kind,
          canonicalId
        }
      }
    }
  };
}

export function readAvgFixedIdentityDevPreview(runtimeState: RuntimeState): RuntimeState {
  if (typeof window === 'undefined') return runtimeState;
  return applyAvgFixedIdentityDevPreview(
    runtimeState,
    window.location.search,
    import.meta.env.DEV
  );
}
