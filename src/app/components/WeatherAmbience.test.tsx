import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeatherAmbience } from './WeatherAmbience';

describe('WeatherAmbience', () => {
  it('switches clear weather between sunlight and moonlight from game time', () => {
    const { rerender } = render(<WeatherAmbience condition="clear" intensity={20} hour={14} />);
    const ambience = screen.getByTestId('game-weather-ambience');

    expect(ambience).toHaveAttribute('data-period', 'day');
    expect(ambience).toHaveClass('game-weather-ambience--day');
    expect(ambience.querySelector('.game-weather-celestial')).not.toBeNull();

    rerender(<WeatherAmbience condition="clear" intensity={20} hour={23} />);

    expect(ambience).toHaveAttribute('data-period', 'night');
    expect(ambience).toHaveClass('game-weather-ambience--night');
  });

  it('renders bounded independent rain and storm layers without interactive content', () => {
    render(<WeatherAmbience condition="thunderstorm" intensity={100} hour={21} />);
    const ambience = screen.getByTestId('game-weather-ambience');

    expect(ambience.querySelectorAll('.game-weather-particle--rain')).toHaveLength(20);
    expect(ambience.querySelectorAll('.game-weather-particle--cloud')).toHaveLength(2);
    expect(ambience.querySelector('.game-weather-lightning')).not.toBeNull();
    expect(ambience).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses dedicated lightweight layers for fog, heat and typhoon wind', () => {
    const { rerender } = render(<WeatherAmbience condition="foggy" intensity={50} hour={9} />);
    const ambience = screen.getByTestId('game-weather-ambience');

    expect(ambience.querySelectorAll('.game-weather-particle--fog')).toHaveLength(3);

    rerender(<WeatherAmbience condition="humid_hot" intensity={60} hour={15} />);
    expect(ambience.querySelectorAll('.game-weather-particle--heat')).toHaveLength(4);

    rerender(<WeatherAmbience condition="typhoon_signal" intensity={90} hour={18} />);
    expect(ambience.querySelectorAll('.game-weather-particle--wind')).toHaveLength(7);
    expect(ambience.querySelectorAll('.game-weather-particle--rain').length).toBeLessThanOrEqual(20);
  });
});
