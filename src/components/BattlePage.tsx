import { useState, useRef, useEffect } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn } from '../battle/battleEngine';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
import { applyEloResult } from '../utils/eloCalc';
import { getPokemonPersisted, setPokemonPersisted, getBattleSelection, setBattleSelection } from '../persistence/userStorage';
import BattlerPanel from './BattlerPanel';
import LogEntry from './LogEntry';
import { formatPokemonName } from '../utils/formatName';
import './BattlePage.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

type Phase = 'select' | 'battle' | 'end';

export default function BattlePage({ allPokemon, onBack }: Props) {
  const enabled = allPokemon.filter(p => !getPokemonPersisted(p.id).disabled);
  const [phase, setPhase] = useState<Phase>('select');
  const [selA, setSelA] = useState(() => {
    const saved = getBattleSelection();
    return saved && enabled.some(p => p.id === saved.idA) ? saved.idA : (enabled[0]?.id ?? 0);
  });
  const [selB, setSelB] = useState(() => {
    const saved = getBattleSelection();
    return saved && enabled.some(p => p.id === saved.idB) ? saved.idB : (enabled[1]?.id ?? 0);
  });
  const [p1, setP1] = useState<BattlePokemon | null>(null);
  const [p2, setP2] = useState<BattlePokemon | null>(null);
  const [log, setLog] = useState<TurnEvent[]>([]);
  const [turn, setTurn] = useState(1);
  const [battleOver, setBattleOver] = useState(false);
  const [eloMsg, setEloMsg] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function startBattle() {
    const dataA = allPokemon.find(p => p.id === selA);
    const dataB = allPokemon.find(p => p.id === selB);
    if (!dataA || !dataB || selA === selB) return;
    setBattleSelection(selA, selB);
    setP1(buildBattlePokemon(dataA));
    setP2(buildBattlePokemon(dataB));
    setLog([]);
    setTurn(1);
    setBattleOver(false);
    setEloMsg([]);
    setPhase('battle');
  }

  function nextTurn() {
    if (!p1 || !p2 || battleOver) return;
    const { events, p1After, p2After, battleOver: over, lastAttackerIsP1 } = resolveTurn(p1, p2, turn, expectiminimaxAI, expectiminimaxAI);
    setLog(prev => [...prev, ...events]);
    setP1(p1After);
    setP2(p2After);
    setTurn(t => t + 1);
    if (over) {
      setBattleOver(true);
      setPhase('end');
      // Determine winner/loser — if both fainted (recoil), defender wins
      let winner: typeof p1After, loser: typeof p1After;
      if (p1After.currentHp > 0) {
        winner = p1After; loser = p2After;
      } else if (p2After.currentHp > 0) {
        winner = p2After; loser = p1After;
      } else {
        const attackerIsP1 = lastAttackerIsP1 === true;
        winner = attackerIsP1 ? p1After : p2After;
        loser = attackerIsP1 ? p2After : p1After;
      }
      const wP = getPokemonPersisted(winner.data.id);
      const lP = getPokemonPersisted(loser.data.id);
      const { newWinnerElo, newLoserElo } = applyEloResult(wP.elo, lP.elo);
      setPokemonPersisted({ ...wP, elo: newWinnerElo, wins: wP.wins + 1 });
      setPokemonPersisted({ ...lP, elo: newLoserElo, losses: lP.losses + 1 });
      setEloMsg([
        `${formatPokemonName(winner.data.name)}: ${wP.elo} → ${newWinnerElo} (+${newWinnerElo - wP.elo})`,
        `${formatPokemonName(loser.data.name)}: ${lP.elo} → ${newLoserElo} (${newLoserElo - lP.elo})`,
      ]);
    }
  }

  function rematch() {
    if (!p1 || !p2) return;
    const dataA = allPokemon.find(p => p.id === p1.data.id);
    const dataB = allPokemon.find(p => p.id === p2.data.id);
    if (!dataA || !dataB) return;
    setP1(buildBattlePokemon(dataA));
    setP2(buildBattlePokemon(dataB));
    setLog([]);
    setTurn(1);
    setBattleOver(false);
    setEloMsg([]);
    setPhase('battle');
  }

  if (phase === 'select') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">Single Battle</h1>
        <div className="battle-select card">
          <div className="battle-select-pickers">
            <div className="picker-col">
              <label className="picker-label">Pokemon A</label>
              <select value={selA} onChange={e => setSelA(Number(e.target.value))}>
                {enabled.map(p => (
                  <option key={p.id} value={p.id}>#{p.id} {formatPokemonName(p.name)}</option>
                ))}
              </select>
            </div>
            <div className="vs-label">VS</div>
            <div className="picker-col">
              <label className="picker-label">Pokemon B</label>
              <select value={selB} onChange={e => setSelB(Number(e.target.value))}>
                {enabled.map(p => (
                  <option key={p.id} value={p.id}>#{p.id} {formatPokemonName(p.name)}</option>
                ))}
              </select>
            </div>
          </div>
          {selA === selB && <p style={{ color: '#f44336', marginTop: '0.75rem', textAlign: 'center' }}>Choose two different Pokemon.</p>}
          <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}
            onClick={startBattle} disabled={selA === selB || enabled.length < 2}>
            Start Battle
          </button>
        </div>
      </div>
    );
  }

  if (!p1 || !p2) return null;

  const winner = phase === 'end' ? (p1.currentHp > 0 ? p1 : p2) : null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Battle!</h1>

      <div className="battle-arena">
        <BattlerPanel pokemon={p1} />
        <div className="arena-vs">VS</div>
        <BattlerPanel pokemon={p2} />
      </div>

      {phase === 'end' && winner && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>🏆 {formatPokemonName(winner.data.name)} wins!</h2>
          {eloMsg.map((msg, i) => <p key={i} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{msg}</p>)}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={rematch}>Rematch</button>
            <button className="btn-secondary" onClick={() => setPhase('select')}>New Battle</button>
            <button className="btn-secondary" onClick={onBack}>Back to Menu</button>
          </div>
        </div>
      )}

      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn}>Next Turn →</button>
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

