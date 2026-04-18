import type { TournamentGroup, GroupMatch } from '../models/types';

interface Props {
  groups: TournamentGroup[];
  nextMatch: GroupMatch | null;
}

export default function TournamentGroupView({ groups, nextMatch }: Props) {
  return (
    <div className="tournament-groups">
      {groups.map(group => (
        <div key={group.label} className="tournament-group card">
          <h3 className="group-header">Group {group.label}</h3>
          <table className="group-table">
            <thead>
              <tr>
                <th className="group-th-pokemon">Pokemon</th>
                <th>P</th>
                <th>W</th>
                <th>L</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {[...group.standings]
                .sort((a, b) => b.points - a.points || b.wins - a.wins)
                .map((s, idx) => (
                  <tr key={s.pokemon.id} className={idx < 2 ? 'group-qualifying' : ''}>
                    <td className="group-pokemon-cell">
                      <img src={s.pokemon.spriteUrl} alt={s.pokemon.name} className="group-sprite" />
                      <span>{s.pokemon.name}</span>
                    </td>
                    <td>{s.played}</td>
                    <td>{s.wins}</td>
                    <td>{s.losses}</td>
                    <td className="group-points">{s.points}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="group-matches">
            {group.matches.map((m, i) => {
              const isNext = nextMatch === m;
              return (
                <div key={i} className={`group-match-row ${isNext ? 'group-match-next' : ''} ${m.winnerId ? 'group-match-done' : ''}`}>
                  <span className={m.winnerId === m.pokemonA.id ? 'group-match-winner' : ''}>{m.pokemonA.name}</span>
                  <span className="group-match-vs">vs</span>
                  <span className={m.winnerId === m.pokemonB.id ? 'group-match-winner' : ''}>{m.pokemonB.name}</span>
                  {m.winnerId && <span className="group-match-result">W: {m.winnerId === m.pokemonA.id ? m.pokemonA.name : m.pokemonB.name}</span>}
                  {isNext && <span className="group-match-badge">NEXT</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
