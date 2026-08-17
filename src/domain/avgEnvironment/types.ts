import type { WeatherCondition } from '../runtime/types';

export type AvgTimePhase =
  | 'dawn'
  | 'day'
  | 'dusk'
  | 'night'
  | 'late_night'
  | 'unknown';

export type AvgWeatherKind =
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'heavy_rain'
  | 'fog'
  | 'storm'
  | 'unknown';

export type AvgSceneExposure =
  | 'outdoor'
  | 'indoor'
  | 'semi_outdoor'
  | 'vehicle'
  | 'unknown';

export type AvgSceneLightingProfile =
  | 'natural'
  | 'mixed'
  | 'artificial'
  | 'nightlife'
  | 'unknown';

export interface AvgColorOverlay {
  color: string;
  opacity: number;
}

export interface AvgVisualGrade {
  brightness: number;
  contrast: number;
  saturation: number;
  colorOverlay?: AvgColorOverlay;
}

export type AvgEnvironmentOverlayKind = 'rain' | 'fog';

export interface AvgEnvironmentOverlay {
  kind: AvgEnvironmentOverlayKind;
  opacity: number;
  density: number;
}

export interface AvgSceneEnvironmentProfile {
  exposure: AvgSceneExposure;
  lightingProfile: AvgSceneLightingProfile;
}

export interface AvgEnvironmentWorldpackAdapter {
  resolveSceneProfile(sceneAssetId: string | undefined): AvgSceneEnvironmentProfile | undefined;
}

export interface AvgEnvironmentSource {
  gameTime?: string;
  rawWeather?: WeatherCondition | string;
  sceneAssetId?: string;
  timeSource: 'story_entry' | 'missing';
  weatherSource: 'structured_snapshot' | 'visual_context' | 'missing';
  exposureSource: 'runtime_structure' | 'registry_tags' | 'worldpack_metadata' | 'missing';
}

export interface AvgEnvironmentVisualState {
  key: string;
  timePhase: AvgTimePhase;
  weatherKind: AvgWeatherKind;
  weatherIntensity: number;
  sceneExposure: AvgSceneExposure;
  lightingProfile: AvgSceneLightingProfile;
  backgroundGrade: AvgVisualGrade;
  portraitGrade: AvgVisualGrade;
  overlays: AvgEnvironmentOverlay[];
  source: AvgEnvironmentSource;
}

export interface AvgEnvironmentDiagnostics {
  rawTime?: string;
  resolvedTimePhase: AvgTimePhase;
  rawWeather?: WeatherCondition | string;
  resolvedWeatherKind: AvgWeatherKind;
  weatherIntensity: number;
  sceneAssetId?: string;
  sceneExposure: AvgSceneExposure;
  lightingProfile: AvgSceneLightingProfile;
  exposureSource: AvgEnvironmentSource['exposureSource'];
  backgroundGrade: AvgVisualGrade;
  portraitGrade: AvgVisualGrade;
  activeOverlays: AvgEnvironmentOverlayKind[];
}
