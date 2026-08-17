import type { GameTime, StoryEntry, WeatherCondition } from '../runtime/types';
import {
  clampAvgWeatherIntensity,
  defaultAvgWeatherIntensity,
  normalizeAvgTimePhase,
  normalizeAvgWeatherDescription,
  normalizeAvgWeatherKind
} from './normalizers';
import { resolveAvgSceneExposure } from './sceneExposure';
import type {
  AvgColorOverlay,
  AvgEnvironmentDiagnostics,
  AvgEnvironmentOverlay,
  AvgEnvironmentVisualState,
  AvgEnvironmentWorldpackAdapter,
  AvgSceneExposure,
  AvgSceneLightingProfile,
  AvgTimePhase,
  AvgVisualGrade,
  AvgWeatherKind
} from './types';

interface GradeDelta {
  brightness: number;
  contrast: number;
  saturation: number;
}

interface TimeGradeDefinition {
  background: GradeDelta;
  portrait: GradeDelta;
  tone?: AvgColorOverlay;
}

interface WeatherGradeDefinition {
  background: GradeDelta;
  portrait: GradeDelta;
  tone?: AvgColorOverlay;
}

const NEUTRAL_DELTA: GradeDelta = { brightness: 0, contrast: 0, saturation: 0 };

const TIME_GRADES: Readonly<Record<AvgTimePhase, TimeGradeDefinition>> = {
  dawn: {
    background: { brightness: -0.04, contrast: 0.01, saturation: -0.01 },
    portrait: { brightness: -0.01, contrast: 0, saturation: 0 },
    tone: { color: '#c77f4d', opacity: 0.07 }
  },
  day: { background: NEUTRAL_DELTA, portrait: NEUTRAL_DELTA },
  dusk: {
    background: { brightness: -0.1, contrast: 0.02, saturation: -0.06 },
    portrait: { brightness: -0.03, contrast: 0.01, saturation: -0.02 },
    tone: { color: '#b36b48', opacity: 0.11 }
  },
  night: {
    background: { brightness: -0.24, contrast: 0.04, saturation: -0.16 },
    portrait: { brightness: -0.1, contrast: 0.02, saturation: -0.07 },
    tone: { color: '#183247', opacity: 0.17 }
  },
  late_night: {
    background: { brightness: -0.3, contrast: 0.05, saturation: -0.22 },
    portrait: { brightness: -0.14, contrast: 0.03, saturation: -0.1 },
    tone: { color: '#12283c', opacity: 0.21 }
  },
  unknown: { background: NEUTRAL_DELTA, portrait: NEUTRAL_DELTA }
};

const WEATHER_GRADES: Readonly<Record<AvgWeatherKind, WeatherGradeDefinition>> = {
  clear: { background: NEUTRAL_DELTA, portrait: NEUTRAL_DELTA },
  cloudy: {
    background: { brightness: -0.05, contrast: -0.02, saturation: -0.05 },
    portrait: { brightness: -0.01, contrast: 0, saturation: -0.01 },
    tone: { color: '#5f7380', opacity: 0.05 }
  },
  rain: {
    background: { brightness: -0.08, contrast: -0.01, saturation: -0.08 },
    portrait: { brightness: -0.02, contrast: 0, saturation: -0.02 },
    tone: { color: '#405d70', opacity: 0.08 }
  },
  heavy_rain: {
    background: { brightness: -0.13, contrast: -0.03, saturation: -0.12 },
    portrait: { brightness: -0.04, contrast: -0.01, saturation: -0.04 },
    tone: { color: '#344f63', opacity: 0.12 }
  },
  fog: {
    background: { brightness: -0.03, contrast: -0.12, saturation: -0.13 },
    portrait: { brightness: -0.02, contrast: -0.03, saturation: -0.03 },
    tone: { color: '#b8c8ce', opacity: 0.1 }
  },
  storm: {
    background: { brightness: -0.17, contrast: -0.04, saturation: -0.16 },
    portrait: { brightness: -0.05, contrast: -0.01, saturation: -0.05 },
    tone: { color: '#2d485d', opacity: 0.15 }
  },
  unknown: { background: NEUTRAL_DELTA, portrait: NEUTRAL_DELTA }
};

const TIME_EXPOSURE_STRENGTH: Readonly<Record<AvgSceneExposure, number>> = {
  outdoor: 1,
  semi_outdoor: 0.78,
  vehicle: 0.58,
  indoor: 0.48,
  unknown: 0.35
};

const WEATHER_EXPOSURE_STRENGTH: Readonly<Record<AvgSceneExposure, number>> = {
  outdoor: 1,
  semi_outdoor: 0.72,
  vehicle: 0.42,
  indoor: 0.5,
  unknown: 0.25
};

