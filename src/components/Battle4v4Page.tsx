import { useState, useRef, useEffect, useMemo } from 'react';
import type {
  PokemonData,
  SideIndex,
  TeamSlotIndex,
} from '../models/types';
import { buildTeamBattleState, applyInitialSwitchInsTeam } from '../battle/teamBattleEngine';
import {
  getPokemonPersisted,
  getTeam4v4Selection,
  setTeam4v4Selection,
} from '../persistence/userStorage';
import TeamView from './TeamView';
import WeatherDisplay from './WeatherDisplay';
import TerrainDisplay from './TerrainDisplay';
import PlayerActionBar from './PlayerActionBar';
import FieldStateStrip from './FieldStateStrip';
import { renderTeamEvent } from './TeamEventLog';
import { useTeamBattleController } from './useTeamBattleController';
import { formatPokemonName } from '../utils/formatName';
import { parseDamageSummary, buildNameToIdMap } from '../battle/damageSummary';
import DamageSummaryBlock from './DamageSummaryBlock';
import './Battle4v4Page.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

type Phase = 'select' | 'battle';

type TeamIds = [number, number, number, number];

function pickDefault(enabled: PokemonData[], offset: number): TeamIds {
  const ids: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = enabled[(offset + i) % Math.max(1, enabled.length)];
    ids.push(p?.id ?? 0);
  }
  return [ids[0], ids[1], ids[2], ids[3]];
}

function teamIsValid(ids: TeamIds, enabled: PokemonData[]): boolean {
  if (ids.some(id => !enabled.some(p => p.id === id))) return false;
  return new Set(ids).size === 4;
}

export default function Battle4v4Page({ allPokemon, onBack }: Props) {
  const enabled = useMemo(
    () => allPokemon.filter(p => !getPokemonPersisted(p.id).disabled),
    [allPokemon],
  );

  const [team0Ids, setTeam0Ids] = useState<TeamIds>(() => {
    const saved = getTeam4v4Selection();
    if (saved && teamIsValid(saved.team0, enabled)) return saved.team0;
    return pickDefault(enabled, 0);
  });
  const [team1Ids, setTeam1Ids] = useState<TeamIds>(() => {
    const saved = getTeam4v4Selection();
    if (saved && teamIsValid(saved.team1, enabled)) return saved.team1;
    return pickDefault(enabled, 4);
  });

  const [phase, setPhase] = useState<Phase>('select');
  const [mode, setMode] = useState<'spectate' | 'play'>('spectate');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTeam4v4Selection({ team0: team0Ids, team1: team1Ids });
  }, [team0Ids, team1Ids]);

  const [initialState, setInitialState] = useState(() =>
    applyInitialSwitchInsTeam(buildTeamBattleState(team0Ids, team1Ids, allPokemon)),
  );
  const {
    state,
    displayedState,
    log,
    thinking,
    winner,
    done,
    isPlaying,
    fastMode,
    toggleFastMode,
    nextTurn,
    submitPlayerAction,
    reset,
  } = useTeamBattleController(initialState.state, initialState.events);

  const damageSummary = useMemo(() => {
    if (!done) return null;
    const nameToId = buildNameToIdMap(initialState.state);
    return parseDamageSummary(log, nameToId);
  }, [done, log, initialState.state]);

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
  const canStart = team0Valid && team1Valid && enabled.length >= 4;

  function startBattle(newMode: 'spectate' | 'play') {
    if (!canStart) return;
    const init = applyInitialSwitchInsTeam(buildTeamBattleState(team0Ids, team1Ids, allPokemon));
    setInitialState(init);
    reset(init.state, init.events);
    setMode(newMode);
    setPhase('battle');
  }

  function swapTeams() {
    const t = team0Ids;
    setTeam0Ids(team1Ids);
    setTeam1Ids(t);
  }

  function randomizeTeam(side: SideIndex) {
    if (enabled.length < 4) return;
    const shuffled = [...enabled];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const ids: TeamIds = [shuffled[0].id, shuffled[1].id, shuffled[2].id, shuffled[3].id];
    (side === 0 ? setTeam0Ids : setTeam1Ids)(ids);
  }

  function rematch() {
    startBattle(mode);
  }

  if (phase === 'select') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">4v4 Battle</h1>
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
        {!canStart && enabled.length < 4 && (
          <p style={{ color: '#f44336', marginTop: '0.75rem', textAlign: 'center' }}>Need at least 4 enabled Pokemon.</p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">4v4 Battle</h1>

      <div className="team-arena">
        <TeamView
          state={displayedState}
          side={0}
          onSwitch={mode === 'play' && phase === 'battle' && !thinking && !isPlaying
            ? (slot) => submitPlayerAction({ kind: 'switch', targetIdx: slot })
            : undefined}
        />
        <div className="arena-center">
          <WeatherDisplay field={displayedState.field} />
          <div className="arena-vs">VS</div>
          <TerrainDisplay field={displayedState.field} />
        </div>
        <TeamView state={displayedState} side={1} />
      </div>

      <FieldStateStrip state={displayedState} />

      {done && !isPlaying && winner !== null && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>🏆 Team {winner + 1} wins!</h2>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={rematch}>Rematch</button>
            <button className="btn-secondary" onClick={() => setPhase('select')}>New Battle</button>
            <button className="btn-secondary" onClick={onBack}>Back to Menu</button>
          </div>
        </div>
      )}

      {!done && mode === 'spectate' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={thinking || isPlaying}>
            {thinking ? 'Thinking…' : isPlaying ? 'Playing…' : 'Next Turn →'}
          </button>
        </div>
      )}

      {!done && mode === 'play' && (
        <PlayerActionBar
          state={state}
          thinking={thinking || isPlaying}
          onAction={submitPlayerAction}
        />
      )}

      <div className="card battle-log" ref={logRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Battle Log</h3>
          <span onClick={toggleFastMode} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ color: !fastMode ? 'var(--text)' : 'var(--text-muted)' }}>Slow</span>
            <span
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
          </span>
        </div>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Press "Next Turn" to start.</p>}
        {log.map((ev, i) => renderTeamEvent(ev, i))}
      </div>
      {done && !isPlaying && damageSummary && (
        <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
      )}
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
        <button className="btn-secondary btn-small" onClick={onRandomize} disabled={enabled.length < 4}>
          🎲 Randomize
        </button>
      </div>
      {[0, 1, 2, 3].map(slot => {
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
          Pick 4 different Pokemon.
        </p>
      )}
    </div>
  );
}
