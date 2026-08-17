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
  tags?: string[];
  reason?: string;
}

export interface WeatherApplicationDiagnostic {
  code: 'weather_same_condition_not_extended';
  requestedCondition: WeatherCondition;
  currentCondition: WeatherCondition;
  message: string;
}

export interface WeatherApplicationResult {
  environment: RuntimeEnvironmentState;
  diagnostic?: WeatherApplicationDiagnostic;
}

export interface WeightedWeatherInput {
  time: GameTime;
  weights?: Partial<Record<WeatherCondition, number>>;
  previousCondition?: WeatherCondition;
  recentConditions?: WeatherCondition[];
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

const WET_CONDITIONS = new Set<WeatherCondition>([
  'light_rain',
  'heavy_rain',
  'thunderstorm',
  'typhoon_signal'
]);

const WEATHER_DURATION_RANGES: Record<
  WeatherCondition,
  readonly [minimum: number, maximum: number]
> = {
  clear: [360, 720],
  cloudy: [360, 720],
  humid_hot: [360, 720],
  cool_dry: [480, 1080],
  foggy: [120, 360],
  light_rain: [90, 240],
  heavy_rain: [45, 150],
  thunderstorm: [30, 120],
  typhoon_signal: [360, 1080]
};

const SEASONAL_WEATHER_WEIGHTS: ReadonlyArray<{
  months: readonly number[];
  weights: Partial<Record<WeatherCondition, number>>;
}> = [
  {
    months: [12, 1, 2],
    weights: { cool_dry: 45, clear: 30, cloudy: 20, foggy: 4, light_rain: 1 }
  },
  {
    months: [3, 4],
    weights: { humid_hot: 30, cloudy: 30, foggy: 20, light_rain: 15, clear: 5 }
  },
  {
    months: [5, 6],
    weights: {
      humid_hot: 35,
      cloudy: 30,
      light_rain: 23,
      heavy_rain: 8,
      thunderstorm: 4,
      clear: 5
    }
  },
  {
    months: [7, 8, 9],
    weights: {
      humid_hot: 30,
      cloudy: 26,
      light_rain: 25,
      heavy_rain: 10,
      thunderstorm: 4,
      clear: 5
    }
  },
  {
    months: [10, 11],
    weights: {
      clear: 35,
      cool_dry: 20,
      cloudy: 25,
      humid_hot: 8,
      light_rain: 10,
      heavy_rain: 2
    }
  }
];

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

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeRecentConditions(
  conditions: WeatherCondition[] | undefined,
  currentCondition: WeatherCondition
): WeatherCondition[] {
  const normalized = (conditions ?? []).filter(
    (condition): condition is WeatherCondition => Boolean(WEATHER_META[condition])
  );
  if (normalized.at(-1) !== currentCondition) normalized.push(currentCondition);
  return normalized.slice(-4);
}

function getSeasonalWeights(
  month: number
): Partial<Record<WeatherCondition, number>> {
  return {
    ...(SEASONAL_WEATHER_WEIGHTS.find(({ months }) => months.includes(month))
      ?.weights ?? SEASONAL_WEATHER_WEIGHTS[0].weights)
  };
}

function applyTransitionWeights(
  weights: Partial<Record<WeatherCondition, number>>,
  previousCondition: WeatherCondition | undefined,
  recentConditions: WeatherCondition[]
): Partial<Record<WeatherCondition, number>> {
  const adjusted = { ...weights };
  if (!previousCondition) return adjusted;

  const lastTwo = recentConditions.slice(-2);
  const lastTwoSame =
    lastTwo.length === 2 && lastTwo[0] === lastTwo[1];
  const lastTwoWet =
    lastTwo.length === 2 && lastTwo.every((condition) => WET_CONDITIONS.has(condition));

  for (const condition of Object.keys(adjusted) as WeatherCondition[]) {
    let weight = adjusted[condition] ?? 0;
    if (condition === previousCondition) weight *= 0.25;
    if (lastTwoSame && condition === previousCondition) weight = 0;
    if (WET_CONDITIONS.has(previousCondition) && WET_CONDITIONS.has(condition)) {
      weight *= 0.35;
    }
    if (lastTwoWet && WET_CONDITIONS.has(condition)) weight = 0;
    adjusted[condition] = weight;
  }

  const boost = (condition: WeatherCondition, multiplier: number) => {
    if ((adjusted[condition] ?? 0) > 0) {
      adjusted[condition] = (adjusted[condition] ?? 0) * multiplier;
    }
  };
  if (previousCondition === 'light_rain') {
    boost('cloudy', 1.8);
    boost('humid_hot', 1.35);
  } else if (
    previousCondition === 'heavy_rain' ||
    previousCondition === 'thunderstorm'
  ) {
    boost('cloudy', 2.5);
    boost('humid_hot', 1.6);
  } else if (previousCondition === 'foggy') {
    boost('cloudy', 1.5);
    boost('humid_hot', 1.25);
  } else if (previousCondition === 'humid_hot') {
    boost('cloudy', 1.35);
  } else if (previousCondition === 'clear') {
    boost('cloudy', 1.25);
  }

  return adjusted;
}

export function weightedPickWeather({
  time,
  weights = getSeasonalWeights(time.month),
  previousCondition,
  recentConditions = []
}: WeightedWeatherInput): WeatherCondition {
  const adjusted = applyTransitionWeights(
    weights,
    previousCondition,
    recentConditions
  );
  const entries = (Object.entries(adjusted) as Array<
    [WeatherCondition, number | undefined]
  >).filter(([, weight]) => typeof weight === 'number' && weight > 0);
  const candidates =
    entries.length > 0
      ? entries
      : (Object.entries(getSeasonalWeights(time.month)) as Array<
          [WeatherCondition, number | undefined]
        >).filter(([, weight]) => typeof weight === 'number' && weight > 0);
  const total = candidates.reduce((sum, [, weight]) => sum + (weight ?? 0), 0);
  const bucket = Math.floor(time.hour / 3);
  let cursor =
    (stableHash(
      `${time.year}-${time.month}-${time.day}-${bucket}-${time.minute}-${previousCondition ?? 'initial'}`
    ) /
      0x1_0000_0000) *
    total;
  for (const [condition, weight] of candidates) {
    cursor -= weight ?? 0;
    if (cursor < 0) return condition;
  }
  return candidates.at(-1)?.[0] ?? 'cloudy';
}

export function deriveWeatherDurationMinutes(
  condition: WeatherCondition,
  time: GameTime
): number {
  const [minimum, maximum] = WEATHER_DURATION_RANGES[condition];
  const spread = maximum - minimum + 1;
  return (
    minimum +
    (stableHash(
      `${condition}-${time.year}-${time.month}-${time.day}-${Math.floor(time.hour / 3)}-${time.minute}`
    ) %
      spread)
  );
}

function clampWeatherDuration(
  condition: WeatherCondition,
  requested: number | undefined,
  time: GameTime
): number {
  const [minimum, maximum] = WEATHER_DURATION_RANGES[condition];
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return deriveWeatherDurationMinutes(condition, time);
  }
  return Math.max(minimum, Math.min(maximum, Math.round(requested)));
}

