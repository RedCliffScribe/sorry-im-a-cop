import { describe, expect, it } from 'vitest';
import { hk1980sOpeningScenarios } from '../worldpack/hk1980sOpening';
import type {
  GameTime,
  RuntimeEnvironmentState,
  WeatherCondition
} from '../runtime/types';
import {
  applyWeatherPatchToEnvironment,
  applyWeatherPatchToEnvironmentWithDiagnostics,
  createInitialEnvironment,
  deriveWeatherDurationMinutes,
  deriveWeatherForTime,
  refreshWeatherIfExpired
} from './weather';

const wetConditions = new Set<WeatherCondition>([
  'light_rain',
  'heavy_rain',
  'thunderstorm',
  'typhoon_signal'
]);

function timeValue(time: GameTime): number {
  return Date.UTC(
    time.year,
    time.month - 1,
    time.day,
    time.hour,
    time.minute
  );
}

function addMinutes(time: GameTime, minutes: number): GameTime {
  const date = new Date(timeValue(time) + minutes * 60_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function durationMinutes(environment: RuntimeEnvironmentState): number {
  return Math.round(
    (timeValue(environment.weather.validUntil) -
      timeValue(environment.weather.startedAt)) /
      60_000
  );
}

describe('weather runtime', () => {
  it('derives deterministic seasonal Hong Kong weather from game time', () => {
    const weather = deriveWeatherForTime({ year: 1988, month: 8, day: 12, hour: 21, minute: 15 });
    const same = deriveWeatherForTime({ year: 1988, month: 8, day: 12, hour: 21, minute: 15 });

    expect(['humid_hot', 'cloudy', 'light_rain', 'heavy_rain', 'thunderstorm', 'clear']).toContain(
      weather.condition
    );
    expect(same).toEqual(weather);
    expect(weather.condition).not.toBe('typhoon_signal');
    expect(weather.source).toBe('seasonal');
    expect(weather.startedAt.hour).toBe(21);
    expect(weather.validUntil).toBeDefined();
  });

  it('keeps condition-specific deterministic duration ranges', () => {
    const time = { year: 1988, month: 8, day: 12, hour: 21, minute: 15 };
    const ranges: Record<WeatherCondition, [number, number]> = {
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

    for (const [condition, [minimum, maximum]] of Object.entries(ranges) as Array<
      [WeatherCondition, [number, number]]
    >) {
      const duration = deriveWeatherDurationMinutes(condition, time);
      expect(duration).toBeGreaterThanOrEqual(minimum);
      expect(duration).toBeLessThanOrEqual(maximum);
      expect(deriveWeatherDurationMinutes(condition, time)).toBe(duration);
    }
  });

  it('refreshes expired weather from the current time', () => {
    const environment = createInitialEnvironment({ year: 1988, month: 12, day: 20, hour: 8, minute: 0 });
    environment.weather.validUntil = { year: 1988, month: 12, day: 20, hour: 9, minute: 0 };

    const refreshed = refreshWeatherIfExpired(environment, { year: 1988, month: 12, day: 20, hour: 12, minute: 0 });

    expect(refreshed.weather.source).toBe('seasonal');
    expect(refreshed.weather.startedAt.hour).toBe(12);
    expect(refreshed.recentConditions?.at(-1)).toBe(
      refreshed.weather.condition
    );
  });

  it('does not extend the same condition and records a non-blocking diagnostic', () => {
    const time = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
    const environment = createInitialEnvironment(time);
    environment.weather = {
      ...environment.weather,
      condition: 'light_rain',
      label: '细雨',
      startedAt: { ...time },
      validUntil: addMinutes(time, 120)
    };
    environment.recentConditions = ['cloudy', 'light_rain'];

    const result = applyWeatherPatchToEnvironmentWithDiagnostics(
      environment,
      {
        condition: 'light_rain',
        impactSummary: '细雨仍令路面湿滑。',
        validForMinutes: 1440,
        reason: '正文再次提到细雨。'
      },
      addMinutes(time, 30)
    );

    expect(result.environment.weather.startedAt).toEqual(
      environment.weather.startedAt
    );
    expect(result.environment.weather.validUntil).toEqual(
      environment.weather.validUntil
    );
    expect(result.environment.recentConditions).toEqual([
      'cloudy',
      'light_rain'
    ]);
    expect(result.diagnostic?.code).toBe(
      'weather_same_condition_not_extended'
    );
  });

  it('does not establish a new segment when condition is missing', () => {
    const time = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
    const environment = createInitialEnvironment(time);

    const next = applyWeatherPatchToEnvironment(
      environment,
      {
        impactSummary: '只补充当前天气影响。',
        validForMinutes: 1440
      },
      addMinutes(time, 30)
    );

    expect(next.weather.startedAt).toEqual(environment.weather.startedAt);
    expect(next.weather.validUntil).toEqual(environment.weather.validUntil);
  });

  it('applies a real LLM weather change with bounded intensity and condition duration', () => {
    const environment = createInitialEnvironment({ year: 1988, month: 9, day: 12, hour: 21, minute: 15 });
    const targetCondition =
      environment.weather.condition === 'heavy_rain'
        ? 'thunderstorm'
        : 'heavy_rain';
    const maximumDuration = targetCondition === 'heavy_rain' ? 150 : 120;

    const patched = applyWeatherPatchToEnvironment(
      environment,
      {
        condition: targetCondition,
        label: '大雨',
        intensity: 120,
        impactSummary: '路面湿滑，霓虹反光，巡逻视线受影响。',
        validForMinutes: 1440,
        tags: ['wet_road']
      },
      { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    );

    expect(patched.weather.condition).toBe(targetCondition);
    expect(patched.weather.source).toBe('llm');
    expect(patched.weather.intensity).toBe(100);
    expect(durationMinutes(patched)).toBe(maximumDuration);
    expect(patched.weather.tags).toContain('wet_road');
    expect(patched.recentConditions?.at(-1)).toBe(targetCondition);
  });

  it('keeps the six bundled openings varied and does not pin 1988 to rain', () => {
    const conditions = hk1980sOpeningScenarios.map(
      (scenario) => createInitialEnvironment(scenario.time).weather.condition
    );
    const defaultCondition = createInitialEnvironment(
      hk1980sOpeningScenarios[2].time
    ).weather.condition;

    expect(wetConditions.has(defaultCondition)).toBe(false);
    expect(conditions.filter((condition) => wetConditions.has(condition)).length)
      .toBeLessThanOrEqual(2);
  });

  it('never allows more than two repeated or ordinary wet segments', () => {
    let environment = createInitialEnvironment({
      year: 1988,
      month: 7,
      day: 1,
      hour: 0,
      minute: 0
    });
    let repeated = 1;
    let wet = wetConditions.has(environment.weather.condition) ? 1 : 0;

    for (let index = 0; index < 500; index += 1) {
      environment = refreshWeatherIfExpired(
        environment,
        environment.weather.validUntil
      );
      const recent = environment.recentConditions ?? [];
      repeated =
        recent.length > 1 &&
        recent.at(-1) === recent.at(-2)
          ? repeated + 1
          : 1;
      wet = wetConditions.has(environment.weather.condition) ? wet + 1 : 0;
      expect(repeated).toBeLessThanOrEqual(2);
      expect(wet).toBeLessThanOrEqual(2);
      expect(environment.recentConditions?.length).toBeLessThanOrEqual(4);
    }
  });

  it('keeps seasonal wet-segment ratios and wet duration below the intended bounds', () => {
    const stats = new Map<
      string,
      { segments: number; wetSegments: number; minutes: number; wetMinutes: number }
    >();
    const season = (month: number) =>
      month <= 2 || month === 12
        ? 'winter'
        : month <= 4
          ? 'spring'
          : month <= 6
            ? 'early_wet'
            : month <= 9
              ? 'peak_wet'
              : 'autumn';
    let environment = createInitialEnvironment({
      year: 1988,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0
    });
    const end = Date.UTC(1989, 0, 1);

    while (timeValue(environment.weather.startedAt) < end) {
      const key = season(environment.weather.startedAt.month);
      const item = stats.get(key) ?? {
        segments: 0,
        wetSegments: 0,
        minutes: 0,
        wetMinutes: 0
      };
      const minutes = durationMinutes(environment);
      const isWet = wetConditions.has(environment.weather.condition);
      item.segments += 1;
      item.wetSegments += isWet ? 1 : 0;
      item.minutes += minutes;
      item.wetMinutes += isWet ? minutes : 0;
      stats.set(key, item);
      environment = refreshWeatherIfExpired(
        environment,
        environment.weather.validUntil
      );
    }

    const segmentRatio = (key: string) => {
      const item = stats.get(key)!;
      return item.wetSegments / item.segments;
    };
    const durationRatio = (key: string) => {
      const item = stats.get(key)!;
      return item.wetMinutes / item.minutes;
    };
    expect(segmentRatio('winter')).toBeLessThanOrEqual(0.05);
    expect(segmentRatio('spring')).toBeLessThanOrEqual(0.2);
    expect(segmentRatio('early_wet')).toBeGreaterThanOrEqual(0.25);
    expect(segmentRatio('early_wet')).toBeLessThanOrEqual(0.35);
    expect(segmentRatio('peak_wet')).toBeGreaterThanOrEqual(0.3);
    expect(segmentRatio('peak_wet')).toBeLessThanOrEqual(0.4);
    expect(segmentRatio('autumn')).toBeLessThanOrEqual(0.15);
    for (const key of stats.keys()) {
      expect(durationRatio(key)).toBeLessThanOrEqual(segmentRatio(key));
    }
  });
});
