import type {
  GameTime,
  RuntimeEnvironmentState,
  RuntimeState,
  WeatherCondition,
  WeatherState
} from '../runtime/types';

export interface WeatherPatchInput {
  condition?: WeatherCondition;
  label?: string;
  intensity?: number;
  impactSummary?: string;
  validForMinutes?: number;
  validUntil?: GameTime;
  tags?: string[];
  reason?: string;
}

export type WeatherProjection = WeatherState;

const WEATHER_META: Record<
  WeatherCondition,
  {
    label: string;
    intensity: number;
    impactSummary: string;
    tags: string[];
  }
> = {
  clear: {
    label: '晴朗',
    intensity: 20,
    impactSummary: '天色清朗，视野稳定，街面流动正常。',
    tags: ['clear_visibility']
  },
  cloudy: {
    label: '多云',
    intensity: 35,
    impactSummary: '云层压低，光线偏暗，街面节奏仍然正常。',
    tags: ['dim_light']
  },
  light_rain: {
    label: '细雨',
    intensity: 45,
    impactSummary: '路面略湿，霓虹反光，步行与巡逻观察受到轻微影响。',
    tags: ['wet_road', 'neon_reflection']
  },
  heavy_rain: {
    label: '大雨',
    intensity: 75,
    impactSummary: '雨声压过街面杂音，路面湿滑，视线和交通都受影响。',
    tags: ['wet_road', 'low_visibility', 'traffic_slow']
  },
  thunderstorm: {
    label: '雷雨',
    intensity: 85,
    impactSummary: '雷声和骤雨让街面人流收缩，突发冲突更容易被遮蔽。',
    tags: ['low_visibility', 'crowd_thinning', 'noise_cover']
  },
  typhoon_signal: {
    label: '台风讯号',
    intensity: 90,
    impactSummary: '风雨增强，街面人流减少，交通、值勤和临场反应都受明显影响。',
    tags: ['storm_warning', 'traffic_disrupted', 'low_visibility']
  },
  foggy: {
    label: '薄雾',
    intensity: 50,
    impactSummary: '雾气压低能见度，远处招牌与人影不易分辨。',
    tags: ['low_visibility']
  },
  humid_hot: {
    label: '闷热潮湿',
    intensity: 60,
    impactSummary: '空气闷热潮湿，汗意和烦躁感会增加体力消耗。',
    tags: ['humid', 'stamina_pressure']
  },
  cool_dry: {
    label: '清凉干燥',
    intensity: 30,
    impactSummary: '空气清凉干燥，夜间街面声响显得更清楚。',
    tags: ['clear_sound']
  }
};

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function addMinutesToGameTime(time: GameTime, minutes: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute + minutes));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function gameTimeValue(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function isExpired(weather: WeatherState, time: GameTime): boolean {
  return gameTimeValue(time) >= gameTimeValue(weather.validUntil);
}

function clampIntensity(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 8);
}

export function deriveWeatherForTime(time: GameTime): WeatherState {
  const month = time.month;
  let pool: WeatherCondition[];

  if (month >= 5 && month <= 9) {
    pool = ['humid_hot', 'cloudy', 'light_rain', 'heavy_rain', 'thunderstorm'];
  } else if (month >= 10 && month <= 11) {
    pool = ['clear', 'cloudy', 'light_rain', 'humid_hot'];
  } else if (month === 12 || month <= 2) {
    pool = ['cool_dry', 'cloudy', 'foggy'];
  } else {
    pool = ['foggy', 'cloudy', 'light_rain', 'humid_hot'];
  }

  if (month >= 7 && month <= 9 && time.day % 17 === 0) {
    pool = ['typhoon_signal', ...pool];
  }

  const condition = pool[(time.day + time.hour + time.month) % pool.length];
  const meta = WEATHER_META[condition];
  return {
    condition,
    label: meta.label,
    intensity: meta.intensity,
    impactSummary: meta.impactSummary,
    startedAt: cloneGameTime(time),
    validUntil: addMinutesToGameTime(time, 180),
    source: 'seasonal',
    tags: [...meta.tags]
  };
}

export function createInitialEnvironment(time: GameTime): RuntimeEnvironmentState {
  return {
    weather: deriveWeatherForTime(time)
  };
}

function normalizeWeather(time: GameTime, weather?: Partial<WeatherState>): WeatherState {
  const fallback = deriveWeatherForTime(time);
  const condition = weather?.condition && WEATHER_META[weather.condition] ? weather.condition : fallback.condition;
  const meta = WEATHER_META[condition];

  return {
    condition,
    label: weather?.label?.trim() || meta.label,
    intensity: clampIntensity(weather?.intensity, meta.intensity),
    impactSummary: weather?.impactSummary?.trim() || meta.impactSummary,
    startedAt: weather?.startedAt ? cloneGameTime(weather.startedAt) : cloneGameTime(time),
    validUntil: weather?.validUntil ? cloneGameTime(weather.validUntil) : addMinutesToGameTime(time, 180),
    source: weather?.source === 'llm' ? 'llm' : 'seasonal',
    tags: uniqueTags(weather?.tags?.length ? weather.tags : meta.tags),
    ...(weather?.reason?.trim() ? { reason: weather.reason.trim() } : {})
  };
}

export function refreshWeatherIfExpired(
  environment: RuntimeEnvironmentState | undefined,
  time: GameTime
): RuntimeEnvironmentState {
  const current = normalizeWeather(time, environment?.weather);
  if (isExpired(current, time)) return createInitialEnvironment(time);
  return { weather: current };
}

export function ensureEnvironmentState(
  time: GameTime,
  environment?: Partial<RuntimeEnvironmentState>
): RuntimeEnvironmentState {
  return refreshWeatherIfExpired(environment as RuntimeEnvironmentState | undefined, time);
}

export function applyWeatherPatchToEnvironment(
  environment: RuntimeEnvironmentState | undefined,
  patch: WeatherPatchInput,
  time: GameTime
): RuntimeEnvironmentState {
  const current = refreshWeatherIfExpired(environment, time).weather;
  const condition = patch.condition && WEATHER_META[patch.condition] ? patch.condition : current.condition;
  const meta = WEATHER_META[condition];
  const validUntil = patch.validUntil
    ? cloneGameTime(patch.validUntil)
    : addMinutesToGameTime(time, patch.validForMinutes ?? 180);

  return {
    weather: {
      condition,
      label: patch.label?.trim() || meta.label,
      intensity: clampIntensity(patch.intensity, current.intensity),
      impactSummary: patch.impactSummary?.trim() || current.impactSummary || meta.impactSummary,
      startedAt: cloneGameTime(time),
      validUntil,
      source: 'llm',
      tags: uniqueTags([...(patch.tags ?? []), ...meta.tags]),
      ...(patch.reason?.trim() ? { reason: patch.reason.trim() } : {})
    }
  };
}

export function projectWeatherContext(state: RuntimeState): WeatherProjection {
  return refreshWeatherIfExpired(state.environment, state.time).weather;
}
