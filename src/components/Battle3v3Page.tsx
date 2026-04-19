import { useState, useRef, useEffect, useMemo } from 'react';
import type {
  PokemonData,
  TeamBattleState,
  TeamTurnEvent,
  SideIndex,
  TeamSlotIndex,
} from '../models/types';
import {
  buildTeamBattleState,
  applyActions,
  battleWinner,
  legalActions,
} from '../battle/teamBattleEngine';
import { mctsTeamAI } from '../ai/mctsTeamAI';
import {
  getPokemonPersisted,
  getTeam3v3Selection,
  setTeam3v3Selection,
} from '../persistence/userStorage';
import BattlerPanel from './BattlerPanel';
import LogEntry from './LogEntry';
import { formatPokemonName } from '../utils/formatName';
import './Battle3v3Page.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

type Phase = 'select' | 'battle' | 'end';

type TeamIds = [number, number, number];

function pickDefault(enabled: PokemonData[], offset: number): TeamIds {
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) {
    const p = enabled[(offset + i) % Math.max(1, enabled.length)];
    ids.push(p?.id ?? 0);
  }
  return [ids[0], ids[1], ids[2]];
}

function teamIsValid(ids: TeamIds, enabled: PokemonData[]): boolean {
  if (ids.some(id => !enabled.some(p => p.id === id))) return false;
  return new Set(ids).size === 3;
}

export default function Battle3v3Page({ allPokemon, onBack }: Props) {
  const enabled = useMemo(
    () => allPokemon.filter(p => !getPokemonPersisted(p.id).disabled),
    [allPokemon],
  );

  const [team0Ids, setTeam0Ids] = useState<TeamIds>(() => {
    const saved = getTeam3v3Selection();
    if (saved && teamIsValid(saved.team0, enabled)) return saved.team0;
    return pickDefault(enabled, 0);
  });
  const [team1Ids, setTeam1Ids] = useState<TeamIds>(() => {
    const saved = getTeam3v3Selection();
    if (saved && teamIsValid(saved.team1, enabled)) return saved.team1;
    return pickDefault(enabled, 3);
  });

  const [phase, setPhase] = useState<Phase>('select');
  const [state, setState] = useState<TeamBattleState | null>(null);
  const [log, setLog] = useState<TeamTurnEvent[]>([]);
  const [thinking, setThinking] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTeam3v3Selection({ team0: team0Ids, team1: team1Ids });
  }, [team0Ids, team1Ids]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function setSlot(side: SideIndex, slot: TeamSlotIndex, id: number) {
    const setter = side === 0 ? setTeam0Ids : setTeam1Ids;
    const current = side === 0 ? team0Ids : team1Ids;
    const next: TeamIds = [...current] as TeamIds;
    next[slot] = id;
    setter(next);
  }

  const team0Valid = teamIsValid(team0Ids, enabled);
  const team1Valid = teamIsValid(team1Ids, enabled);
  const canStart = team0Valid && team1Valid && enabled.length >= 3;

  function startBattle() {
    if (!canStart) return;
    const initial = buildTeamBattleState(team0Ids, team1Ids, allPokemon);
    setState(initial);
    setLog([]);
    setPhase('battle');
  }

  function nextTurn() {
    if (!state || thinking) return;
    if (battleWinner(state) !== null) return;
    setThinking(true);
    // Defer to next frame so the "thinking" indicator renders.
    setTimeout(() => {
      const a0 = legalActions(state, 0).length > 0 ? mctsTeamAI.selectAction(state, 0) : null;
      const a1 = legalActions(state, 1).length > 0 ? mctsTeamAI.selectAction(state, 1) : null;
      const { next, events } = applyActions(state, a0, a1);
      setLog(prev => [...prev, ...events]);
      setState(next);
      if (battleWinner(next) !== null) setPhase('end');
      setThinking(false);
    }, 0);
  }

  function rematch() {
    startBattle();
  }

  if (phase === 'select') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">3v3 Battle</h1>
        <div className="team-builders">
          <TeamBuilder
            label="Team 1"
            ids={team0Ids}
            enabled={enabled}
            allPokemon={allPokemon}
            valid={team0Valid}
            onChange={(slot, id) => setSlot(0, slot, id)}
          />
          <TeamBuilder
            label="Team 2"
            ids={team1Ids}
            enabled={enabled}
            allPokemon={allPokemon}
            valid={team1Valid}
            onChange={(slot, id) => setSlot(1, slot, id)}
          />
        </div>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button className="btn-primary" onClick={startBattle} disabled={!canStart}>
            Start Battle
          </button>
          {!canStart && enabled.length < 3 && (
            <p style={{ color: '#f44336', marginTop: '0.75rem' }}>Need at least 3 enabled Pokemon.</p>
          )}
        </div>
      </div>
    );
  }

  if (!state) return null;

  const winner = battleWinner(state);

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">3v3 Battle</h1>

      <div className="team-arena">
        <TeamView state={state} side={0} />
        <div className="arena-vs">VS</div>
        <TeamView state={state} side={1} />
      </div>

      {phase === 'end' && winner !== null && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>🏆 Team {winner + 1} wins!</h2>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={rematch}>Rematch</button>
            <button className="btn-secondary" onClick={() => setPhase('select')}>New Battle</button>
            <button className="btn-secondary" onClick={onBack}>Back to Menu</button>
          </div>
        </div>
      )}

      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={thinking}>
            {thinking ? 'Thinking…' : 'Next Turn →'}
          </button>
        </div>
      )}

      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Press "Next Turn" to start.</p>}
        {log.map((ev, i) => renderEvent(ev, i))}
      </div>
    </div>
  );
}

