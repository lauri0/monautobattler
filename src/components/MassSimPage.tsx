import { useState, useRef } from 'react';
import type { PokemonData } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { runFullBattle } from '../battle/battleEngine';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
import { applyEloResult } from '../utils/eloCalc';
import { getPokemonPersisted, setManyPokemonPersisted } from '../persistence/userStorage';
import TypeBadge from './TypeBadge';
import { formatPokemonName } from '../utils/formatName';
import './MassSimPage.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

interface SimRecord {
  id: number;
  name: string;
  spriteUrl: string;
  types: PokemonData['types'];
  wins: number;
  losses: number;
  elo: number;
}

type SortKey = 'winPct' | 'elo' | 'wins' | 'losses';

const BATTLE_COUNTS = [100, 1000, 10000];

export default function MassSimPage({ allPokemon, onBack }: Props) {
  const [battleCount, setBattleCount] = useState(100);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SimRecord[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('winPct');
  const [sortAsc, setSortAsc] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  // Store ELO state during sim (not yet persisted)
  const simEloRef = useRef<Map<number, number>>(new Map());

  const enabled = allPokemon.filter(p => !getPokemonPersisted(p.id).disabled);

  async function runSim() {
    if (enabled.length < 2) return;
    setRunning(true);
    setResults(null);
    setProgress(0);

    // Initialize per-sim state
    const eloMap = new Map<number, number>();
    const winsMap = new Map<number, number>();
    const lossesMap = new Map<number, number>();
    for (const p of enabled) {
      const persisted = getPokemonPersisted(p.id);
      eloMap.set(p.id, persisted.elo);
      winsMap.set(p.id, 0);
      lossesMap.set(p.id, 0);
    }
    simEloRef.current = eloMap;

    const total = battleCount;
    const CHUNK = 50;

    for (let i = 0; i < total; i++) {
      // Pick two distinct random enabled Pokemon
      const idxA = Math.floor(Math.random() * enabled.length);
      let idxB = Math.floor(Math.random() * (enabled.length - 1));
      if (idxB >= idxA) idxB++;

      const dataA = enabled[idxA];
      const dataB = enabled[idxB];

      // Build with current sim ELO
      const bpA = buildBattlePokemon(dataA);
      const bpB = buildBattlePokemon(dataB);

      const result = runFullBattle(bpA, bpB, expectiminimaxAI, expectiminimaxAI);
      const winnerId = result.winner.data.id;
      const loserId = result.loser.data.id;

      const wElo = eloMap.get(winnerId) ?? 1500;
      const lElo = eloMap.get(loserId) ?? 1500;
      const { newWinnerElo, newLoserElo } = applyEloResult(wElo, lElo);
      eloMap.set(winnerId, newWinnerElo);
      eloMap.set(loserId, newLoserElo);
      winsMap.set(winnerId, (winsMap.get(winnerId) ?? 0) + 1);
      lossesMap.set(loserId, (lossesMap.get(loserId) ?? 0) + 1);

      if (i % CHUNK === 0) {
        setProgress(i / total);
        // Yield to UI
        await new Promise(r => setTimeout(r, 0));
      }
    }

    setProgress(1);

    const records: SimRecord[] = enabled.map(p => ({
      id: p.id,
      name: p.name,
      spriteUrl: p.spriteUrl,
      types: p.types,
      wins: winsMap.get(p.id) ?? 0,
      losses: lossesMap.get(p.id) ?? 0,
      elo: eloMap.get(p.id) ?? 1500,
    }));

    setResults(records);
    setRunning(false);
    setUnsaved(true);
    simEloRef.current = eloMap;
  }

  function handleSave() {
    if (!results) return;
    const updates = results.map(r => {
      const persisted = getPokemonPersisted(r.id);
      return {
        ...persisted,
        elo: r.elo,
        wins: persisted.wins + r.wins,
        losses: persisted.losses + r.losses,
      };
    });
    setManyPokemonPersisted(updates);
    setUnsaved(false);
    alert('Results saved!');
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = results ? [...results].sort((a, b) => {
    const getVal = (r: SimRecord) => {
      if (sortKey === 'winPct') return (r.wins + r.losses) > 0 ? r.wins / (r.wins + r.losses) : 0;
      if (sortKey === 'elo') return r.elo;
      if (sortKey === 'wins') return r.wins;
      return r.losses;
    };
    const diff = getVal(a) - getVal(b);
    return sortAsc ? diff : -diff;
  }) : null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Mass Simulator</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="sim-config">
          <div>
            <span className="sim-config-label">Number of Battles:</span>
            <div className="sim-count-btns">
              {BATTLE_COUNTS.map(n => (
                <button
                  key={n}
                  className={battleCount === n ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => setBattleCount(n)}
                  disabled={running}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary sim-run-btn" onClick={runSim} disabled={running || enabled.length < 2}>
            {running && <span className="spinner" />}
            Run Simulation
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
              {Math.round(progress * battleCount).toLocaleString()} / {battleCount.toLocaleString()} battles
            </p>
          </div>
        )}
      </div>

      {sorted && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ color: 'var(--text)', fontSize: '1.1rem' }}>Results — {battleCount.toLocaleString()} battles</h2>
            {unsaved && (
              <button className="btn-success" onClick={handleSave}>Save Results</button>
            )}
          </div>
          <div className="sim-table-wrapper">
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Pokemon</th>
                  <th className="sortable" onClick={() => handleSort('wins')}>
                    Wins {sortKey === 'wins' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th className="sortable" onClick={() => handleSort('losses')}>
                    Losses {sortKey === 'losses' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th className="sortable" onClick={() => handleSort('winPct')}>
                    Win% {sortKey === 'winPct' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th className="sortable" onClick={() => handleSort('elo')}>
                    ELO {sortKey === 'elo' ? (sortAsc ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const total = r.wins + r.losses;
                  const winPct = total > 0 ? ((r.wins / total) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={r.id}>
                      <td className="rank-cell">#{i + 1}</td>
                      <td>
                        <div className="pokemon-cell">
                          <img src={r.spriteUrl} alt={r.name} className="sim-sprite" />
                          <div>
                            <div className="sim-pokemon-name">{formatPokemonName(r.name)}</div>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {r.types.map(t => <TypeBadge key={t} type={t} />)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: '#27ae60', fontWeight: 700 }}>{r.wins}</td>
                      <td style={{ color: '#e94560', fontWeight: 700 }}>{r.losses}</td>
                      <td style={{ fontWeight: 700 }}>{winPct}%</td>
                      <td style={{ color: '#a64dff', fontWeight: 700 }}>{r.elo}</td>
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
