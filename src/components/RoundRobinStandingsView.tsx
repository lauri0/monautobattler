import type { PokemonData } from '../models/types';
import type { RR4v4State } from '../tournament/roundRobin4v4Engine';
import { computeStandings } from '../tournament/roundRobin4v4Engine';
import { formatPokemonName } from '../utils/formatName';

interface Props {
  state: RR4v4State;
  allPokemon: PokemonData[];
}

export default function RoundRobinStandingsView({ state, allPokemon }: Props) {
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

  const rank = new Map<number, number>();
  standings.forEach((s, i) => rank.set(s.teamIdx, i + 1));

  return (
    <div className="rr-standings">
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
              {state.teams.map((_, i) => (
                <th key={i} title={state.teams[i].name}>{rank.get(i)}</th>
              ))}
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
    </div>
  );
}