const LIGHTING_TIME_STRENGTH: Readonly<Record<AvgSceneLightingProfile, number>> = {
  natural: 1,
  mixed: 0.82,
  artificial: 0.55,
  nightlife: 0.35,
  unknown: 1
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function scaleDelta(delta: GradeDelta, strength: number): GradeDelta {
  return {
    brightness: delta.brightness * strength,
    contrast: delta.contrast * strength,
    saturation: delta.saturation * strength
  };
}

function combineGrade(
  time: GradeDelta,
  weather: GradeDelta,
  kind: 'background' | 'portrait',
  colorOverlay?: AvgColorOverlay
): AvgVisualGrade {
  const limits = kind === 'background'
    ? {
        brightness: [0.64, 1.06],
        contrast: [0.84, 1.1],
        saturation: [0.7, 1.06]
      }
    : {
        brightness: [0.82, 1.04],
        contrast: [0.9, 1.08],
        saturation: [0.84, 1.04]
      };
  return {
    brightness: rounded(clamp(
      1 + time.brightness + weather.brightness,
      limits.brightness[0],
      limits.brightness[1]
    )),
    contrast: rounded(clamp(
      1 + time.contrast + weather.contrast,
      limits.contrast[0],
      limits.contrast[1]
    )),
    saturation: rounded(clamp(
      1 + time.saturation + weather.saturation,
      limits.saturation[0],
      limits.saturation[1]
    )),
    ...(colorOverlay && colorOverlay.opacity > 0
      ? {
          colorOverlay: {
            color: colorOverlay.color,
            opacity: rounded(clamp(colorOverlay.opacity, 0, 0.26))
          }
        }
      : {})
  };
}

function combinedTone(
  timeTone: AvgColorOverlay | undefined,
  weatherTone: AvgColorOverlay | undefined,
  timeStrength: number,
  weatherStrength: number
): AvgColorOverlay | undefined {
  const timeOpacity = (timeTone?.opacity ?? 0) * timeStrength;
  const weatherOpacity = (weatherTone?.opacity ?? 0) * weatherStrength;
  if (timeOpacity <= 0 && weatherOpacity <= 0) return undefined;
  if (weatherOpacity > 0) {
    return {
      color: weatherTone!.color,
      opacity: weatherOpacity + timeOpacity * 0.65
    };
  }
  return { color: timeTone!.color, opacity: timeOpacity };
}

function environmentOverlays(
  weatherKind: AvgWeatherKind,
  intensity: number,
  exposure: AvgSceneExposure
): AvgEnvironmentOverlay[] {
  const precipitationStrength = exposure === 'outdoor'
    ? 1
    : exposure === 'semi_outdoor'
      ? 0.55
      : 0;
  if (
    precipitationStrength > 0 &&
    (weatherKind === 'rain' || weatherKind === 'heavy_rain' || weatherKind === 'storm')
  ) {
    const baseOpacity = weatherKind === 'rain' ? 0.3 : weatherKind === 'heavy_rain' ? 0.46 : 0.52;
    const baseDensity = weatherKind === 'rain' ? 0.56 : weatherKind === 'heavy_rain' ? 0.84 : 1;
    const intensityFactor = 0.72 + (intensity / 100) * 0.28;
    return [{
      kind: 'rain',
      opacity: rounded(baseOpacity * precipitationStrength * intensityFactor),
      density: rounded(baseDensity * precipitationStrength)
    }];
  }
  if (precipitationStrength > 0 && weatherKind === 'fog') {
    return [{
      kind: 'fog',
      opacity: rounded(0.2 * precipitationStrength * (0.75 + intensity / 400)),
      density: rounded(0.62 * precipitationStrength)
    }];
  }
  return [];
}

function formatTimeSource(time: Pick<GameTime, 'year' | 'month' | 'day' | 'hour' | 'minute'>): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function neutralEnvironmentState(sceneAssetId?: string): AvgEnvironmentVisualState {
  const backgroundGrade = combineGrade(NEUTRAL_DELTA, NEUTRAL_DELTA, 'background');
  const portraitGrade = combineGrade(NEUTRAL_DELTA, NEUTRAL_DELTA, 'portrait');
  return {
    key: [sceneAssetId ?? 'none', 'unknown', 'unknown', '0', 'unknown', 'unknown'].join('|'),
    timePhase: 'unknown',
    weatherKind: 'unknown',
    weatherIntensity: 0,
    sceneExposure: 'unknown',
    lightingProfile: 'unknown',
    backgroundGrade,
    portraitGrade,
    overlays: [],
    source: {
      ...(sceneAssetId ? { sceneAssetId } : {}),
      timeSource: 'missing',
      weatherSource: 'missing',
      exposureSource: 'missing'
    }
  };
}

export function resolveAvgEnvironmentVisualState(input: {
  storyEntry?: StoryEntry;
  sceneAssetId?: string;
  registryTags?: readonly string[];
  runtimeSceneExposure?: unknown;
  runtimePlaceExposure?: unknown;
  worldpackAdapter?: AvgEnvironmentWorldpackAdapter;
}): { state: AvgEnvironmentVisualState; diagnostic: AvgEnvironmentDiagnostics } {
  try {
    const storyEntry = input.storyEntry;
    const structured = storyEntry?.visualContext?.structuredEnvironment;
    const timePhase = normalizeAvgTimePhase(storyEntry?.gameTime);
    const rawWeather: WeatherCondition | string | undefined = structured?.weatherCondition ??
      storyEntry?.visualContext?.weatherDescription;
    const weatherKind = structured?.weatherCondition
      ? normalizeAvgWeatherKind(structured.weatherCondition)
      : normalizeAvgWeatherDescription(storyEntry?.visualContext?.weatherDescription);
    const weatherIntensity = clampAvgWeatherIntensity(
      structured?.weatherIntensity,
      defaultAvgWeatherIntensity(weatherKind)
    );
    const worldpackProfile = input.worldpackAdapter?.resolveSceneProfile(input.sceneAssetId);
    const exposureResult = resolveAvgSceneExposure({
      runtimeSceneExposure: input.runtimeSceneExposure,
      runtimePlaceExposure: input.runtimePlaceExposure,
      registryTags: input.registryTags,
      worldpackProfile
    });
    const sceneExposure = exposureResult.exposure;
    const lightingProfile = worldpackProfile?.lightingProfile ??
      (sceneExposure === 'outdoor' ? 'natural' : 'unknown');
    const timeStrength = TIME_EXPOSURE_STRENGTH[sceneExposure] *
      LIGHTING_TIME_STRENGTH[lightingProfile];
    const weatherStrength = WEATHER_EXPOSURE_STRENGTH[sceneExposure];
    const timeGrade = TIME_GRADES[timePhase];
    const weatherGrade = WEATHER_GRADES[weatherKind];
    const backgroundGrade = combineGrade(
      scaleDelta(timeGrade.background, timeStrength),
      scaleDelta(weatherGrade.background, weatherStrength),
      'background',
      combinedTone(timeGrade.tone, weatherGrade.tone, timeStrength, weatherStrength)
    );
    const portraitGrade = combineGrade(
      scaleDelta(timeGrade.portrait, timeStrength),
      scaleDelta(weatherGrade.portrait, weatherStrength),
      'portrait'
    );
    const overlays = environmentOverlays(weatherKind, weatherIntensity, sceneExposure);
    const source = {
      ...(storyEntry?.gameTime ? { gameTime: formatTimeSource(storyEntry.gameTime) } : {}),
      ...(rawWeather ? { rawWeather } : {}),
      ...(input.sceneAssetId ? { sceneAssetId: input.sceneAssetId } : {}),
      timeSource: storyEntry?.gameTime ? 'story_entry' as const : 'missing' as const,
      weatherSource: structured?.weatherCondition
        ? 'structured_snapshot' as const
        : storyEntry?.visualContext?.weatherDescription
          ? 'visual_context' as const
          : 'missing' as const,
      exposureSource: exposureResult.source
    };
    const state: AvgEnvironmentVisualState = {
      key: [
        input.sceneAssetId ?? 'none',
        timePhase,
        weatherKind,
        String(Math.round(weatherIntensity)),
        sceneExposure,
        lightingProfile
      ].join('|'),
      timePhase,
      weatherKind,
      weatherIntensity,
      sceneExposure,
      lightingProfile,
      backgroundGrade,
      portraitGrade,
      overlays,
      source
    };
    return {
      state,
      diagnostic: {
        rawTime: source.gameTime,
        resolvedTimePhase: timePhase,
        ...(rawWeather ? { rawWeather } : {}),
        resolvedWeatherKind: weatherKind,
        weatherIntensity,
        ...(input.sceneAssetId ? { sceneAssetId: input.sceneAssetId } : {}),
        sceneExposure,
        lightingProfile,
        exposureSource: exposureResult.source,
        backgroundGrade,
        portraitGrade,
        activeOverlays: overlays.map((overlay) => overlay.kind)
      }
    };
  } catch {
    const state = neutralEnvironmentState(input.sceneAssetId);
    return {
      state,
      diagnostic: {
        resolvedTimePhase: 'unknown',
        resolvedWeatherKind: 'unknown',
        weatherIntensity: 0,
        ...(input.sceneAssetId ? { sceneAssetId: input.sceneAssetId } : {}),
        sceneExposure: 'unknown',
        lightingProfile: 'unknown',
        exposureSource: 'missing',
        backgroundGrade: state.backgroundGrade,
        portraitGrade: state.portraitGrade,
        activeOverlays: []
      }
    };
  }
}

export function createNeutralAvgEnvironmentVisualState(
  sceneAssetId?: string
): AvgEnvironmentVisualState {
  return neutralEnvironmentState(sceneAssetId);
}
