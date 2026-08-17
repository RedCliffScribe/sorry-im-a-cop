import { describe, expect, it } from 'vitest';
import {
  normalizeAvgTimePhase,
  normalizeAvgWeatherDescription,
  normalizeAvgWeatherKind
} from './normalizers';

function at(hour: number, minute: number) {
  return { hour, minute };
}

describe('AVG environment normalizers', () => {
  it.each([
    [0, 0, 'late_night'],
    [4, 59, 'late_night'],
    [5, 0, 'dawn'],
    [6, 59, 'dawn'],
    [7, 0, 'day'],
    [16, 59, 'day'],
    [17, 0, 'dusk'],
    [18, 59, 'dusk'],
    [19, 0, 'night'],
    [23, 59, 'night']
  ] as const)('normalizes %i:%i to %s', (hour, minute, expected) => {
    expect(normalizeAvgTimePhase(at(hour, minute))).toBe(expected);
  });

  it('fails soft for missing or invalid time', () => {
    expect(normalizeAvgTimePhase(undefined)).toBe('unknown');
    expect(normalizeAvgTimePhase(at(-1, 0))).toBe('unknown');
    expect(normalizeAvgTimePhase(at(24, 0))).toBe('unknown');
    expect(normalizeAvgTimePhase(at(12, 60))).toBe('unknown');
    expect(normalizeAvgTimePhase({ hour: Number.NaN, minute: 0 })).toBe('unknown');
  });

  it.each([
    ['clear', 'clear'],
    ['cloudy', 'cloudy'],
    ['light_rain', 'rain'],
    ['heavy_rain', 'heavy_rain'],
    ['thunderstorm', 'storm'],
    ['typhoon_signal', 'storm'],
    ['foggy', 'fog'],
    ['humid_hot', 'clear'],
    ['cool_dry', 'clear']
  ] as const)('maps runtime weather %s to %s', (condition, expected) => {
    expect(normalizeAvgWeatherKind(condition)).toBe(expected);
  });

  it('supports frozen visual-context aliases without reading story prose', () => {
    expect(normalizeAvgWeatherDescription('大雨；路面湿滑')).toBe('heavy_rain');
    expect(normalizeAvgWeatherDescription('薄雾；能见度降低')).toBe('fog');
    expect(normalizeAvgWeatherDescription('Thunderstorm warning')).toBe('storm');
    expect(normalizeAvgWeatherDescription('purple_typhoon')).toBe('unknown');
    expect(normalizeAvgWeatherDescription(undefined)).toBe('unknown');
  });
});
