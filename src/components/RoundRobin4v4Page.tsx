import { useState, useEffect, useMemo, useRef } from 'react';
import type { PokemonData, TeamBattleState, TeamSlotIndex } from '../models/types';
import {
  createPlayTournament,
  createSpectateTournament,
  applyDraftPick,
  applyMatchResult,
  findNextPlayerMatchIdx,
  isPlayerPairing,
  RR_MIN_POOL_PLAY,
  RR_MIN_POOL_SPECTATE,
  RR_TOTAL_MATCHES,
} from '../tournament/roundRobin4v4Engine';
import type { RR4v4State, RR4v4MatchResult } from '../tournament/roundRobin4v4Engine';
import {
  saveRoundRobin4v4,
  loadRoundRobin4v4,
  clearRoundRobin4v4,
} from '../persistence/roundRobin4v4Storage';
import { recordTournamentDamage } from '../persistence/damageStatsStorage';
import { pickStartingIndex } from '../tournament/rosterPicker';
import {
  buildTeamBattleState,
  runFullTeamBattle,
  applyInitialSwitchInsTeam,
} from '../battle/teamBattleEngine';
import { mctsTeamAI } from '../ai/mctsTeamAI';
import { parseDamageSummary, buildNameToIdMap } from '../battle/damageSummary';
import { getPokemonPersisted } from '../persistence/userStorage';
import TeamView from './TeamView';
import PlayerActionBar from './PlayerActionBar';
import FieldStateStrip from './FieldStateStrip';
import TypeBadge from './TypeBadge';
import { renderTeamEvent } from './TeamEventLog';
import { useTeamBattleController } from './useTeamBattleController';
import DraftPhase from './DraftPhase';
import RoundRobinStandingsView from './RoundRobinStandingsView';
import WeatherDisplay from './WeatherDisplay';
import TerrainDisplay from './TerrainDisplay';
import { formatPokemonName } from '../utils/formatName';
import DamageSummaryBlock from './DamageSummaryBlock';
import './RoundRobin4v4Page.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

// Local page-level phase that layers on top of the persisted tournament phase.
type LocalPhase = 'setup' | 'draft' | 'overview' | 'preMatch' | 'match' | 'finished';

interface PendingMatch {
  pairing: { a: number; b: number };
  initial: TeamBattleState;
  rosterA: [number, number, number, number]; // pokemon ids for team A (all 4 brought)
  rosterB: [number, number, number, number];
  interactive: 'play' | 'spectate';
  // When true, battle side 0 is pairing team B (player always sits on side 0
  // during play). Map winner/survived back to pairing order on result.
  swapped: boolean;
}

