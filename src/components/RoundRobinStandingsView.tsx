import { useState } from 'react';
import type { PokemonData, DamageStat } from '../models/types';
import type { RR4v4State } from '../tournament/roundRobin4v4Engine';
import { computeStandings } from '../tournament/roundRobin4v4Engine';
import { formatPokemonName } from '../utils/formatName';

interface Props {
  state: RR4v4State;
  allPokemon: PokemonData[];
}

export default function RoundRobinStandingsView({ state, allPokemon }: Props) {
  const [tab, setTab] = useState<'standings' | 'damage'>('standings');
  const byId = new Map(allPokemon.map(p => [p.id, p]));
  const standings = computeStandings(state);
  const n = state.teams.length;

  // Head-to-head result matrix: matrix[row][col] where row/col are team indices
  // in original order. null means not played / same team.
  const matrix: (string | null)[][] = Array.from({ length: n }, () =>
    new Array(n).fill(null),
  );
  state.schedule.forEach((pair, i) => {
    const result = state.results[i];
    if (!result) return;
    const aWon = result.winner === 0;
    matrix[pair.a][pair.b] = aWon ? 'W' : 'L';
    matrix[pair.b][pair.a] = aWon ? 'L' : 'W';
  });

  return (
    <div className="rr-standings">
      <div className="rr-tabs">
        <button
          className={'rr-tab' + (tab === 'standings' ? ' rr-tab--active' : '')}
          onClick={() => setTab('standings')}
        >Standings</button>
        <button
          className={'rr-tab' + (tab === 'damage' ? ' rr-tab--active' : '')}
          onClick={() => setTab('damage')}
        >Damage</button>
      </div>

      {tab === 'standings' && (
        <>
          <h3 className="section-title">Standings</h3>
          <table className="rr-standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>Roster</th>
                <th>P</th>
                <th>W</th>
                <th>L</th>
                <th>Pts</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const team = state.teams[s.teamIdx];
                return (
                  <tr key={s.teamIdx} className={team.isPlayer ? 'rr-row-player' : ''}>
                    <td>{i + 1}</td>
                    <td>{team.name}</td>
                    <td>
                      <div className="rr-roster-mini">
                        {team.roster.map(id => {
                          const p = byId.get(id);
                          return p ? (
                            <img key={id} src={p.spriteUrl} alt={p.name} title={formatPokemonName(p.name)} />
                          ) : null;
                        })}
                      </div>
                    </td>
                    <td>{s.played}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td><strong>{s.points}</strong></td>
                    <td className={s.koDiff > 0 ? 'rr-diff-pos' : s.koDiff < 0 ? 'rr-diff-neg' : ''}>
                      {s.koDiff > 0 ? '+' : ''}{s.koDiff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 className="section-title" style={{ marginTop: '1.5rem' }}>Head-to-Head</h3>
          <div className="rr-matrix-wrap">
            <table className="rr-matrix">
              <thead>
                <tr>
                  <th></th>
                  {state.teams.map((team, i) => {
                    const label = team.isPlayer ? '★' : team.name.replace(/^AI Team /, '');
                    return (
                      <th key={i} title={team.name} className={team.isPlayer ? 'rr-col-player' : ''}>
                        {label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {state.teams.map((row, i) => (
                  <tr key={i} className={row.isPlayer ? 'rr-row-player' : ''}>
                    <th title={row.name}>{row.name}</th>
                    {state.teams.map((_col, j) => {
                      if (i === j) return <td key={j} className="rr-cell-self">—</td>;
                      const v = matrix[i][j];
                      return (
                        <td key={j} className={
                          v === 'W' ? 'rr-cell-win' :
                          v === 'L' ? 'rr-cell-loss' : 'rr-cell-empty'
                        }>{v ?? ''}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'damage' && <DamageTab state={state} byId={byId} />}
    </div>
  );
}

function DamageTab({
  state,
  byId,
}: {
  state: RR4v4State;
  byId: Map<number, PokemonData>;
}) {
  const totals = new Map<number, { pokemonId: number } & DamageStat>();

  for (const result of state.results) {
    if (!result?.damageSummary) continue;
    for (const entry of result.damageSummary) {
      const existing = totals.get(entry.pokemonId) ?? {
        pokemonId: entry.pokemonId,
        physical: 0, special: 0, other: 0, recoil: 0, heal: 0,
      };
      totals.set(entry.pokemonId, {
        pokemonId: entry.pokemonId,
        physical: existing.physical + entry.physical,
        special: existing.special + entry.special,
        other: existing.other + entry.other,
        recoil: existing.recoil + entry.recoil,
        heal: existing.heal + entry.heal,
      });
    }
  }

  const pokemonTeam = new Map<number, string>();
  state.teams.forEach(team => {
    team.roster.forEach(id => pokemonTeam.set(id, team.name));
  });

  const allIds = state.teams.flatMap(t => t.roster);
  const rows = allIds.map(id => totals.get(id) ?? {
    pokemonId: id, physical: 0, special: 0, other: 0, recoil: 0, heal: 0,
  });
  rows.sort((a, b) =>
    (b.physical + b.special + b.other) - (a.physical + a.special + a.other),
  );

  return (
    <div className="rr-damage-tab">
      <h3 className="section-title">Damage Dealt</h3>
      <table className="rr-damage-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pokemon</th>
            <th>Team</th>
            <th>Phys</th>
            <th>Spec</th>
            <th>Other</th>
            <th>Total</th>
            <th>Recoil</th>
            <th>Heal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = byId.get(row.pokemonId);
            const total = row.physical + row.special + row.other;
            return (
              <tr key={row.pokemonId}>
                <td>{i + 1}</td>
                <td>
                  <div className="rr-pokemon-cell">
                    {p && <img src={p.spriteUrl} alt={p.name} style={{ width: 32, height: 32 }} />}
                    <span>{p ? formatPokemonName(p.name) : `#${row.pokemonId}`}</span>
                  </div>
                </td>
                <td>{pokemonTeam.get(row.pokemonId) ?? '—'}</td>
                <td>{row.physical}</td>
                <td>{row.special}</td>
                <td>{row.other}</td>
                <td><strong>{total}</strong></td>
                <td>{row.recoil}</td>
                <td>{row.heal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
