import { useState } from 'react';
import type { PokemonData, TournamentState, GroupMatch, KnockoutMatch } from '../models/types';
import { createTournament, getNextMatch, getMatchLabel, getProgress, applyMatchResult } from '../tournament/tournamentEngine';
import { saveTournament, loadTournament, clearTournament } from '../tournament/tournamentStorage';
import { getPokemonPersisted } from '../persistence/userStorage';
import TournamentGroupView from './TournamentGroupView';
import TournamentBracketView from './TournamentBracketView';
import TournamentMatchView from './TournamentMatchView';
import './TournamentPage.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

type Phase = 'setup' | 'overview' | 'battle' | 'finished';

export default function TournamentPage({ allPokemon, onBack }: Props) {
  const [tournament, setTournament] = useState<TournamentState | null>(() => loadTournament());
  const [phase, setPhase] = useState<Phase>(() => {
    const saved = loadTournament();
    if (!saved) return 'setup';
    if (saved.phase === 'finished') return 'finished';
    return 'overview';
  });
  const [error, setError] = useState<string | null>(null);

  const enabledCount = allPokemon.filter(p => {
    const persisted = getPokemonPersisted(p.id);
    return !persisted.disabled && p.availableMoves.length > 0;
  }).length;

  function startNewTournament() {
    try {
      const t = createTournament(allPokemon);
      setTournament(t);
      saveTournament(t);
      setPhase('overview');
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create tournament');
    }
  }

  function resumeTournament() {
    const saved = loadTournament();
    if (saved) {
      setTournament(saved);
      setPhase(saved.phase === 'finished' ? 'finished' : 'overview');
    }
  }

  function handleMatchComplete(winnerId: number) {
    if (!tournament) return;
    const updated = applyMatchResult(tournament, winnerId);
    setTournament(updated);
    saveTournament(updated);
    setPhase(updated.phase === 'finished' ? 'finished' : 'overview');
  }

  function handleNewTournament() {
    clearTournament();
    setTournament(null);
    setPhase('setup');
    setError(null);
  }

  if (phase === 'setup') {
    const hasSaved = loadTournament() !== null;
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">Tournament</h1>
        <div className="tournament-setup card">
          <p className="tournament-desc">
            32 Pokemon compete in a FIFA-style tournament: 8 groups of 4 (round-robin),
            then a 16-team knockout bracket through to the final.
          </p>
          <p className="tournament-requirement">
            Enabled Pokemon with moves: <strong>{enabledCount}</strong> / 32 required
          </p>
          {error && <p className="tournament-error">{error}</p>}
          <div className="tournament-setup-buttons">
            <button
              className="btn-primary"
              onClick={startNewTournament}
              disabled={enabledCount < 32}
            >
              New Tournament
            </button>
            {hasSaved && (
              <button className="btn-secondary" onClick={resumeTournament}>
                Resume Tournament
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'battle' && tournament) {
    const next = getNextMatch(tournament);
    if (!next) {
      setPhase('overview');
      return null;
    }
    const m = next.match;
    const pokemonA = 'round' in m ? m.pokemonA : m.pokemonA;
    const pokemonB = 'round' in m ? m.pokemonB : m.pokemonB;
    if (!pokemonA || !pokemonB) {
      setPhase('overview');
      return null;
    }
    const dataA = allPokemon.find(p => p.id === pokemonA.id);
    const dataB = allPokemon.find(p => p.id === pokemonB.id);
    if (!dataA || !dataB) return null;

    return (
      <TournamentMatchView
        key={`${pokemonA.id}-${pokemonB.id}-${getMatchLabel(tournament)}`}
        pokemonAData={dataA}
        pokemonBData={dataB}
        matchLabel={getMatchLabel(tournament)}
        onMatchComplete={handleMatchComplete}
      />
    );
  }

  if (phase === 'finished' && tournament) {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">Tournament Complete!</h1>
        <div className="tournament-podium card">
          <div className="podium-place podium-first">
            <div className="podium-medal">1st</div>
            {tournament.champion && (
              <>
                <img src={tournament.champion.spriteUrl} alt={tournament.champion.name} className="podium-sprite" />
                <div className="podium-name">{tournament.champion.name}</div>
              </>
            )}
          </div>
          <div className="podium-place podium-second">
            <div className="podium-medal">2nd</div>
            {tournament.runnerUp && (
              <>
                <img src={tournament.runnerUp.spriteUrl} alt={tournament.runnerUp.name} className="podium-sprite" />
                <div className="podium-name">{tournament.runnerUp.name}</div>
              </>
            )}
          </div>
          <div className="podium-place podium-third">
            <div className="podium-medal">3rd</div>
            {tournament.thirdPlace && (
              <>
                <img src={tournament.thirdPlace.spriteUrl} alt={tournament.thirdPlace.name} className="podium-sprite" />
                <div className="podium-name">{tournament.thirdPlace.name}</div>
              </>
            )}
          </div>
        </div>

        <h2 className="section-title" style={{ marginTop: '2rem', marginBottom: '1rem' }}>Final Bracket</h2>
        <TournamentBracketView matches={tournament.knockoutMatches} nextMatch={null} />

        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn-primary" onClick={handleNewTournament}>New Tournament</button>
        </div>
      </div>
    );
  }

  if (phase === 'overview' && tournament) {
    const next = getNextMatch(tournament);
    const progress = getProgress(tournament);
    const nextMatch = next?.match ?? null;
    const label = getMatchLabel(tournament);

    const nextPokemonA = nextMatch ? ('round' in nextMatch ? nextMatch.pokemonA : nextMatch.pokemonA) : null;
    const nextPokemonB = nextMatch ? ('round' in nextMatch ? nextMatch.pokemonB : nextMatch.pokemonB) : null;

    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">Tournament</h1>

        <div className="tournament-progress card">
          <div className="progress-info">
            <span className="progress-stage">{progress.stage}</span>
            <span className="progress-count">Match {progress.played + 1} of {progress.total}</span>
          </div>
          {nextMatch && nextPokemonA && nextPokemonB && (
            <div className="next-match-preview">
              <span className="next-match-label">{label}:</span>
              <div className="next-match-pokemon">
                <img src={nextPokemonA.spriteUrl} alt={nextPokemonA.name} className="next-match-sprite" />
                <span>{nextPokemonA.name}</span>
                <span className="next-match-vs">vs</span>
                <img src={nextPokemonB.spriteUrl} alt={nextPokemonB.name} className="next-match-sprite" />
                <span>{nextPokemonB.name}</span>
              </div>
              <button className="btn-primary" onClick={() => setPhase('battle')}>
                Start Match
              </button>
            </div>
          )}
        </div>

        {tournament.phase === 'group' && (
          <TournamentGroupView
            groups={tournament.groups}
            nextMatch={nextMatch && !('round' in nextMatch) ? nextMatch as GroupMatch : null}
          />
        )}

        {tournament.phase === 'knockout' && (
          <TournamentBracketView
            matches={tournament.knockoutMatches}
            nextMatch={nextMatch && 'round' in nextMatch ? nextMatch as KnockoutMatch : null}
          />
        )}
      </div>
    );
  }

  return null;
}
