import type { MatchDamageSummary, PokemonData } from '../models/types';
import { formatPokemonName } from '../utils/formatName';
import './DamageSummaryBlock.css';

interface Props {
  summary: MatchDamageSummary;
  allPokemon: PokemonData[];
}

function pct(value: number, total: number): string {
  if (total === 0) return '0.0%';
  return (value / total * 100).toFixed(1) + '%';
}

export default function DamageSummaryBlock({ summary, allPokemon }: Props) {
  const byId = new Map(allPokemon.map(p => [p.id, p]));

  const totalDamage = summary.reduce((s, e) => s + e.physical + e.special + e.other, 0);

  const sorted = [...summary].sort(
    (a, b) => (b.physical + b.special + b.other) - (a.physical + a.special + a.other),
  );

  if (sorted.length === 0) return null;

  return (
    <div className="card damage-summary-block">
      <h3 className="section-title dsb-title">Damage Summary</h3>
      <div className="dsb-table-wrap">
        <table className="dsb-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="dsb-th-left">Pokemon</th>
              <th>Phys%</th>
              <th>Spec%</th>
              <th>Other%</th>
              <th>Total%</th>
              <th>Recoil%</th>
              <th>Heal%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, i) => {
              const p = byId.get(entry.pokemonId);
              const name = p ? formatPokemonName(p.name) : `#${entry.pokemonId}`;
              const entryTotal = entry.physical + entry.special + entry.other;
              return (
                <tr key={entry.pokemonId}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="dsb-pokemon-cell">
                      {p && <img src={p.spriteUrl} alt={p.name} />}
                      <span>{name}</span>
                    </div>
                  </td>
                  <td>{pct(entry.physical, totalDamage)}</td>
                  <td>{pct(entry.special, totalDamage)}</td>
                  <td>{pct(entry.other, totalDamage)}</td>
                  <td className="dsb-total">{pct(entryTotal, totalDamage)}</td>
                  <td>{pct(entry.recoil, totalDamage)}</td>
                  <td>{pct(entry.heal, totalDamage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
