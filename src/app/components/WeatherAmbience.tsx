import type { CSSProperties } from 'react';
import type { WeatherCondition } from '../../domain/runtime/types';

interface WeatherAmbienceProps {
  condition: WeatherCondition;
  intensity: number;
  hour: number;
}

type WeatherParticleStyle = CSSProperties & {
  '--weather-x': string;
  '--weather-delay': string;
  '--weather-duration': string;
  '--weather-size': string;
};

type WeatherAmbienceStyle = CSSProperties & {
  '--weather-ambience-opacity': string;
};

const rainConditions = new Set<WeatherCondition>([
  'light_rain',
  'heavy_rain',
  'thunderstorm',
  'typhoon_signal'
]);

function clampIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) return 0;
  return Math.max(0, Math.min(100, intensity));
}

function particleStyle(index: number, kind: 'rain' | 'cloud' | 'fog' | 'wind' | 'heat'): WeatherParticleStyle {
  const x = (index * 37 + 9) % 101;
  const delay = -((index * 19 + 7) % 41) / 10;
  const durationBase = {
    rain: 0.72,
    cloud: 13,
    fog: 10,
    wind: 2.4,
    heat: 3.8
  }[kind];
  const durationStep = {
    rain: 0.07,
    cloud: 2.1,
    fog: 1.8,
    wind: 0.35,
    heat: 0.45
  }[kind];
  const sizeBase = kind === 'rain' ? 9 : kind === 'wind' ? 34 : kind === 'heat' ? 18 : 42;

  return {
    '--weather-x': `${x}%`,
    '--weather-delay': `${delay}s`,
    '--weather-duration': `${durationBase + (index % 5) * durationStep}s`,
    '--weather-size': `${sizeBase + (index % 4) * 7}px`
  };
}

function renderParticles(kind: 'rain' | 'cloud' | 'fog' | 'wind' | 'heat', count: number) {
  return Array.from({ length: count }, (_, index) => (
    <span
      key={`${kind}-${index}`}
      className={`game-weather-particle game-weather-particle--${kind}`}
      style={particleStyle(index, kind)}
    />
  ));
}

export function WeatherAmbience({ condition, intensity, hour }: WeatherAmbienceProps) {
  const boundedIntensity = clampIntensity(intensity);
  const isNight = hour < 6 || hour >= 18;
  const rainCount = rainConditions.has(condition)
    ? Math.max(8, Math.min(20, Math.round(6 + boundedIntensity * 0.14)))
    : 0;
  const cloudCount = condition === 'cloudy'
    ? 4
    : rainConditions.has(condition)
      ? 2
      : 0;
  const fogCount = condition === 'foggy' ? 3 : 0;
  const windCount = condition === 'typhoon_signal' ? 7 : condition === 'cool_dry' ? 5 : 0;
  const heatCount = condition === 'humid_hot' ? 4 : 0;
  const showCelestial = condition === 'clear' || condition === 'cool_dry';
  const ambienceStyle: WeatherAmbienceStyle = {
    '--weather-ambience-opacity': String(0.32 + boundedIntensity * 0.0042)
  };

  return (
    <div
      className={`game-weather-ambience game-weather-ambience--${condition} ${
        isNight ? 'game-weather-ambience--night' : 'game-weather-ambience--day'
      }`}
      style={ambienceStyle}
      data-testid="game-weather-ambience"
      data-condition={condition}
      data-period={isNight ? 'night' : 'day'}
      aria-hidden="true"
    >
      {showCelestial ? <span className="game-weather-celestial" /> : null}
      {cloudCount > 0 ? (
        <span className="game-weather-particle-field game-weather-particle-field--cloud">
          {renderParticles('cloud', cloudCount)}
        </span>
      ) : null}
      {rainCount > 0 ? (
        <span className="game-weather-particle-field game-weather-particle-field--rain">
          {renderParticles('rain', rainCount)}
        </span>
      ) : null}
      {fogCount > 0 ? (
        <span className="game-weather-particle-field game-weather-particle-field--fog">
          {renderParticles('fog', fogCount)}
        </span>
      ) : null}
      {windCount > 0 ? (
        <span className="game-weather-particle-field game-weather-particle-field--wind">
          {renderParticles('wind', windCount)}
        </span>
      ) : null}
      {heatCount > 0 ? (
        <span className="game-weather-particle-field game-weather-particle-field--heat">
          {renderParticles('heat', heatCount)}
        </span>
      ) : null}
      {condition === 'thunderstorm' ? <span className="game-weather-lightning" /> : null}
    </div>
  );
}
