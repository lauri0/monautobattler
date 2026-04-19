import type { PokemonData } from '../models/types';

const STAT_ROWS: { key: keyof PokemonData['baseStats']; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'specialAttack', label: 'SpA' },
  { key: 'specialDefense', label: 'SpD' },
  { key: 'speed', label: 'Spe' },
];

export default function BaseStatsPanel({ data }: { data: PokemonData }) {
  const bst = STAT_ROWS.reduce((s, r) => s + data.baseStats[r.key], 0);
  return (
    <div className="base-stats-panel">
      <div className="base-stats-title">Base Stats</div>
      {STAT_ROWS.map(r => {
        const v = data.baseStats[r.key];
        const pct = Math.min(100, (v / 255) * 100);
        const color =
          pct > 70 ? '#8b00ff'
          : pct > 60 ? '#0055ff'
          : pct > 50 ? '#00bcd4'
          : pct > 40 ? '#27ae60'
          : pct > 30 ? '#f1c40f'
          : pct > 20 ? '#FD7D12'
          : '#e74c3c';
        return (
          <div key={r.key} className="base-stat-row">
            <span className="base-stat-label">{r.label}</span>
            <span className="base-stat-value">{v}</span>
            <span className="base-stat-bar"><span style={{ width: `${pct}%`, background: color }} /></span>
          </div>
        );
      })}
      <div className="base-stat-row base-stat-total">
        <span className="base-stat-label">BST</span>
        <span className="base-stat-value">{bst}</span>
        <span />
      </div>
    </div>
  );
}
