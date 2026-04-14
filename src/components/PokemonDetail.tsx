import { useState } from 'react';
import type { PokemonData, Move } from '../models/types';
import { getPokemonPersisted, setPokemonPersisted, getAllowedMoveIds } from '../persistence/userStorage';
import { calcLevel50Stats } from '../utils/statCalc';
import { getDefensiveMatchups } from '../utils/typeChart';
import { getTypeColor } from '../utils/typeColors';
import TypeBadge from './TypeBadge';
import './PokemonDetail.css';

interface Props {
  pokemon: PokemonData;
  onBack: () => void;
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP', attack: 'Atk', defense: 'Def',
  specialAttack: 'SpA', specialDefense: 'SpD', speed: 'Spe',
};
const STAT_MAX = 255;

import { effectSummary } from '../utils/moveEffectSummary';

export default function PokemonDetail({ pokemon, onBack }: Props) {
  const persisted = getPokemonPersisted(pokemon.id);
  const allowedIds = getAllowedMoveIds();

  const [moveset, setMoveset] = useState<number[]>(() => {
    const stored = persisted.moveset.length === 4
      ? persisted.moveset
      : pokemon.availableMoves.slice(0, 4).map(m => m.id);
    // Keep only allowed moves; fill remaining slots from allowed list
    const valid = stored.filter(id => allowedIds.includes(id));
    if (valid.length < 4) {
      const used = new Set(valid);
      for (const m of pokemon.availableMoves) {
        if (valid.length >= 4) break;
        if (allowedIds.includes(m.id) && !used.has(m.id)) {
          valid.push(m.id);
          used.add(m.id);
        }
      }
    }
    return valid;
  });
  const [disabled, setDisabled] = useState(persisted.disabled);
  const [saved, setSaved] = useState(false);

  const stats = calcLevel50Stats(pokemon.baseStats);
  const { weaknesses, resistances, immunities } = getDefensiveMatchups(pokemon.types);
  const moveMap = new Map<number, Move>(pokemon.availableMoves.map(m => [m.id, m]));

  function handleMoveChange(slot: number, moveId: number) {
    const next = [...moveset];
    next[slot] = moveId;
    setMoveset(next);
    setSaved(false);
  }

  function handleSave() {
    setPokemonPersisted({ ...persisted, moveset, disabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const winPct = persisted.wins + persisted.losses > 0
    ? ((persisted.wins / (persisted.wins + persisted.losses)) * 100).toFixed(1)
    : '—';

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <div className="detail-layout">
        {/* Left panel */}
        <div className="detail-left">
          <div className="card detail-hero">
            <span className="detail-num">#{String(pokemon.id).padStart(3, '0')}</span>
            <img src={pokemon.spriteUrl} alt={pokemon.name} className="detail-artwork" />
            <h1 className="detail-name">{pokemon.name}</h1>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {pokemon.types.map(t => <TypeBadge key={t} type={t} />)}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="detail-record-row">
              <div className="detail-stat-box">
                <span className="detail-stat-label">ELO</span>
                <span className="detail-stat-val" style={{ color: '#a64dff' }}>{persisted.elo}</span>
              </div>
              <div className="detail-stat-box">
                <span className="detail-stat-label">Wins</span>
                <span className="detail-stat-val" style={{ color: '#27ae60' }}>{persisted.wins}</span>
              </div>
              <div className="detail-stat-box">
                <span className="detail-stat-label">Losses</span>
                <span className="detail-stat-val" style={{ color: '#e94560' }}>{persisted.losses}</span>
              </div>
              <div className="detail-stat-box">
                <span className="detail-stat-label">Win%</span>
                <span className="detail-stat-val">{winPct}{winPct !== '—' ? '%' : ''}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="detail-right">
          {/* Stats */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 className="section-title">Level 50 Stats</h3>
            <table className="stats-table">
              <tbody>
                {(Object.keys(STAT_LABELS) as (keyof typeof stats)[]).map(key => {
                  const base = pokemon.baseStats[key as keyof typeof pokemon.baseStats];
                  const lv50 = stats[key as keyof typeof stats];
                  const pct = Math.min(100, (base / STAT_MAX) * 100);
                  return (
                    <tr key={key}>
                      <td className="stat-label">{STAT_LABELS[key]}</td>
                      <td className="stat-base">{base}</td>
                      <td className="stat-bar-cell">
                        <div className="stat-bar-bg">
                          <div className="stat-bar-fill" style={{
                            width: `${pct}%`,
                            background: pct > 66 ? '#27ae60' : pct > 33 ? '#f39c12' : '#e74c3c'
                          }} />
                        </div>
                      </td>
                      <td className="stat-lv50">{lv50}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Type matchups */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 className="section-title">Type Matchups</h3>
            {weaknesses.length > 0 && (
              <div className="matchup-row">
                <span className="matchup-label">Weak to:</span>
                <div className="matchup-badges">
                  {weaknesses.map(({ type, mult }) => (
                    <span key={type} className="matchup-badge" style={{ background: getTypeColor(type) }}>
                      {type} ×{mult}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {resistances.length > 0 && (
              <div className="matchup-row">
                <span className="matchup-label">Resists:</span>
                <div className="matchup-badges">
                  {resistances.map(({ type, mult }) => (
                    <span key={type} className="matchup-badge" style={{ background: getTypeColor(type), opacity: 0.75 }}>
                      {type} ×{mult}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {immunities.length > 0 && (
              <div className="matchup-row">
                <span className="matchup-label">Immune:</span>
                <div className="matchup-badges">
                  {immunities.map(type => (
                    <span key={type} className="matchup-badge" style={{ background: '#555' }}>
                      {type} ×0
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Moveset */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <h3 className="section-title">Moveset</h3>
            <div className="moveset-slots">
              {[0, 1, 2, 3].map(slot => {
                const selectedMove = moveMap.get(moveset[slot]);
                return (
                  <div key={slot} className="move-slot">
                    <span className="move-slot-num">Slot {slot + 1}</span>
                    <select
                      value={moveset[slot] ?? ''}
                      onChange={e => handleMoveChange(slot, Number(e.target.value))}
                      style={{ flex: 1 }}
                    >
                      {pokemon.availableMoves
                        .filter(m => allowedIds.includes(m.id))
                        .map(m => {
                          const fx = effectSummary(m);
                          return (
                            <option key={m.id} value={m.id} style={{ background: getTypeColor(m.type), color: '#fff' }}>
                              {`${m.damageClass === 'physical' ? '⚔' : '✦'} ${m.name}  ${m.power}pw  ${m.accuracy ?? '—'}%${fx ? `  · ${fx}` : ''}`}
                            </option>
                          );
                        })}
                    </select>
                    {selectedMove && (
                      <TypeBadge type={selectedMove.type} />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={disabled}
                  onChange={e => { setDisabled(e.target.checked); setSaved(false); }}
                />
                Disable in battles
              </label>
            </div>
            <button className="btn-primary" style={{ marginTop: '0.75rem' }} onClick={handleSave}>
              {saved ? '✓ Saved!' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
