import { useState, useRef, useEffect, useCallback } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent, FieldState } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn, applyInitialSwitchIns, makeInitialField } from '../battle/battleEngine';
import { applyEventToState } from '../battle/applyEventToState';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
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
  const [field, setField] = useState<FieldState>(() => makeInitialField());
  const [displayedP1, setDisplayedP1] = useState<BattlePokemon | null>(null);
  const [displayedP2, setDisplayedP2] = useState<BattlePokemon | null>(null);
  const [displayedField, setDisplayedField] = useState<FieldState>(() => makeInitialField());
  const [log, setLog] = useState<TurnEvent[]>([]);
  const [playbackQueue, setPlaybackQueue] = useState<TurnEvent[]>([]);
  const [fastMode, setFastMode] = useState(false);
  const [turn, setTurn] = useState(1);
  const [battleOver, setBattleOver] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const isPlaying = playbackQueue.length > 0;
  const toggleFastMode = useCallback(() => setFastMode(f => !f), []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  useEffect(() => {
    if (playbackQueue.length === 0 || !displayedP1 || !displayedP2) return;
    const delay = fastMode ? 0 : 750;
    const timer = setTimeout(() => {
      const [event, ...rest] = playbackQueue;
      const next = applyEventToState(displayedP1, displayedP2, displayedField, event);
      setDisplayedP1(next.p1);
      setDisplayedP2(next.p2);
      setDisplayedField(next.field);
      setLog(prev => [...prev, event]);
      setPlaybackQueue(rest);
    }, delay);
    return () => clearTimeout(timer);
  }, [playbackQueue, fastMode, displayedP1, displayedP2, displayedField]);

  function startBattle() {
    const dataA = allPokemon.find(p => p.id === selA);
    const dataB = allPokemon.find(p => p.id === selB);
    if (!dataA || !dataB || selA === selB) return;
    setBattleSelection(selA, selB);
    const init = applyInitialSwitchIns(buildBattlePokemon(dataA), buildBattlePokemon(dataB));
    setP1(init.p1);
    setP2(init.p2);
    setField(init.field);
    setDisplayedP1(init.p1);
    setDisplayedP2(init.p2);
    setDisplayedField(init.field);
    setLog(init.events);
    setPlaybackQueue([]);
    setTurn(1);
    setBattleOver(false);
    setPhase('battle');
  }

  function nextTurn() {
    if (!p1 || !p2 || battleOver || isPlaying) return;
    const result = resolveTurn(p1, p2, turn, expectiminimaxAI, expectiminimaxAI, field);
    const { events, p1After, p2After, battleOver: over, lastAttackerIsP1 } = result;
    setP1(p1After);
    setP2(p2After);
    setField(result.field);
    setPlaybackQueue(events);
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
      setPokemonPersisted({ ...wP, wins: wP.wins + 1 });
      setPokemonPersisted({ ...lP, losses: lP.losses + 1 });
    }
  }

  function rematch() {
    if (!p1 || !p2) return;
    const dataA = allPokemon.find(p => p.id === p1.data.id);
    const dataB = allPokemon.find(p => p.id === p2.data.id);
    if (!dataA || !dataB) return;
    const init = applyInitialSwitchIns(buildBattlePokemon(dataA), buildBattlePokemon(dataB));
    setP1(init.p1);
    setP2(init.p2);
    setField(init.field);
    setDisplayedP1(init.p1);
    setDisplayedP2(init.p2);
    setDisplayedField(init.field);
    setLog(init.events);
    setPlaybackQueue([]);
    setTurn(1);
    setBattleOver(false);
    setPhase('battle');
  }

  if (phase === 'select') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">1v1 Battle</h1>
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

  if (!p1 || !p2 || !displayedP1 || !displayedP2) return null;

  const winner = phase === 'end' ? (p1.currentHp > 0 ? p1 : p2) : null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Battle!</h1>

      <div className="battle-arena">
        <BattlerPanel pokemon={displayedP1} />
        <div className="arena-vs">VS</div>
        <BattlerPanel pokemon={displayedP2} />
      </div>

      {phase === 'end' && !isPlaying && winner && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>🏆 {formatPokemonName(winner.data.name)} wins!</h2>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={rematch}>Rematch</button>
            <button className="btn-secondary" onClick={() => setPhase('select')}>New Battle</button>
            <button className="btn-secondary" onClick={onBack}>Back to Menu</button>
          </div>
        </div>
      )}

      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={isPlaying}>
            {isPlaying ? 'Playing…' : 'Next Turn →'}
          </button>
        </div>
      )}

      <div className="card battle-log" ref={logRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Battle Log</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ color: !fastMode ? 'var(--text)' : 'var(--text-muted)' }}>Slow</span>
            <span
              onClick={toggleFastMode}
              style={{
                display: 'inline-block', width: '2rem', height: '1rem',
                background: fastMode ? 'var(--accent)' : 'var(--bg-card-alt, #2a3a2a)',
                borderRadius: '0.5rem', position: 'relative', cursor: 'pointer',
                border: '1px solid var(--border)',
              }}
            >
              <span style={{
                display: 'block', width: '0.75rem', height: '0.75rem',
                background: 'var(--text)', borderRadius: '50%',
                position: 'absolute', top: '0.1rem',
                left: fastMode ? '1.1rem' : '0.1rem',
                transition: 'left 0.15s',
              }} />
            </span>
            <span style={{ color: fastMode ? 'var(--text)' : 'var(--text-muted)' }}>Fast</span>
          </label>
        </div>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Press "Next Turn" to start.</p>}
        {log.map((ev, i) => (
          <LogEntry key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}