// ── Team builder ────────────────────────────────────────────────────────────

interface TeamBuilderProps {
  label: string;
  ids: TeamIds;
  enabled: PokemonData[];
  allPokemon: PokemonData[];
  valid: boolean;
  onChange: (slot: TeamSlotIndex, id: number) => void;
}

function TeamBuilder({ label, ids, enabled, allPokemon, valid, onChange }: TeamBuilderProps) {
  return (
    <div className="team-builder card">
      <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>{label}</h3>
      {[0, 1, 2].map(slot => {
        const id = ids[slot];
        const data = allPokemon.find(p => p.id === id);
        const dup = ids.filter(x => x === id).length > 1;
        return (
          <div key={slot} className="team-slot">
            <div className="team-slot-preview">
              {data ? (
                <>
                  <img src={data.spriteUrl} alt={data.name} />
                  <span>{formatPokemonName(data.name)}</span>
                </>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
            <select
              value={id}
              onChange={e => onChange(slot as TeamSlotIndex, Number(e.target.value))}
              className={dup ? 'team-slot-dup' : ''}
            >
              {enabled.map(p => (
                <option key={p.id} value={p.id}>#{p.id} {formatPokemonName(p.name)}</option>
              ))}
            </select>
          </div>
        );
      })}
      {!valid && (
        <p style={{ color: '#f44336', fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Pick 3 different Pokemon.
        </p>
      )}
    </div>
  );
}

// ── Team view (battle) ──────────────────────────────────────────────────────

function TeamView({ state, side }: { state: TeamBattleState; side: SideIndex }) {
  const team = state.teams[side];
  return (
    <div className="team-view">
      {team.pokemon.map((p, i) => {
        const isActive = i === team.activeIdx;
        const fainted = p.currentHp <= 0;
        return (
          <div
            key={i}
            className={
              'team-slot-view ' +
              (isActive ? 'team-slot-active ' : '') +
              (fainted ? 'team-slot-fainted' : '')
            }
          >
            {isActive ? (
              <BattlerPanel pokemon={p} />
            ) : (
              <div className="team-bench-mini">
                <img src={p.data.spriteUrl} alt={p.data.name} />
                <div className="bench-name">{formatPokemonName(p.data.name)}</div>
                <div className="bench-hp">{Math.max(0, p.currentHp)}/{p.level50Stats.hp}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Log event rendering ─────────────────────────────────────────────────────

function renderEvent(ev: TeamTurnEvent, key: number) {
  if (ev.kind === 'switch') {
    return (
      <div key={key} className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">Team {ev.side + 1}</span>
        <span className="log-eff"> withdrew {formatPokemonName(ev.outName)} and sent in {formatPokemonName(ev.inName)}!</span>
      </div>
    );
  }
  return <LogEntry key={key} ev={ev} />;
}
