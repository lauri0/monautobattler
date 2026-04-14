import { useState } from 'react';
import type { PokemonData } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { runFullBattle } from '../battle/battleEngine';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
import { getPokemonPersisted } from '../persistence/userStorage';
import TypeBadge from './TypeBadge';
import './GauntletPage.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

interface MatchupResult {
  id: number;
  name: string;
  spriteUrl: string;
  types: PokemonData['types'];
  wins: number;
  losses: number;
}

type SortKey = 'winPct' | 'id' | 'name';

export default function GauntletPage({ allPokemon, onBack }: Props) {
  const enabled = allPokemon.filter(p => !getPokemonPersisted(p.id).disabled);
  const [selectedId, setSelectedId] = useState<number>(enabled[0]?.id ?? 0);
  const [battlesPer, setBattlesPer] = useState(5);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<MatchupResult[] | null>(null);
  const [resultsHeader, setResultsHeader] = useState<{ name: string; battlesPer: number } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('winPct');
  const [sortAsc, setSortAsc] = useState(false);

  async function runGauntlet() {
    const myData = allPokemon.find(p => p.id === selectedId);
    if (!myData) return;
    // Skip opponents (and abort if self) with zero available moves — they
    // can't participate in a battle.
    if (myData.availableMoves.length === 0) {
      alert(`${myData.name} has no available moves to battle with.`);
      return;
    }
    const opponents = enabled.filter(
      p => p.id !== selectedId && p.availableMoves.length > 0
    );
    if (opponents.length === 0) return;

    setRunning(true);
    setResults(null);
    setProgress(0);

    const records: MatchupResult[] = opponents.map(p => ({
      id: p.id,
      name: p.name,
      spriteUrl: p.spriteUrl,
      types: p.types,
      wins: 0,
      losses: 0,
    }));

    const totalBattles = opponents.length * battlesPer;
    let done = 0;

    for (let i = 0; i < opponents.length; i++) {
      const opp = opponents[i];
      for (let b = 0; b < battlesPer; b++) {
        const mine = buildBattlePokemon(myData);
        const theirs = buildBattlePokemon(opp);
        const result = runFullBattle(mine, theirs, expectiminimaxAI, expectiminimaxAI);
        if (result.winner.data.id === myData.id) {
          records[i].wins++;
        } else {
          records[i].losses++;
        }
        done++;
      }
      setProgress(done / totalBattles);
      // Yield to UI so progress updates and page stays responsive
      await new Promise(r => setTimeout(r, 0));
    }

    setResults(records);
    setResultsHeader({ name: myData.name, battlesPer });
    setRunning(false);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      // Sensible defaults per key: winPct descending, id ascending, name ascending
      setSortAsc(key !== 'winPct');
    }
  }

  const sorted = results ? [...results].sort((a, b) => {
    if (sortKey === 'id') {
      return sortAsc ? a.id - b.id : b.id - a.id;
    }
    if (sortKey === 'name') {
      const cmp = a.name.localeCompare(b.name);
      return sortAsc ? cmp : -cmp;
    }
    const aTotal = a.wins + a.losses;
    const bTotal = b.wins + b.losses;
    const aPct = aTotal > 0 ? a.wins / aTotal : 0;
    const bPct = bTotal > 0 ? b.wins / bTotal : 0;
    return sortAsc ? aPct - bPct : bPct - aPct;
  }) : null;

  const totalWins = results ? results.reduce((s, r) => s + r.wins, 0) : 0;
  const totalLosses = results ? results.reduce((s, r) => s + r.losses, 0) : 0;
  const totalBattles = totalWins + totalLosses;
  const overallPct = totalBattles > 0 ? (totalWins / totalBattles) * 100 : 0;

  const selectedData = allPokemon.find(p => p.id === selectedId);

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Gauntlet</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '-0.5rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Pit one Pokemon against every other Pokemon to test its moveset.
      </p>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="gauntlet-config">
          <div className="gauntlet-config-group">
            <label className="gauntlet-label">Your Pokemon</label>
            <select
              value={selectedId}
              onChange={e => setSelectedId(Number(e.target.value))}
              disabled={running}
              className="gauntlet-select"
            >
              {enabled.map(p => (
                <option key={p.id} value={p.id}>#{p.id} {p.name}</option>
              ))}
            </select>
            {selectedData && (
              <div className="gauntlet-moveset">
                <span className="gauntlet-moveset-label">Moveset:</span>
                {buildBattlePokemon(selectedData).moves.map((m, i) => (
                  <span key={i} className="gauntlet-move-chip">{m.name}</span>
                ))}
              </div>
            )}
          </div>

          <div className="gauntlet-config-group">
            <label className="gauntlet-label">Battles per opponent</label>
            <div className="gauntlet-count-row">
              <input
                type="range"
                min={1}
                max={20}
                value={battlesPer}
                onChange={e => setBattlesPer(Number(e.target.value))}
                disabled={running}
                className="gauntlet-slider"
              />
              <span className="gauntlet-count-value">{battlesPer}</span>
            </div>
            <div className="gauntlet-total-hint">
              Total: {(enabled.length - 1) * battlesPer} battles vs {Math.max(0, enabled.length - 1)} opponents
            </div>
          </div>

          <button
            className="btn-primary gauntlet-run-btn"
            onClick={runGauntlet}
            disabled={running || enabled.length < 2}
          >
            {running && <span className="spinner" />}
            Run Gauntlet
          </button>
        </div>

        {enabled.length < 2 && (
          <p style={{ color: '#f44336', marginTop: '0.75rem', fontSize: '0.9rem' }}>
            At least 2 enabled Pokemon required.
          </p>
        )}

        {running && (
          <div style={{ marginTop: '1rem' }}>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              {Math.round(progress * 100)}% complete
            </p>
          </div>
        )}
      </div>

      {sorted && resultsHeader && (
        <div className="card">
          <div className="gauntlet-summary">
            <div>
              <h2 style={{ color: 'var(--text)', fontSize: '1.1rem', textTransform: 'capitalize' }}>
                {resultsHeader.name} — Results
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {resultsHeader.battlesPer} battle{resultsHeader.battlesPer === 1 ? '' : 's'} against each of {sorted.length} opponents
              </p>
            </div>
            <div className="gauntlet-overall">
              <span className="gauntlet-overall-label">Overall Win Rate</span>
              <span className="gauntlet-overall-value">{overallPct.toFixed(1)}%</span>
              <span className="gauntlet-overall-sub">
                {totalWins}W / {totalLosses}L ({totalBattles} battles)
              </span>
            </div>
          </div>

          <div className="sim-table-wrapper">
            <table className="sim-table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => handleSort('id')}>
                    # {sortKey === 'id' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th className="sortable" onClick={() => handleSort('name')}>
                    Opponent {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th>Wins</th>
                  <th>Losses</th>
                  <th className="sortable" onClick={() => handleSort('winPct')}>
                    Win% {sortKey === 'winPct' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const total = r.wins + r.losses;
                  const winPct = total > 0 ? (r.wins / total) * 100 : 0;
                  const winPctLabel = winPct.toFixed(1);
                  const barColor =
                    winPct >= 70 ? '#27ae60' :
                    winPct >= 50 ? '#f1c40f' :
                    winPct >= 30 ? '#e67e22' : '#e94560';
                  return (
                    <tr key={r.id}>
                      <td className="rank-cell">#{r.id}</td>
                      <td>
                        <div className="pokemon-cell">
                          <img src={r.spriteUrl} alt={r.name} className="sim-sprite" />
                          <div>
                            <div className="sim-pokemon-name">{r.name}</div>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {r.types.map(t => <TypeBadge key={t} type={t} />)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: '#27ae60', fontWeight: 700 }}>{r.wins}</td>
                      <td style={{ color: '#e94560', fontWeight: 700 }}>{r.losses}</td>
                      <td>
                        <div className="gauntlet-winpct-cell">
                          <div className="gauntlet-winpct-bar-bg">
                            <div
                              className="gauntlet-winpct-bar"
                              style={{ width: `${winPct}%`, background: barColor }}
                            />
                          </div>
                          <span style={{ fontWeight: 700, minWidth: '3.5em', textAlign: 'right' }}>
                            {winPctLabel}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