export function deriveWeatherForTime(
  time: GameTime,
  context: {
    previousCondition?: WeatherCondition;
    recentConditions?: WeatherCondition[];
  } = {}
): WeatherState {
  const condition = weightedPickWeather({
    time,
    previousCondition: context.previousCondition,
    recentConditions: context.recentConditions
  });
  const meta = WEATHER_META[condition];
  return {
    condition,
    label: meta.label,
    intensity: meta.intensity,
    impactSummary: meta.impactSummary,
    startedAt: cloneGameTime(time),
    validUntil: addMinutesToGameTime(
      time,
      deriveWeatherDurationMinutes(condition, time)
    ),
    source: 'seasonal',
    tags: [...meta.tags]
  };
}

export function createInitialEnvironment(time: GameTime): RuntimeEnvironmentState {
  const weather = deriveWeatherForTime(time);
  return {
    weather,
    recentConditions: [weather.condition]
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
    validUntil: weather?.validUntil
      ? cloneGameTime(weather.validUntil)
      : addMinutesToGameTime(
          time,
          deriveWeatherDurationMinutes(condition, time)
        ),
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
  const recentConditions = normalizeRecentConditions(
    environment?.recentConditions,
    current.condition
  );
  if (isExpired(current, time)) {
    const weather = deriveWeatherForTime(time, {
      previousCondition: current.condition,
      recentConditions
    });
    return {
      weather,
      recentConditions: [...recentConditions, weather.condition].slice(-4)
    };
  }
  return { weather: current, recentConditions };
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
  return applyWeatherPatchToEnvironmentWithDiagnostics(environment, patch, time)
    .environment;
}

export function applyWeatherPatchToEnvironmentWithDiagnostics(
  environment: RuntimeEnvironmentState | undefined,
  patch: WeatherPatchInput,
  time: GameTime
): WeatherApplicationResult {
  const normalizedEnvironment = refreshWeatherIfExpired(environment, time);
  const current = normalizedEnvironment.weather;
  const condition =
    patch.condition && WEATHER_META[patch.condition]
      ? patch.condition
      : current.condition;
  const meta = WEATHER_META[condition];

  if (!patch.condition || condition === current.condition) {
    return {
      environment: {
        weather: {
          ...current,
          label: patch.label?.trim() || current.label,
          intensity: clampIntensity(patch.intensity, current.intensity),
          impactSummary:
            patch.impactSummary?.trim() || current.impactSummary,
          tags: uniqueTags([...(patch.tags ?? []), ...current.tags]),
          ...(patch.reason?.trim() ? { reason: patch.reason.trim() } : {})
        },
        recentConditions: normalizedEnvironment.recentConditions
      },
      ...(patch.condition
        ? {
            diagnostic: {
              code: 'weather_same_condition_not_extended' as const,
              requestedCondition: condition,
              currentCondition: current.condition,
              message: '模型重复返回当前天气，本地保留原天气截止时间。'
            }
          }
        : {})
    };
  }

  const weather: WeatherState = {
      condition,
      label: patch.label?.trim() || meta.label,
      intensity: clampIntensity(patch.intensity, meta.intensity),
      impactSummary: patch.impactSummary?.trim() || meta.impactSummary,
      startedAt: cloneGameTime(time),
      validUntil: addMinutesToGameTime(
        time,
        clampWeatherDuration(condition, patch.validForMinutes, time)
      ),
      source: 'llm',
      tags: uniqueTags([...(patch.tags ?? []), ...meta.tags]),
      ...(patch.reason?.trim() ? { reason: patch.reason.trim() } : {})
  };
  return {
    environment: {
      weather,
      recentConditions: [
        ...(normalizedEnvironment.recentConditions ?? [current.condition]),
        condition
      ].slice(-4)
    }
  };
}

export function projectWeatherContext(state: RuntimeState): WeatherProjection {
  return refreshWeatherIfExpired(state.environment, state.time).weather;
}
