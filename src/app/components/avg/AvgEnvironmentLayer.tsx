import type { CSSProperties } from 'react';
import type { AvgEnvironmentVisualState } from '../../../domain/avgEnvironment';

type AvgEnvironmentCssProperties = CSSProperties & {
  '--avg-scene-brightness': string;
  '--avg-scene-contrast': string;
  '--avg-scene-saturation': string;
  '--avg-portrait-brightness': string;
  '--avg-portrait-contrast': string;
  '--avg-portrait-saturation': string;
  '--avg-environment-tone-color': string;
  '--avg-environment-tone-opacity': string;
};

type AvgRainDropProperties = CSSProperties & {
  '--avg-rain-x': string;
  '--avg-rain-delay': string;
  '--avg-rain-duration': string;
  '--avg-rain-length': string;
};

const RAIN_DROP_COUNT = 18;
const FOG_BAND_COUNT = 3;

function rainDropStyle(index: number): AvgRainDropProperties {
  return {
    '--avg-rain-x': `${(index * 37 + 7) % 103}%`,
    '--avg-rain-delay': `${-((index * 17 + 5) % 37) / 10}s`,
    '--avg-rain-duration': `${0.72 + (index % 5) * 0.08}s`,
    '--avg-rain-length': `${22 + (index % 4) * 8}px`
  };
}

export function avgEnvironmentCssVariables(
  state: AvgEnvironmentVisualState
): AvgEnvironmentCssProperties {
  const tone = state.backgroundGrade.colorOverlay;
  return {
    '--avg-scene-brightness': String(state.backgroundGrade.brightness),
    '--avg-scene-contrast': String(state.backgroundGrade.contrast),
    '--avg-scene-saturation': String(state.backgroundGrade.saturation),
    '--avg-portrait-brightness': String(state.portraitGrade.brightness),
    '--avg-portrait-contrast': String(state.portraitGrade.contrast),
    '--avg-portrait-saturation': String(state.portraitGrade.saturation),
    '--avg-environment-tone-color': tone?.color ?? 'transparent',
    '--avg-environment-tone-opacity': String(tone?.opacity ?? 0)
  };
}

export function AvgEnvironmentLayer({ state }: { state: AvgEnvironmentVisualState }) {
  const rain = state.overlays.find((overlay) => overlay.kind === 'rain');
  const fog = state.overlays.find((overlay) => overlay.kind === 'fog');

  return (
    <>
      <div
        className="avg-environment-lighting-layer"
        data-testid="avg-environment-lighting"
        aria-hidden="true"
      />
      <div
        className="avg-weather-overlay-layer"
        data-testid="avg-weather-overlay"
        data-rain-active={Boolean(rain)}
        data-fog-active={Boolean(fog)}
        aria-hidden="true"
      >
        {rain ? (
          <div
            className="avg-weather-rain"
            data-testid="avg-weather-rain"
            style={{
              '--avg-rain-opacity': String(rain.opacity),
              '--avg-rain-density': String(rain.density)
            } as CSSProperties}
          >
            {Array.from({ length: RAIN_DROP_COUNT }, (_, index) => (
              <i key={index} style={rainDropStyle(index)} />
            ))}
          </div>
        ) : null}
        {fog ? (
          <div
            className="avg-weather-fog"
            data-testid="avg-weather-fog"
            style={{
              '--avg-fog-opacity': String(fog.opacity),
              '--avg-fog-density': String(fog.density)
            } as CSSProperties}
          >
            {Array.from({ length: FOG_BAND_COUNT }, (_, index) => <i key={index} />)}
          </div>
        ) : null}
      </div>
    </>
  );
}
