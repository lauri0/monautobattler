import type { FieldState, TerrainKind } from '../models/types';

const TERRAIN_META: Record<TerrainKind, { icon: string; label: string }> = {
  grassy:   { icon: '🌿', label: 'Grassy' },
  electric: { icon: '⚡', label: 'Electric' },
  psychic:  { icon: '🔮', label: 'Psychic' },
  misty:    { icon: '🌫', label: 'Misty' },
};

export default function TerrainDisplay({ field }: { field: FieldState }) {
  if (!field.terrain || field.terrainTurns <= 0) {
    return <div className="terrain-placeholder" aria-hidden />;
  }
  const meta = TERRAIN_META[field.terrain];
  return (
    <div className={`weather-pill weather-pill--terrain-${field.terrain}`}>
      <span className="weather-icon">{meta.icon}</span>
      <span className="weather-label">{meta.label}</span>
      <span className="weather-turns">{field.terrainTurns}</span>
    </div>
  );
}
