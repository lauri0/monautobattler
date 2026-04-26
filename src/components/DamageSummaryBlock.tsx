import type { MatchDamageSummary, PokemonData } from '../models/types';
import { formatPokemonName } from '../utils/formatName';

interface Props {
  summary: MatchDamageSummary;
  allPokemon: PokemonData[];
}

export default function DamageSummaryBlock({ summary, allPokemon }: Props) {
  const byId = new Map(allPokemon.map(p => [p.id, p]));

  const sorted = [...summary].sort(
    (a, b) => (b.physical + b.special + b.other) - (a.physical + a.special + a.other),
  );

  if (sorted.length === 0) return null;

  return (
    <div className="card damage-summary-block">
      <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Damage Summary</h3>
      <ol className="damage-summary-list">
        {sorted.map((entry, i) => {
          const p = byId.get(entry.pokemonId);
          const name = p ? formatPokemonName(p.name) : `#${entry.pokemonId}`;
          const total = entry.physical + entry.special + entry.other;
          return (
            <li key={entry.pokemonId} className="damage-summary-row">
              <span className="dsb-rank">{i + 1}.</span>
              {p && <img className="dsb-sprite" src={p.spriteUrl} alt={p.name} />}
              <span className="dsb-name">{name}</span>
              <span className="dsb-total">{total} dmg</span>
              <span className="dsb-breakdown">
                (Phys: {entry.physical} / Spec: {entry.special} / Other: {entry.other}
                {' | '}Recoil: {entry.recoil} / Heal: {entry.heal})
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
