import { useMemo, useState } from 'react';
import type { PokemonData, TypeName, DamageClass } from '../models/types';
import { getPokemonPersisted } from '../persistence/userStorage';
import { effectSummary } from '../utils/moveEffectSummary';
import { damageClassIcon } from '../utils/moveIcon';
import { getTypeEffectiveness, ALL_TYPES } from '../utils/typeChart';
import { getTypeColor } from '../utils/typeColors';
import TypeBadge from './TypeBadge';
import { formatPokemonName } from '../utils/formatName';
import './StatisticsPage.css';

type Tab = 'moves' | 'coverage' | 'elo';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

function formatMoveName(name: string): string {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

export default function StatisticsPage({ allPokemon, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('moves');
  const [hoveredMove, setHoveredMove] = useState<{ idx: number; x: number; y: number; maxH: number } | null>(null);

  const nonDisabled = useMemo(
    () => allPokemon.filter(p => !getPokemonPersisted(p.id).disabled),
    [allPokemon],
  );

  const moveRankings = useMemo(() => {
    const moveCount = new Map<number, {
      name: string;
      type: TypeName;
      damageClass: DamageClass;
      power: number;
      accuracy: number | null;
      priority: number;
      effectText: string;
      pokemon: { name: string; spriteUrl: string }[];
    }>();
    for (const pokemon of nonDisabled) {
      const persisted = getPokemonPersisted(pokemon.id);
      const uniqueMoveIds = new Set(persisted.moveset);
      for (const moveId of uniqueMoveIds) {
        const move = pokemon.availableMoves.find(m => m.id === moveId);
        if (!move) continue;
        if (!moveCount.has(moveId)) {
          moveCount.set(moveId, {
            name: move.name,
            type: move.type,
            damageClass: move.damageClass,
            power: move.power,
            accuracy: move.accuracy,
            priority: move.priority,
            effectText: effectSummary(move),
            pokemon: [],
          });
        }
        moveCount.get(moveId)!.pokemon.push({ name: pokemon.name, spriteUrl: pokemon.spriteUrl });
      }
    }
    return [...moveCount.values()].sort((a, b) => b.pokemon.length - a.pokemon.length);
  }, [nonDisabled]);

  const coverageRankings = useMemo(() => {
    return ALL_TYPES
      .map(type => ({
        type,
        count: nonDisabled.filter(p => {
          const ability = getPokemonPersisted(p.id).selectedAbility ?? p.abilities[0];
          let eff = getTypeEffectiveness(type, p.types);
          if (ability === 'levitate' && type === 'ground') eff = 0;
          if (ability === 'thick-fat' && (type === 'fire' || type === 'ice')) eff *= 0.5;
          return eff > 1;
        }).length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [nonDisabled]);

  const eloRankings = useMemo(() => {
    return nonDisabled
      .map(p => ({ ...p, elo: getPokemonPersisted(p.id).elo }))
      .sort((a, b) => b.elo - a.elo);
  }, [nonDisabled]);

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Statistics</h1>

      <div className="stats-tabs">
        <button className={`stats-tab${tab === 'moves' ? ' active' : ''}`} onClick={() => setTab('moves')}>
          Move Rankings
        </button>
        <button className={`stats-tab${tab === 'coverage' ? ' active' : ''}`} onClick={() => setTab('coverage')}>
          Offensive Coverage
        </button>
        <button className={`stats-tab${tab === 'elo' ? ' active' : ''}`} onClick={() => setTab('elo')}>
          ELO Rankings
        </button>
      </div>

      {tab === 'moves' && (
        <div className="card">
          <p className="stats-desc">
            Moves ranked by number of non-disabled Pokemon that have them in their moveset.
          </p>
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th></th>
                  <th>Move</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Power</th>
                  <th style={{ textAlign: 'right' }}>Acc</th>
                  <th>Effects</th>
                  <th>Pokemon</th>
                </tr>
              </thead>
              <tbody>
                {moveRankings.length === 0 ? (
                  <tr><td colSpan={8} className="stats-empty">No moves found.</td></tr>
                ) : moveRankings.map((m, i) => (
                  <tr key={m.name}>
                    <td className="rank-cell">#{i + 1}</td>
                    <td className="stats-move-class" title={m.damageClass}>
                      {damageClassIcon(m.damageClass)}
                    </td>
                    <td className="stats-move-name">{formatMoveName(m.name)}</td>
                    <td><TypeBadge type={m.type} /></td>
                    <td className="stats-move-num">{m.power || '—'}</td>
                    <td className="stats-move-num">{m.accuracy !== null ? `${m.accuracy}%` : '—'}</td>
                    <td className="stats-move-effects">
                      {m.priority !== 0 && <span className="stats-priority">pri {m.priority > 0 ? '+' : ''}{m.priority}</span>}
                      {m.effectText}
                    </td>
                    <td className="stats-count">
                      <span
                        className="move-poke-count"
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredMove({ idx: i, x: rect.left, y: rect.bottom + 6, maxH: window.innerHeight - rect.bottom - 26 });
                        }}
                        onMouseLeave={() => setHoveredMove(null)}
                      >
                        {m.pokemon.length}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'coverage' && (
        <div className="card">
          <p className="stats-desc">
            Types ranked by how many non-disabled Pokemon they hit for super effective damage.
          </p>
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Type</th>
                  <th>SE Hits</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {coverageRankings.map((c, i) => (
                  <tr key={c.type}>
                    <td className="rank-cell">#{i + 1}</td>
                    <td><TypeBadge type={c.type} /></td>
                    <td className="stats-count">{c.count}</td>
                    <td>
                      <div className="coverage-bar-bg">
                        <div
                          className="coverage-bar-fill"
                          style={{
                            width: nonDisabled.length > 0
                              ? `${(c.count / nonDisabled.length) * 100}%`
                              : '0%',
                            backgroundColor: getTypeColor(c.type),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'elo' && (
        <div className="card">
          <p className="stats-desc">Non-disabled Pokemon ranked by ELO rating.</p>
          <div className="stats-table-wrapper">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Pokemon</th>
                  <th style={{ textAlign: 'right' }}>BST</th>
                  <th style={{ textAlign: 'right' }}>ELO</th>
                </tr>
              </thead>
              <tbody>
                {eloRankings.length === 0 ? (
                  <tr><td colSpan={4} className="stats-empty">No Pokemon found.</td></tr>
                ) : eloRankings.map((p, i) => {
                  const bst = Object.values(p.baseStats).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={p.id}>
                      <td className="rank-cell">#{i + 1}</td>
                      <td>
                        <div className="pokemon-cell">
                          <img src={p.spriteUrl} alt={p.name} className="sim-sprite" />
                          <div>
                            <div className="stats-pokemon-name">{formatPokemonName(p.name)}</div>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {p.types.map(t => <TypeBadge key={t} type={t} />)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600 }}>{bst}</td>
                      <td style={{ textAlign: 'right', color: '#a64dff', fontWeight: 700 }}>{Math.round(p.elo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hoveredMove !== null && (
        <div
          className="move-poke-tooltip"
          style={{ position: 'fixed', left: hoveredMove.x, top: hoveredMove.y, maxHeight: hoveredMove.maxH }}
        >
          {(moveRankings[hoveredMove.idx]?.pokemon ?? []).map(p => (
            <div key={p.name} className="move-poke-row">
              <img src={p.spriteUrl} alt={p.name} className="move-poke-sprite" />
              <span>{formatPokemonName(p.name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