export default function RoundRobin4v4Page({ allPokemon, onBack }: Props) {
  const byId = useMemo(() => new Map(allPokemon.map(p => [p.id, p])), [allPokemon]);
  const enabledCount = useMemo(
    () => allPokemon.filter(p => !getPokemonPersisted(p.id).disabled && p.availableMoves.length > 0).length,
    [allPokemon],
  );

  const [state, setState] = useState<RR4v4State | null>(() => loadRoundRobin4v4());
  const [localPhase, setLocalPhase] = useState<LocalPhase>(() => {
    const loaded = loadRoundRobin4v4();
    if (!loaded) return 'setup';
    if (loaded.phase === 'draft') return 'draft';
    if (loaded.phase === 'finished') return 'finished';
    return 'overview';
  });
  const [pending, setPending] = useState<PendingMatch | null>(null);

  useEffect(() => {
    if (state) saveRoundRobin4v4(state);
  }, [state]);

  function startPlay() {
    try {
      const s = createPlayTournament(allPokemon);
      setState(s);
      setLocalPhase('draft');
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function startSpectate() {
    try {
      const s = createSpectateTournament(allPokemon);
      setState(s);
      setLocalPhase('overview');
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function abandonTournament() {
    if (!confirm('Abandon the current tournament? Progress will be lost.')) return;
    clearRoundRobin4v4();
    setState(null);
    setPending(null);
    setLocalPhase('setup');
  }

  function startNewTournament() {
    if (!state) return;
    recordTournamentDamage(state);
    clearRoundRobin4v4();
    setState(null);
    setPending(null);
    setLocalPhase('setup');
  }

  function launchBattleWithPlayerPick(playerStartIdx: TeamSlotIndex) {
    if (!state) return;
    const pair = state.schedule[state.currentMatchIdx];
    const teamA = state.teams[pair.a];
    const teamB = state.teams[pair.b];
    const rosterAData = teamA.roster.map(id => byId.get(id)!).filter(Boolean);
    const rosterBData = teamB.roster.map(id => byId.get(id)!).filter(Boolean);

    const aIds = teamA.roster as [number, number, number, number];
    const bIds = teamB.roster as [number, number, number, number];

    let activeIdx0: TeamSlotIndex;
    let activeIdx1: TeamSlotIndex;
    if (teamA.isPlayer) {
      activeIdx0 = playerStartIdx;
      activeIdx1 = pickStartingIndex(rosterBData, rosterAData);
    } else {
      activeIdx0 = pickStartingIndex(rosterAData, rosterBData);
      activeIdx1 = playerStartIdx;
    }

    // Player is always on battle side 0 so the action bar and left-side TeamView
    // map to their controls. Swap the build order when the player is team B.
    const swapped = teamB.isPlayer;
    const initial = swapped
      ? buildTeamBattleState(bIds, aIds, allPokemon, { activeIdx0: activeIdx1, activeIdx1: activeIdx0 })
      : buildTeamBattleState(aIds, bIds, allPokemon, { activeIdx0, activeIdx1 });
    setPending({ pairing: pair, initial, rosterA: aIds, rosterB: bIds, interactive: 'play', swapped });
    setLocalPhase('match');
  }

  function launchSpectateBattle() {
    if (!state) return;
    const pair = state.schedule[state.currentMatchIdx];
    const teamA = state.teams[pair.a];
    const teamB = state.teams[pair.b];
    const rosterAData = teamA.roster.map(id => byId.get(id)!).filter(Boolean);
    const rosterBData = teamB.roster.map(id => byId.get(id)!).filter(Boolean);
    const aIds = teamA.roster as [number, number, number, number];
    const bIds = teamB.roster as [number, number, number, number];
    const activeIdx0 = pickStartingIndex(rosterAData, rosterBData);
    const activeIdx1 = pickStartingIndex(rosterBData, rosterAData);
    const initial = buildTeamBattleState(aIds, bIds, allPokemon, { activeIdx0, activeIdx1 });
    setPending({ pairing: pair, initial, rosterA: aIds, rosterB: bIds, interactive: 'spectate', swapped: false });
    setLocalPhase('match');
  }

  function onMatchEnd(result: RR4v4MatchResult) {
    if (!state) return;
    const next = applyMatchResult(state, result);
    setState(next);
    setPending(null);
    if (next.phase === 'finished') setLocalPhase('finished');
    else setLocalPhase('overview');
  }

  function simulateUntilPlayer(simulateAll = false) {
    if (!state) return;
    let current = state;
    while (current.phase !== 'finished' && current.currentMatchIdx < current.schedule.length) {
      const pair = current.schedule[current.currentMatchIdx];
      const teamA = current.teams[pair.a];
      const teamB = current.teams[pair.b];
      const isPlayerMatch = teamA.isPlayer || teamB.isPlayer;
      if (!simulateAll && isPlayerMatch) break;

      const rosterAData = teamA.roster.map(id => byId.get(id)!).filter(Boolean);
      const rosterBData = teamB.roster.map(id => byId.get(id)!).filter(Boolean);
      const aIds = teamA.roster as [number, number, number, number];
      const bIds = teamB.roster as [number, number, number, number];
      const activeIdx0 = pickStartingIndex(rosterAData, rosterBData);
      const activeIdx1 = pickStartingIndex(rosterBData, rosterAData);
      const initial = buildTeamBattleState(aIds, bIds, allPokemon, { activeIdx0, activeIdx1 });
      const battle = runFullTeamBattle(initial, mctsTeamAI, mctsTeamAI);
      const survivedA = battle.finalState.teams[0].pokemon.filter(p => p.currentHp > 0).length;
      const survivedB = battle.finalState.teams[1].pokemon.filter(p => p.currentHp > 0).length;
      const nameToId = buildNameToIdMap(initial);
      const damageSummary = parseDamageSummary(battle.log, nameToId);
      current = applyMatchResult(current, {
        winner: battle.winner === 0 ? 0 : 1,
        rosterA: aIds,
        rosterB: bIds,
        pokemonSurvivedA: survivedA,
        pokemonSurvivedB: survivedB,
        damageSummary,
      });
    }
    setState(current);
    if (current.phase === 'finished') setLocalPhase('finished');
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  if (!state || localPhase === 'setup') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">4v4 Round Robin</h1>
        <div className="rr-setup card">
          <p>
            Ten teams of four Pokemon compete in a full round-robin ({RR_TOTAL_MATCHES} matches).
            All 4 Pokemon are brought to every match. Before each match, pick your starting Pokemon.
          </p>
          <div className="rr-setup-info">
            <div>Play mode: draft 4 Pokemon from curated offers (min {RR_MIN_POOL_PLAY} enabled).</div>
            <div>Spectate mode: watch 10 randomly-generated teams (min {RR_MIN_POOL_SPECTATE} enabled).</div>
            <div>Currently enabled: <strong>{enabledCount}</strong></div>
          </div>
          <div className="rr-setup-buttons">
            <button
              className="btn-primary"
              onClick={startPlay}
              disabled={enabledCount < RR_MIN_POOL_PLAY}
            >Play (with draft)</button>
            <button
              className="btn-secondary"
              onClick={startSpectate}
              disabled={enabledCount < RR_MIN_POOL_SPECTATE}
            >Spectate whole tournament</button>
          </div>
        </div>
      </div>
    );
  }

  if (localPhase === 'draft' && state.draft) {
    return (
      <div className="page">
        <button className="back-btn" onClick={abandonTournament}>← Abandon</button>
        <h1 className="page-title">4v4 Round Robin — Draft</h1>
        <DraftPhase
          allPokemon={allPokemon}
          offeredIds={state.draft.offered}
          pickedIds={state.draft.picked}
          round={state.draft.round}
          onPick={(id) => {
            const next = applyDraftPick(state, id);
            setState(next);
            if (next.phase === 'overview') setLocalPhase('overview');
          }}
        />
      </div>
    );
  }

  if (localPhase === 'preMatch') {
    return (
      <PreMatchView
        state={state}
        byId={byId}
        onSelect={launchBattleWithPlayerPick}
        onCancel={() => setLocalPhase('overview')}
      />
    );
  }

  if (localPhase === 'match' && pending) {
    return (
      <MatchView
        tournamentState={state}
        pending={pending}
        allPokemon={allPokemon}
        onEnd={onMatchEnd}
        onBack={onBack}
      />
    );
  }

  if (localPhase === 'finished') {
    return (
      <FinishedView
        state={state}
        allPokemon={allPokemon}
        onBack={onBack}
        onStartNew={startNewTournament}
      />
    );
  }

  // Default: overview
  const nextIdx = state.currentMatchIdx;
  const nextPairing = nextIdx < state.schedule.length ? state.schedule[nextIdx] : null;
  const teamA = nextPairing ? state.teams[nextPairing.a] : null;
  const teamB = nextPairing ? state.teams[nextPairing.b] : null;
  const nextIsPlayer = nextPairing ? isPlayerPairing(state, nextIdx) : false;
  const nextPlayerIdx = findNextPlayerMatchIdx(state);
  const aiMatchesUntilPlayer = nextPlayerIdx !== null ? nextPlayerIdx - state.currentMatchIdx : null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">4v4 Round Robin</h1>

      <div className="rr-progress card">
        <div>Progress: <strong>{state.currentMatchIdx} / {state.schedule.length}</strong> matches played</div>
        <button className="btn-secondary btn-small" onClick={abandonTournament}>Abandon</button>
      </div>

      {nextPairing && teamA && teamB && (
        <div className="rr-next-match card">
          <h3 className="section-title">Next Match — #{nextIdx + 1}</h3>
          <div className="rr-next-pair">
            <TeamRosterMini team={teamA} byId={byId} />
            <div className="rr-vs">VS</div>
            <TeamRosterMini team={teamB} byId={byId} />
          </div>
          <div className="rr-next-actions">
            {state.mode === 'play' && nextIsPlayer && (
              <button className="btn-primary" onClick={() => setLocalPhase('preMatch')}>Play my match</button>
            )}
            {(state.mode === 'spectate' || !nextIsPlayer) && (
              <button className="btn-secondary" onClick={launchSpectateBattle}>Spectate this match</button>
            )}
            {state.mode === 'play' && !nextIsPlayer && aiMatchesUntilPlayer !== null && aiMatchesUntilPlayer > 0 && (
              <button className="btn-primary" onClick={() => simulateUntilPlayer(false)}>
                Simulate {aiMatchesUntilPlayer} AI match{aiMatchesUntilPlayer === 1 ? '' : 'es'} until mine
              </button>
            )}
            {state.mode === 'play' && !nextIsPlayer && nextPlayerIdx === null && (
              <button className="btn-primary" onClick={() => simulateUntilPlayer(true)}>
                Simulate remaining {state.schedule.length - state.currentMatchIdx} match{state.schedule.length - state.currentMatchIdx === 1 ? '' : 'es'}
              </button>
            )}
            {state.mode === 'spectate' && (
              <button className="btn-primary" onClick={() => simulateUntilPlayer(true)}>
                Simulate remaining matches
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <RoundRobinStandingsView state={state} allPokemon={allPokemon} />
      </div>
    </div>
  );
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function TeamRosterMini({ team, byId }: { team: RR4v4State['teams'][number]; byId: Map<number, PokemonData> }) {
  return (
    <div className="rr-team-mini">
      <div className="rr-team-mini-name">{team.name}</div>
      <div className="rr-team-mini-sprites">
        {team.roster.map(id => {
          const p = byId.get(id);
          return p ? (
            <div key={id} className="rr-team-mini-slot">
              <img src={p.spriteUrl} alt={p.name} title={formatPokemonName(p.name)} />
              <div className="rr-team-mini-types">
                {p.types.map(t => <TypeBadge key={t} type={t} />)}
              </div>
            </div>
          ) : null;
        })}
      </div>
    </div>
  );
}

function PreMatchView(props: {
  state: RR4v4State;
  byId: Map<number, PokemonData>;
  onSelect: (startIdx: TeamSlotIndex) => void;
  onCancel: () => void;
}) {
  const { state, byId, onCancel, onSelect } = props;
  const pair = state.schedule[state.currentMatchIdx];
  const playerSide = state.teams[pair.a].isPlayer ? 'a' : 'b';
  const playerTeam = playerSide === 'a' ? state.teams[pair.a] : state.teams[pair.b];
  const oppTeam = playerSide === 'a' ? state.teams[pair.b] : state.teams[pair.a];

  const [selected, setSelected] = useState<number | null>(null);
  const confirmable = selected !== null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onCancel}>← Back to Overview</button>
      <h1 className="page-title">Pick Your Starter — Match #{state.currentMatchIdx + 1}</h1>

      <div className="rr-prematch-opp card">
        <h3 className="section-title">Opponent: {oppTeam.name}</h3>
        <div className="rr-prematch-roster">
          {oppTeam.roster.map(id => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <div key={id} className="rr-prematch-card">
                <img src={p.spriteUrl} alt={p.name} />
                <div>{formatPokemonName(p.name)}</div>
                <div className="rr-prematch-types">
                  {p.types.map(t => <TypeBadge key={t} type={t} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rr-prematch-own card">
        <h3 className="section-title">Your Roster — pick your starting Pokemon</h3>
        <div className="rr-prematch-roster">
          {playerTeam.roster.map((id, idx) => {
            const p = byId.get(id);
            if (!p) return null;
            const picked = selected === idx;
            return (
              <button
                key={id}
                className={'rr-prematch-card rr-pick-btn' + (picked ? ' rr-pick-selected' : '')}
                onClick={() => setSelected(idx)}
              >
                <img src={p.spriteUrl} alt={p.name} />
                <div>{formatPokemonName(p.name)}</div>
                <div className="rr-prematch-types">
                  {p.types.map(t => <TypeBadge key={t} type={t} />)}
                </div>
                {picked && <div className="rr-pick-badge">Starting</div>}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary"
          disabled={!confirmable}
          onClick={() => onSelect(selected as TeamSlotIndex)}
        >
          Confirm & Start Battle
        </button>
      </div>
    </div>
  );
}

function MatchView(props: {
  tournamentState: RR4v4State;
  pending: PendingMatch;
  allPokemon: PokemonData[];
  onEnd: (result: RR4v4MatchResult) => void;
  onBack: () => void;
}) {
  const { tournamentState, pending, allPokemon, onEnd, onBack } = props;
  const startup = useMemo(() => applyInitialSwitchInsTeam(pending.initial), [pending.initial]);
  const { state, displayedState, log, thinking, winner, done, isPlaying, nextTurn, submitPlayerAction } =
    useTeamBattleController(startup.state, startup.events);
  const damageSummary = useMemo(() => {
    if (!done) return null;
    const nameToId = buildNameToIdMap(pending.initial);
    return parseDamageSummary(log, nameToId);
  }, [done, log, pending.initial]);
  const logRef = useRef<HTMLDivElement>(null);

  const teamA = tournamentState.teams[pending.pairing.a];
  const teamB = tournamentState.teams[pending.pairing.b];
  const mode: 'play' | 'spectate' = pending.interactive;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function handleContinue() {
    if (!done || winner === null) return;
    const survivedSide0 = state.teams[0].pokemon.filter(p => p.currentHp > 0).length;
    const survivedSide1 = state.teams[1].pokemon.filter(p => p.currentHp > 0).length;
    const pairingWinner: 0 | 1 = pending.swapped
      ? (winner === 0 ? 1 : 0)
      : (winner === 0 ? 0 : 1);
    const survivedA = pending.swapped ? survivedSide1 : survivedSide0;
    const survivedB = pending.swapped ? survivedSide0 : survivedSide1;
    onEnd({
      winner: pairingWinner,
      rosterA: pending.rosterA,
      rosterB: pending.rosterB,
      pokemonSurvivedA: survivedA,
      pokemonSurvivedB: survivedB,
      damageSummary: damageSummary ?? undefined,
    });
  }

  // Player always sits on battle side 0 during play (see launchBattleWithPlayerPick).
  const playerControlsSide0 = mode === 'play';
  // Left side of the UI shows whichever pairing team landed on battle side 0.
  const leftTeam = pending.swapped ? teamB : teamA;
  const rightTeam = pending.swapped ? teamA : teamB;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Menu</button>
      <h1 className="page-title">
        Match #{tournamentState.currentMatchIdx + 1}: {leftTeam.name} vs {rightTeam.name}
      </h1>

      <div className="team-arena">
        <TeamView
          state={displayedState}
          side={0}
          onSwitch={playerControlsSide0 && !thinking && !isPlaying
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
          <h2 style={{ color: '#f1c40f' }}>
            🏆 {winner === 0 ? leftTeam.name : rightTeam.name} wins!
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleContinue}>Continue to Standings →</button>
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

      {!done && playerControlsSide0 && (
        <PlayerActionBar
          state={state}
          thinking={thinking || isPlaying}
          onAction={submitPlayerAction}
        />
      )}

      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
        {log.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {mode === 'spectate' ? 'Press "Next Turn" to start.' : 'Choose your action.'}
          </p>
        )}
        {log.map((ev, i) => renderTeamEvent(ev, i))}
      </div>
      {done && !isPlaying && damageSummary && (
        <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
      )}
    </div>
  );
}

function FinishedView(props: {
  state: RR4v4State;
  allPokemon: PokemonData[];
  onBack: () => void;
  onStartNew: () => void;
}) {
  const { state, allPokemon, onBack, onStartNew } = props;
  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">🏆 Tournament Finished</h1>
      <div className="card">
        <RoundRobinStandingsView state={state} allPokemon={allPokemon} />
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="btn-primary" onClick={onStartNew}>Start New Tournament</button>
      </div>
    </div>
  );
}
