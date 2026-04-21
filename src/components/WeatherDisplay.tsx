import type { FieldState, WeatherKind } from '../models/types';

const WEATHER_META: Record<WeatherKind, { icon: string; label: string }> = {
  sun:       { icon: '☀', label: 'Sun' },
  rain:      { icon: '🌧', label: 'Rain' },
  sandstorm: { icon: '🌪', label: 'Sandstorm' },
  snow:      { icon: '❄', label: 'Snow' },
};

export default function WeatherDisplay({ field }: { field: FieldState }) {
  if (!field.weather || field.weatherTurns <= 0) {
    return <div className="weather-pill weather-pill--empty" aria-hidden />;
  }
  const meta = WEATHER_META[field.weather];
  return (
    <div className={`weather-pill weather-pill--${field.weather}`}>
      <span className="weather-icon">{meta.icon}</span>
      <span className="weather-label">{meta.label}</span>
      <span className="weather-turns">{field.weatherTurns}</span>
    </div>
  );
}
