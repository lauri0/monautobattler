import { useState, useRef, useEffect, useMemo } from 'react';
import type {
  PokemonData,
  TeamBattleState,
  TeamTurnEvent,
  SideIndex,
  TeamSlotIndex,
  TeamAction,
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
import TypeBadge from './TypeBadge';
import LogEntry from './LogEntry';
import { formatPokemonName } from '../utils/formatName';
import { getTypeColor } from '../utils/typeColors';
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
  const [mode, setMode] = useState<'spectate' | 'play'>('spectate');
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

  function startBattle(newMode: 'spectate' | 'play') {
    if (!canStart) return;
    const initial = buildTeamBattleState(team0Ids, team1Ids, allPokemon);
    setState(initial);
    setLog([]);
    setMode(newMode);
    setPhase('battle');
  }

  function swapTeams() {
    const t = team0Ids;
    setTeam0Ids(team1Ids);
    setTeam1Ids(t);
  }

  function randomizeTeam(side: SideIndex) {
    if (enabled.length < 3) return;
    const shuffled = [...enabled];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ids: TeamIds = [shuffled[0].id, shuffled[1].id, shuffled[2].id];
    (side === 0 ? setTeam0Ids : setTeam1Ids)(ids);
  }

  function nextTurn() {
    if (!state || thinking) return;
    if (battleWinner(state) !== null) return;
    setThinking(true);
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

  function submitPlayerAction(a0: TeamAction) {
    if (!state || thinking) return;
    if (battleWinner(state) !== null) return;
    setThinking(true);
    setTimeout(() => {
      let cur = state;
      const newEvents: TeamTurnEvent[] = [];
      const a1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
      const step = applyActions(cur, a0, a1);
      newEvents.push(...step.events);
      cur = step.next;
      // Auto-advance any turns where only the AI needs to act.
      while (battleWinner(cur) === null && legalActions(cur, 0).length === 0) {
        const ai1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
        const step2 = applyActions(cur, null, ai1);
        newEvents.push(...step2.events);
        cur = step2.next;
      }
      setLog(prev => [...prev, ...newEvents]);
      setState(cur);
      if (battleWinner(cur) !== null) setPhase('end');
      setThinking(false);
    }, 0);
  }

  function rematch() {
    startBattle(mode);
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
            onRandomize={() => randomizeTeam(0)}
          />
          <TeamBuilder
            label="Team 2"
            ids={team1Ids}
            enabled={enabled}
            allPokemon={allPokemon}
            valid={team1Valid}
            onChange={(slot, id) => setSlot(1, slot, id)}
            onRandomize={() => randomizeTeam(1)}
          />
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button className="btn-secondary" onClick={swapTeams}>⇄ Swap Teams</button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn-primary" onClick={() => startBattle('play')} disabled={!canStart}>
            Play Battle
          </button>
          <button className="btn-secondary" onClick={() => startBattle('spectate')} disabled={!canStart}>
            Spectate Battle
          </button>
        </div>
        {!canStart && enabled.length < 3 && (
          <p style={{ color: '#f44336', marginTop: '0.75rem', textAlign: 'center' }}>Need at least 3 enabled Pokemon.</p>
        )}
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
        <TeamView
          state={state}
          side={0}
          onSwitch={mode === 'play' && phase === 'battle' && !thinking
            ? (slot) => submitPlayerAction({ kind: 'switch', targetIdx: slot })
            : undefined}
        />
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

      {phase === 'battle' && mode === 'spectate' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={thinking}>
            {thinking ? 'Thinking…' : 'Next Turn →'}
          </button>
        </div>
      )}

      {phase === 'battle' && mode === 'play' && (
        <PlayerActionBar
          state={state}
          thinking={thinking}
          onAction={submitPlayerAction}
        />
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
  onRandomize: () => void;
}

function TeamBuilder({ label, ids, enabled, allPokemon, valid, onChange, onRandomize }: TeamBuilderProps) {
  return (
    <div className="team-builder card">
      <div className="team-builder-header">
        <h3 className="section-title">{label}</h3>
        <button className="btn-secondary btn-small" onClick={onRandomize} disabled={enabled.length < 3}>
          🎲 Randomize
        </button>
      </div>
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

function TeamView({
  state,
  side,
  onSwitch,
}: {
  state: TeamBattleState;
  side: SideIndex;
  onSwitch?: (slot: TeamSlotIndex) => void;
}) {
  const team = state.teams[side];
  const switchableSlots = new Set<TeamSlotIndex>();
  if (onSwitch) {
    for (const a of legalActions(state, side)) {
      if (a.kind === 'switch') switchableSlots.add(a.targetIdx);
    }
  }
  const order = team.pokemon
    .map((_, idx) => idx)
    .sort((a, b) => (a === team.activeIdx ? -1 : b === team.activeIdx ? 1 : a - b));
  return (
    <div className="team-view">
      {order.map(i => {
        const p = team.pokemon[i];
        const isActive = i === team.activeIdx;
        const fainted = p.currentHp <= 0;
        const canSwitchHere = switchableSlots.has(i as TeamSlotIndex);
        return (
          <div
            key={i}
            className={
              'team-slot-view ' +
              (isActive ? `team-slot-active team-slot-active-${side} ` : '') +
              (fainted ? 'team-slot-fainted' : '')
            }
          >
            {isActive ? (
              <>
                <BattlerPanel pokemon={p} />
                <BaseStatsPanel data={p.data} />
              </>
            ) : (
              <div className="team-bench-mini">
                <img src={p.data.spriteUrl} alt={p.data.name} />
                <div className="bench-name-wrap">
                  <div className="bench-name">{formatPokemonName(p.data.name)}</div>
                  <div className="bench-types">
                    {p.data.types.map(t => <TypeBadge key={t} type={t} />)}
                  </div>
                </div>
                <div className="bench-hp">{Math.max(0, p.currentHp)}/{p.level50Stats.hp}</div>
                {canSwitchHere && onSwitch && (
                  <button
                    className="btn-bench-switch"
                    onClick={() => onSwitch(i as TeamSlotIndex)}
                  >
                    Switch in
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Base stats panel ────────────────────────────────────────────────────────

const STAT_ROWS: { key: keyof PokemonData['baseStats']; label: string }[] = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Atk' },
  { key: 'defense', label: 'Def' },
  { key: 'specialAttack', label: 'SpA' },
  { key: 'specialDefense', label: 'SpD' },
  { key: 'speed', label: 'Spe' },
];

function BaseStatsPanel({ data }: { data: PokemonData }) {
  const bst = STAT_ROWS.reduce((s, r) => s + data.baseStats[r.key], 0);
  return (
    <div className="base-stats-panel">
      <div className="base-stats-title">Base Stats</div>
      {STAT_ROWS.map(r => {
        const v = data.baseStats[r.key];
        const pct = Math.min(100, (v / 255) * 100);
        const color =
          pct > 70 ? '#8b00ff'
          : pct > 60 ? '#0055ff'
          : pct > 50 ? '#00bcd4'
          : pct > 40 ? '#27ae60'
          : pct > 30 ? '#f1c40f'
          : pct > 20 ? '#FD7D12'
          : '#e74c3c';
        return (
          <div key={r.key} className="base-stat-row">
            <span className="base-stat-label">{r.label}</span>
            <span className="base-stat-value">{v}</span>
            <span className="base-stat-bar"><span style={{ width: `${pct}%`, background: color }} /></span>
          </div>
        );
      })}
      <div className="base-stat-row base-stat-total">
        <span className="base-stat-label">BST</span>
        <span className="base-stat-value">{bst}</span>
        <span />
      </div>
    </div>
  );
}

// ── Player action bar ───────────────────────────────────────────────────────

interface PlayerActionBarProps {
  state: TeamBattleState;
  thinking: boolean;
  onAction: (a: TeamAction) => void;
}

function PlayerActionBar({ state, thinking, onAction }: PlayerActionBarProps) {
  const actions = legalActions(state, 0);
  const team = state.teams[0];
  const active = team.pokemon[team.activeIdx];
  const moves = actions.filter(a => a.kind === 'move');
  const forcedReplace = state.phase === 'replace0' || state.phase === 'replaceBoth';

  if (moves.length === 0 && !forcedReplace && !thinking) return null;

  return (
    <div className="player-action-bar card">
      <div className="action-label">
        {forcedReplace
          ? `${formatPokemonName(active.data.name)} fainted — pick a replacement from the bench.`
          : `Your move — ${formatPokemonName(active.data.name)}`}
      </div>
      {moves.length > 0 && (
        <div className="action-row">
          {moves.map((a, i) => {
            if (a.kind !== 'move') return null;
            const color = getTypeColor(a.move.type);
            return (
              <button
                key={i}
                className="btn-move"
                disabled={thinking}
                onClick={() => onAction(a)}
                style={{ background: color, borderColor: color, color: '#fff' }}
              >
                {a.move.name}
              </button>
            );
          })}
        </div>
      )}
      {thinking && <div className="action-thinking">Opponent thinking…</div>}
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
