import type { KnockoutMatch, TournamentPokemon } from '../models/types';
import { formatPokemonName } from '../utils/formatName';
import { getPokemonPersisted } from '../persistence/userStorage';

interface Props {
  matches: KnockoutMatch[];
  nextMatch: KnockoutMatch | null;
}

function BracketSlot({ pokemon, isWinner }: { pokemon: TournamentPokemon | null; isWinner: boolean }) {
  if (!pokemon) {
    return <div className="bracket-entry bracket-tbd">TBD</div>;
  }
  const elo = Math.round(getPokemonPersisted(pokemon.id).elo);
  return (
    <div className={`bracket-entry ${isWinner ? 'bracket-winner' : ''}`}>
      <img src={pokemon.spriteUrl} alt={pokemon.name} className="bracket-sprite" />
      <span>{formatPokemonName(pokemon.name)}</span>
      <span className="bracket-elo">{elo}</span>
    </div>
  );
}

function MatchCard({ match, isNext }: { match: KnockoutMatch; isNext: boolean }) {
  return (
    <div className={`bracket-match ${isNext ? 'bracket-match-next' : ''}`}>
      <BracketSlot pokemon={match.pokemonA} isWinner={match.winnerId === match.pokemonA?.id && match.winnerId !== null} />
      <BracketSlot pokemon={match.pokemonB} isWinner={match.winnerId === match.pokemonB?.id && match.winnerId !== null} />
      {isNext && <span className="bracket-next-badge">NEXT</span>}
    </div>
  );
}

export default function TournamentBracketView({ matches, nextMatch }: Props) {
  const byRound = (round: KnockoutMatch['round']) =>
    matches.filter(m => m.round === round).sort((a, b) => a.slot - b.slot);

  const ro16 = byRound('ro16');
  const quarter = byRound('quarter');
  const semi = byRound('semi');
  const final = byRound('final');
  const third = byRound('third');

  const leftRo16 = ro16.slice(0, 4);
  const rightRo16 = ro16.slice(4, 8);
  const leftQf = quarter.slice(0, 2);
  const rightQf = quarter.slice(2, 4);

  const isNext = (m: KnockoutMatch) => nextMatch?.round === m.round && nextMatch?.slot === m.slot;

  return (
    <div className="tournament-bracket">
      <div className="bracket-grid">
        <div className="bracket-column bracket-col-ro16">
          <h4 className="bracket-round-label">Round of 16</h4>
          {leftRo16.map(m => <MatchCard key={`ro16-${m.slot}`} match={m} isNext={isNext(m)} />)}
        </div>
        <div className="bracket-column bracket-col-qf">
          <h4 className="bracket-round-label">Quarterfinals</h4>
          {leftQf.map(m => <MatchCard key={`qf-${m.slot}`} match={m} isNext={isNext(m)} />)}
        </div>
        <div className="bracket-column bracket-col-sf-final">
          <h4 className="bracket-round-label">Semifinals</h4>
          <MatchCard match={semi[0]} isNext={isNext(semi[0])} />
          <div className="bracket-final-section">
            <h4 className="bracket-round-label">Final</h4>
            <MatchCard match={final[0]} isNext={isNext(final[0])} />
          </div>
          <MatchCard match={semi[1]} isNext={isNext(semi[1])} />
        </div>
        <div className="bracket-column bracket-col-qf">
          <h4 className="bracket-round-label">Quarterfinals</h4>
          {rightQf.map(m => <MatchCard key={`qf-${m.slot}`} match={m} isNext={isNext(m)} />)}
        </div>
        <div className="bracket-column bracket-col-ro16">
          <h4 className="bracket-round-label">Round of 16</h4>
          {rightRo16.map(m => <MatchCard key={`ro16-${m.slot}`} match={m} isNext={isNext(m)} />)}
        </div>
      </div>
      {third.length > 0 && (
        <div className="bracket-third-place">
          <h4 className="bracket-round-label">Third Place Match</h4>
          <MatchCard match={third[0]} isNext={isNext(third[0])} />
        </div>
      )}
    </div>
  );
}
