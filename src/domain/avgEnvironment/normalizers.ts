import type { GameTime, WeatherCondition } from '../runtime/types';
import type { AvgTimePhase, AvgWeatherKind } from './types';

export const AVG_TIME_PHASE_BOUNDARIES = Object.freeze({
  dawnStartsAtMinute: 5 * 60,
  dayStartsAtMinute: 7 * 60,
  duskStartsAtMinute: 17 * 60,
  nightStartsAtMinute: 19 * 60
});

const WEATHER_KIND_BY_CONDITION: Readonly<Record<WeatherCondition, AvgWeatherKind>> = {
  clear: 'clear',
  cloudy: 'cloudy',
  light_rain: 'rain',
  heavy_rain: 'heavy_rain',
  thunderstorm: 'storm',
  typhoon_signal: 'storm',
  foggy: 'fog',
  humid_hot: 'clear',
  cool_dry: 'clear'
};

const WEATHER_ALIASES: Readonly<Record<string, AvgWeatherKind>> = {
  clear: 'clear',
  sunny: 'clear',
  humid_hot: 'clear',
  cool_dry: 'clear',
  cloudy: 'cloudy',
  overcast: 'cloudy',
  light_rain: 'rain',
  rain: 'rain',
  drizzle: 'rain',
  heavy_rain: 'heavy_rain',
  downpour: 'heavy_rain',
  fog: 'fog',
  foggy: 'fog',
  mist: 'fog',
  storm: 'storm',
  thunderstorm: 'storm',
  typhoon_signal: 'storm'
};

const WEATHER_DESCRIPTION_ALIASES: readonly [string, AvgWeatherKind][] = [
  ['台风', 'storm'],
  ['颱風', 'storm'],
  ['雷雨', 'storm'],
  ['thunderstorm', 'storm'],
  ['typhoon', 'storm'],
  ['暴雨', 'heavy_rain'],
  ['大雨', 'heavy_rain'],
  ['heavy rain', 'heavy_rain'],
  ['downpour', 'heavy_rain'],
  ['细雨', 'rain'],
  ['細雨', 'rain'],
  ['小雨', 'rain'],
  ['light rain', 'rain'],
  ['drizzle', 'rain'],
  ['薄雾', 'fog'],
  ['薄霧', 'fog'],
  ['大雾', 'fog'],
  ['大霧', 'fog'],
  ['fog', 'fog'],
  ['mist', 'fog'],
  ['多云', 'cloudy'],
  ['多雲', 'cloudy'],
  ['阴天', 'cloudy'],
  ['陰天', 'cloudy'],
  ['cloudy', 'cloudy'],
  ['overcast', 'cloudy'],
  ['晴朗', 'clear'],
  ['晴天', 'clear'],
  ['闷热潮湿', 'clear'],
  ['悶熱潮濕', 'clear'],
  ['清凉干燥', 'clear'],
  ['清涼乾燥', 'clear'],
  ['clear', 'clear'],
  ['sunny', 'clear']
];

export function normalizeAvgTimePhase(time: Pick<GameTime, 'hour' | 'minute'> | undefined): AvgTimePhase {
  if (
    !time ||
    !Number.isInteger(time.hour) ||
    !Number.isInteger(time.minute) ||
    time.hour < 0 ||
    time.hour > 23 ||
    time.minute < 0 ||
    time.minute > 59
  ) {
    return 'unknown';
  }
  const minuteOfDay = time.hour * 60 + time.minute;
  if (minuteOfDay < AVG_TIME_PHASE_BOUNDARIES.dawnStartsAtMinute) return 'late_night';
  if (minuteOfDay < AVG_TIME_PHASE_BOUNDARIES.dayStartsAtMinute) return 'dawn';
  if (minuteOfDay < AVG_TIME_PHASE_BOUNDARIES.duskStartsAtMinute) return 'day';
  if (minuteOfDay < AVG_TIME_PHASE_BOUNDARIES.nightStartsAtMinute) return 'dusk';
  return 'night';
}

export function normalizeAvgWeatherKind(value: WeatherCondition | string | undefined): AvgWeatherKind {
  if (!value) return 'unknown';
  if (value in WEATHER_KIND_BY_CONDITION) {
    return WEATHER_KIND_BY_CONDITION[value as WeatherCondition];
  }
  return WEATHER_ALIASES[value.trim().toLocaleLowerCase('en-US')] ?? 'unknown';
}

export function normalizeAvgWeatherDescription(value: string | undefined): AvgWeatherKind {
  if (!value) return 'unknown';
  const normalized = value.trim().toLocaleLowerCase('en-US');
  const direct = normalizeAvgWeatherKind(normalized);
  if (direct !== 'unknown') return direct;
  return WEATHER_DESCRIPTION_ALIASES.find(([alias]) => {
    if (/^[a-z ]+$/u.test(alias)) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/ /gu, '\\s+');
      return new RegExp(`\\b${escaped}\\b`, 'u').test(normalized);
    }
    return normalized.includes(alias);
  })?.[1] ?? 'unknown';
}

export function defaultAvgWeatherIntensity(kind: AvgWeatherKind): number {
  return {
    clear: 20,
    cloudy: 35,
    rain: 45,
    heavy_rain: 75,
    fog: 50,
    storm: 88,
    unknown: 0
  }[kind];
}

export function clampAvgWeatherIntensity(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}
