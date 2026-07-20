import { describe, expect, it } from 'vitest';
import {
  applyWeatherPatchToEnvironment,
  createInitialEnvironment,
  deriveWeatherForTime,
  refreshWeatherIfExpired
} from './weather';

describe('weather runtime', () => {
  it('derives seasonal Hong Kong weather from game time', () => {
    const weather = deriveWeatherForTime({ year: 1988, month: 8, day: 12, hour: 21, minute: 15 });

    expect(['humid_hot', 'cloudy', 'light_rain', 'heavy_rain', 'thunderstorm', 'typhoon_signal']).toContain(
      weather.condition
    );
    expect(weather.source).toBe('seasonal');
    expect(weather.startedAt.hour).toBe(21);
    expect(weather.validUntil).toBeDefined();
  });

  it('refreshes expired weather from the current time', () => {
    const environment = createInitialEnvironment({ year: 1988, month: 12, day: 20, hour: 8, minute: 0 });
    environment.weather.validUntil = { year: 1988, month: 12, day: 20, hour: 9, minute: 0 };

    const refreshed = refreshWeatherIfExpired(environment, { year: 1988, month: 12, day: 20, hour: 12, minute: 0 });

    expect(refreshed.weather.source).toBe('seasonal');
    expect(refreshed.weather.startedAt.hour).toBe(12);
  });

  it('applies LLM weatherPatch with bounded intensity and duration', () => {
    const environment = createInitialEnvironment({ year: 1988, month: 9, day: 12, hour: 21, minute: 15 });

    const patched = applyWeatherPatchToEnvironment(
      environment,
      {
        condition: 'heavy_rain',
        label: '大雨',
        intensity: 120,
        impactSummary: '路面湿滑，霓虹反光，巡逻视线受影响。',
        validForMinutes: 90,
        tags: ['wet_road']
      },
      { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    );

    expect(patched.weather.condition).toBe('heavy_rain');
    expect(patched.weather.source).toBe('llm');
    expect(patched.weather.intensity).toBe(100);
    expect(patched.weather.validUntil.hour).toBe(22);
    expect(patched.weather.validUntil.minute).toBe(45);
    expect(patched.weather.tags).toContain('wet_road');
  });
});
