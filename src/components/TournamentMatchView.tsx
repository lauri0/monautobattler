import { useState, useRef, useEffect } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn, runFullBattle } from '../battle/battleEngine';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
import BattlerPanel from './BattlerPanel';
import LogEntry from './LogEntry';

interface Props {
  pokemonAData: PokemonData;
  pokemonBData: PokemonData;
  matchLabel: string;
  onMatchComplete: (winnerId: number) => void;
}

export default function TournamentMatchView({ pokemonAData, pokemonBData, matchLabel, onMatchComplete }: Props) {
  const [p1, setP1] = useState<BattlePokemon>(() => buildBattlePokemon(pokemonAData));
  const [p2, setP2] = useState<BattlePokemon>(() => buildBattlePokemon(pokemonBData));
  const [log, setLog] = useState<TurnEvent[]>([]);
  const [turn, setTurn] = useState(1);
  const [battleOver, setBattleOver] = useState(false);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function determineWinner(p1After: BattlePokemon, p2After: BattlePokemon, lastAttackerIsP1?: boolean): number {
    if (p1After.currentHp > 0) return p1After.data.id;
    if (p2After.currentHp > 0) return p2After.data.id;
    return lastAttackerIsP1 ? p1After.data.id : p2After.data.id;
  }

  function nextTurn() {
    if (battleOver) return;
    const result = resolveTurn(p1, p2, turn, expectiminimaxAI, expectiminimaxAI);
    setLog(prev => [...prev, ...result.events]);
    setP1(result.p1After);
    setP2(result.p2After);
    setTurn(t => t + 1);
    if (result.battleOver) {
      setBattleOver(true);
      setWinnerId(determineWinner(result.p1After, result.p2After, result.lastAttackerIsP1));
    }
  }

  function fastForward() {
    if (battleOver) return;
    const result = runFullBattle(p1, p2, expectiminimaxAI, expectiminimaxAI);
    setLog(prev => [...prev, ...result.log]);
    setP1(result.winner.data.id === p1.data.id ? result.winner : result.loser);
    setP2(result.winner.data.id === p2.data.id ? result.winner : result.loser);
    setBattleOver(true);
    setWinnerId(result.winner.data.id);
  }

  const winner = battleOver ? (p1.currentHp > 0 ? p1 : p2) : null;

  return (
    <div className="page">
      <h1 className="page-title">{matchLabel}</h1>

      <div className="battle-arena">
        <BattlerPanel pokemon={p1} />
        <div className="arena-vs">VS</div>
        <BattlerPanel pokemon={p2} />
      </div>

      {battleOver && winner && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>{winner.data.name} wins!</h2>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={() => onMatchComplete(winnerId!)}>
              Back to Tournament
            </button>
          </div>
        </div>
      )}

      {!battleOver && (
        <div style={{ textAlign: 'center', margin: '1rem 0', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={nextTurn}>Next Turn</button>
          <button className="btn-secondary" onClick={fastForward}>Fast Forward</button>
        </div>
      )}

      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Press "Next Turn" to start.</p>}
        {log.map((ev, i) => (
          <LogEntry key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}
