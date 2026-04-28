# Turn Playback System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make battle turns play out event-by-event in the UI at 750 ms intervals (slow mode) or instantly (fast mode), with a Slow/Fast toggle in the battle log header.

**Architecture:** Each turn still resolves synchronously and produces a full event list. The hook/component immediately updates the resolved state (for AI use) but drips events one at a time into a displayed state via a `useEffect` + `setTimeout` queue. Controls are locked while the queue is non-empty.

**Tech Stack:** React hooks, TypeScript, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/battle/applyEventToState.ts` | **Create** | Pure utility: applies one TurnEvent or TeamTurnEvent to displayed state |
| `src/battle/__tests__/applyEventToState.test.ts` | **Create** | Unit tests for the utility |
| `src/components/useTeamBattleController.ts` | **Modify** | Add displayedState, playbackQueue, fastMode, drip useEffect |
| `src/components/Battle4v4Page.tsx` | **Modify** | Render displayedState; add isPlaying guards; add speed toggle |
| `src/components/BattlePage.tsx` | **Modify** | Add field tracking, dual state, playback queue, speed toggle |

---

## Task 1: Create `applyEventToState.ts` + tests

**Files:**
- Create: `src/battle/__tests__/applyEventToState.test.ts`
- Create: `src/battle/applyEventToState.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/battle/__tests__/applyEventToState.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { applyEventToState, applyTeamEventToState } from '../applyEventToState';
import { makePokemon } from './fixtures';
import type { FieldState, Team, TeamBattleState } from '../../models/types';

function makeField(overrides: Partial<FieldState> = {}): FieldState {
  return {
    trickRoomTurns: 0,
    weatherTurns: 0,
    terrainTurns: 0,
    sides: [
      { tailwindTurns: 0, lightScreenTurns: 0, reflectTurns: 0, stealthRock: false, spikes: 0, toxicSpikes: false },
      { tailwindTurns: 0, lightScreenTurns: 0, reflectTurns: 0, stealthRock: false, spikes: 0, toxicSpikes: false },
    ],
    ...overrides,
  };
}

function makeTeamState(name0: string, name1: string): TeamBattleState {
  const bench = (prefix: string) => [1, 2, 3].map(i => makePokemon({ name: `${prefix}bench${i}` }));
  const team0: Team = { pokemon: [makePokemon({ name: name0, currentHp: 100 }), ...bench('a')], activeIdx: 0 };
  const team1: Team = { pokemon: [makePokemon({ name: name1, currentHp: 100 }), ...bench('b')], activeIdx: 0 };
  return { teams: [team0, team1], turn: 1, phase: 'choose', field: makeField() };
}

describe('applyEventToState (1v1)', () => {
  it('attack: updates defender and attacker HP', () => {
    const p1 = makePokemon({ name: 'pika', currentHp: 100 });
    const p2 = makePokemon({ name: 'char', currentHp: 100 });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'attack', turn: 1,
      attackerName: 'pika', defenderName: 'char',
      moveName: 'Thunderbolt', moveType: 'electric', damageClass: 'special',
      damage: 40, isCrit: false, missed: false, effectiveness: 1,
      attackerHpAfter: 100, defenderHpAfter: 60,
    });
    expect(result.p1.currentHp).toBe(100);
    expect(result.p2.currentHp).toBe(60);
  });

  it('recoil: updates the named pokemon HP', () => {
    const p1 = makePokemon({ name: 'pika', currentHp: 100 });
    const p2 = makePokemon({ name: 'char', currentHp: 80 });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'recoil', turn: 1, pokemonName: 'pika', damage: 20, hpAfter: 80,
    });
    expect(result.p1.currentHp).toBe(80);
    expect(result.p2.currentHp).toBe(80);
  });

  it('status_applied: sets the condition on the named pokemon', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'status_applied', turn: 1, pokemonName: 'char', condition: 'burn',
    });
    expect(result.p2.statusCondition).toBe('burn');
    expect(result.p1.statusCondition).toBeUndefined();
  });

  it('status_cured: clears the condition', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char', statusCondition: 'paralysis' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'status_cured', turn: 1, pokemonName: 'char', condition: 'paralysis',
    });
    expect(result.p2.statusCondition).toBeUndefined();
  });

  it('stat_change: updates the correct stat stage', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'stat_change', turn: 1, pokemonName: 'char', stat: 'attack', change: -1, newStage: -1,
    });
    expect(result.p2.statStages.attack).toBe(-1);
    expect(result.p2.statStages.defense).toBe(0);
  });

  it('weather_set: updates field weather and turns', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'weather_set', turn: 1, weather: 'rain', turns: 5, pokemonName: 'pika',
    });
    expect(result.field.weather).toBe('rain');
    expect(result.field.weatherTurns).toBe(5);
  });

  it('weather_expired: clears field weather', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField({ weather: 'rain', weatherTurns: 1 }), {
      kind: 'weather_expired', turn: 2, weather: 'rain',
    });
    expect(result.field.weather).toBeUndefined();
    expect(result.field.weatherTurns).toBe(0);
  });

  it('log-only events return the same object references', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const field = makeField();
    const result = applyEventToState(p1, p2, field, {
      kind: 'cant_move', turn: 1, pokemonName: 'pika', reason: 'paralysis',
    });
    expect(result.p1).toBe(p1);
    expect(result.p2).toBe(p2);
    expect(result.field).toBe(field);
  });
});

describe('applyTeamEventToState (4v4)', () => {
  it('attack: updates HP across teams by name', () => {
    const state = makeTeamState('pika', 'char');
    const result = applyTeamEventToState(state, {
      side: 0,
      kind: 'attack', turn: 1,
      attackerName: 'pika', defenderName: 'char',
      moveName: 'Thunderbolt', moveType: 'electric', damageClass: 'special',
      damage: 40, isCrit: false, missed: false, effectiveness: 1,
      attackerHpAfter: 100, defenderHpAfter: 60,
    });
    expect(result.teams[0].pokemon[0].currentHp).toBe(100);
    expect(result.teams[1].pokemon[0].currentHp).toBe(60);
  });

  it('switch: updates activeIdx for the switching side only', () => {
    const state = makeTeamState('pika', 'char');
    // bench0a is at index 1 in team 0
    const result = applyTeamEventToState(state, {
      kind: 'switch', turn: 1, side: 0, outName: 'pika', inName: 'abench1',
    });
    expect(result.teams[0].activeIdx).toBe(1);
    expect(result.teams[1].activeIdx).toBe(0);
  });

  it('status_applied: sets condition on the named pokemon in whichever team', () => {
    const state = makeTeamState('pika', 'char');
    const result = applyTeamEventToState(state, {
      side: 1,
      kind: 'status_applied', turn: 1, pokemonName: 'char', condition: 'poison',
    });
    expect(result.teams[1].pokemon[0].statusCondition).toBe('poison');
    expect(result.teams[0].pokemon[0].statusCondition).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
npx vitest run src/battle/__tests__/applyEventToState.test.ts
```

Expected: FAIL with "Cannot find module '../applyEventToState'"

- [ ] **Step 3: Create `src/battle/applyEventToState.ts`**

```typescript
import type {
  BattlePokemon,
  FieldState,
  SideFieldState,
  SideIndex,
  Team,
  TeamBattleState,
  TeamSlotIndex,
  TeamTurnEvent,
  TurnEvent,
} from '../models/types';

// ── Shared field helpers ──────────────────────────────────────────────────────

function applyFieldSet(
  field: FieldState,
  event: Extract<TurnEvent, { kind: 'field_set' }>,
): FieldState {
  const { effect, side, turns } = event;
  if (effect === 'trickRoom') return { ...field, trickRoomTurns: turns };
  if (side === undefined) return field;
  const sides: [SideFieldState, SideFieldState] = [{ ...field.sides[0] }, { ...field.sides[1] }];
  const s = sides[side];
  if (effect === 'tailwind') s.tailwindTurns = turns;
  else if (effect === 'lightScreen') s.lightScreenTurns = turns;
  else if (effect === 'reflect') s.reflectTurns = turns;
  else if (effect === 'stealthRock') s.stealthRock = true;
  else if (effect === 'spikes') s.spikes = turns; // turns encodes the new layer count
  else if (effect === 'toxicSpikes') s.toxicSpikes = true;
  return { ...field, sides };
}

function applyFieldExpired(
  field: FieldState,
  event: Extract<TurnEvent, { kind: 'field_expired' }>,
): FieldState {
  const { effect, side } = event;
  if (effect === 'trickRoom') return { ...field, trickRoomTurns: 0 };
  if (side === undefined) return field;
  const sides: [SideFieldState, SideFieldState] = [{ ...field.sides[0] }, { ...field.sides[1] }];
  const s = sides[side];
  if (effect === 'tailwind') s.tailwindTurns = 0;
  else if (effect === 'lightScreen') s.lightScreenTurns = 0;
  else if (effect === 'reflect') s.reflectTurns = 0;
  return { ...field, sides };
}

// ── 1v1 ──────────────────────────────────────────────────────────────────────

function patchByName(
  p1: BattlePokemon,
  p2: BattlePokemon,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): { p1: BattlePokemon; p2: BattlePokemon } {
  return {
    p1: p1.data.name === name ? patch(p1) : p1,
    p2: p2.data.name === name ? patch(p2) : p2,
  };
}

function hpPatch(hpAfter: number): (p: BattlePokemon) => BattlePokemon {
  return p => ({ ...p, currentHp: hpAfter });
}

/**
 * Applies one TurnEvent to the displayed 1v1 battle state.
 * Pure — never mutates its inputs.
 */
export function applyEventToState(
  p1: BattlePokemon,
  p2: BattlePokemon,
  field: FieldState,
  event: TurnEvent,
): { p1: BattlePokemon; p2: BattlePokemon; field: FieldState } {
  switch (event.kind) {
    case 'attack': {
      const a = patchByName(p1, p2, event.attackerName, hpPatch(event.attackerHpAfter));
      const d = patchByName(a.p1, a.p2, event.defenderName, hpPatch(event.defenderHpAfter));
      return { ...d, field };
    }
    case 'recoil':
    case 'drain':
    case 'heal':
    case 'status_damage':
    case 'confusion_hit':
    case 'stealth_rock_damage':
    case 'spikes_damage':
    case 'weather_damage':
    case 'terrain_heal':
      return { ...patchByName(p1, p2, event.pokemonName, hpPatch(event.hpAfter)), field };
    case 'stat_change': {
      const patch = patchByName(p1, p2, event.pokemonName, p => ({
        ...p, statStages: { ...p.statStages, [event.stat]: event.newStage },
      }));
      return { ...patch, field };
    }
    case 'status_applied':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, statusCondition: event.condition })), field };
    case 'status_cured':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, statusCondition: undefined })), field };
    case 'confused':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, confused: true })), field };
    case 'confusion_end':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, confused: false })), field };
    case 'weather_set':
      return { p1, p2, field: { ...field, weather: event.weather, weatherTurns: event.turns } };
    case 'weather_expired':
      return { p1, p2, field: { ...field, weather: undefined, weatherTurns: 0 } };
    case 'terrain_set':
      return { p1, p2, field: { ...field, terrain: event.terrain, terrainTurns: event.turns } };
    case 'terrain_expired':
      return { p1, p2, field: { ...field, terrain: undefined, terrainTurns: 0 } };
    case 'field_set':
      return { p1, p2, field: applyFieldSet(field, event) };
    case 'field_expired':
      return { p1, p2, field: applyFieldExpired(field, event) };
    default:
      return { p1, p2, field };
  }
}

// ── 4v4 ──────────────────────────────────────────────────────────────────────

function patchPokemonInTeam(
  team: Team,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): Team {
  return { ...team, pokemon: team.pokemon.map(p => p.data.name === name ? patch(p) : p) };
}

function patchAllTeams(
  state: TeamBattleState,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): TeamBattleState {
  return {
    ...state,
    teams: [patchPokemonInTeam(state.teams[0], name, patch), patchPokemonInTeam(state.teams[1], name, patch)],
  };
}

function applyTurnEventToTeamState(state: TeamBattleState, event: TurnEvent): TeamBattleState {
  switch (event.kind) {
    case 'attack': {
      const s = patchAllTeams(state, event.attackerName, hpPatch(event.attackerHpAfter));
      return patchAllTeams(s, event.defenderName, hpPatch(event.defenderHpAfter));
    }
    case 'recoil':
    case 'drain':
    case 'heal':
    case 'status_damage':
    case 'confusion_hit':
    case 'stealth_rock_damage':
    case 'spikes_damage':
    case 'weather_damage':
    case 'terrain_heal':
      return patchAllTeams(state, event.pokemonName, hpPatch(event.hpAfter));
    case 'stat_change':
      return patchAllTeams(state, event.pokemonName, p => ({
        ...p, statStages: { ...p.statStages, [event.stat]: event.newStage },
      }));
    case 'status_applied':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, statusCondition: event.condition }));
    case 'status_cured':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, statusCondition: undefined }));
    case 'confused':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, confused: true }));
    case 'confusion_end':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, confused: false }));
    case 'weather_set':
      return { ...state, field: { ...state.field, weather: event.weather, weatherTurns: event.turns } };
    case 'weather_expired':
      return { ...state, field: { ...state.field, weather: undefined, weatherTurns: 0 } };
    case 'terrain_set':
      return { ...state, field: { ...state.field, terrain: event.terrain, terrainTurns: event.turns } };
    case 'terrain_expired':
      return { ...state, field: { ...state.field, terrain: undefined, terrainTurns: 0 } };
    case 'field_set':
      return { ...state, field: applyFieldSet(state.field, event) };
    case 'field_expired':
      return { ...state, field: applyFieldExpired(state.field, event) };
    default:
      return state;
  }
}

/**
 * Applies one TeamTurnEvent to the displayed 4v4 battle state.
 * Pure — never mutates its inputs.
 */
export function applyTeamEventToState(
  state: TeamBattleState,
  event: TeamTurnEvent,
): TeamBattleState {
  if (event.kind === 'switch') {
    const teams: [Team, Team] = [{ ...state.teams[0] }, { ...state.teams[1] }];
    const team = teams[event.side];
    const newIdx = team.pokemon.findIndex(p => p.data.name === event.inName);
    if (newIdx !== -1) teams[event.side] = { ...team, activeIdx: newIdx as TeamSlotIndex };
    return { ...state, teams };
  }
  return applyTurnEventToTeamState(state, event as TurnEvent);
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```
npx vitest run src/battle/__tests__/applyEventToState.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/battle/applyEventToState.ts src/battle/__tests__/applyEventToState.test.ts
git commit -m "feat: add applyEventToState utility for turn-by-turn playback"
```

---

## Task 2: Update `useTeamBattleController.ts`

**Files:**
- Modify: `src/components/useTeamBattleController.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useState, useCallback, useEffect } from 'react';
import type {
  TeamBattleState,
  TeamTurnEvent,
  TeamAction,
  SideIndex,
} from '../models/types';
import { applyActions, battleWinner, legalActions } from '../battle/teamBattleEngine';
import { mctsTeamAI } from '../ai/mctsTeamAI';
import { applyTeamEventToState } from '../battle/applyEventToState';

const SLOW_DELAY_MS = 750;

export function useTeamBattleController(initial: TeamBattleState, initialLog: TeamTurnEvent[] = []) {
  const [state, setState] = useState<TeamBattleState>(initial);
  const [displayedState, setDisplayedState] = useState<TeamBattleState>(initial);
  const [log, setLog] = useState<TeamTurnEvent[]>(initialLog);
  const [playbackQueue, setPlaybackQueue] = useState<TeamTurnEvent[]>([]);
  const [thinking, setThinking] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  const winner: SideIndex | null = battleWinner(state);
  const done = winner !== null;
  const isPlaying = playbackQueue.length > 0;

  // Drip one event from the queue on each tick.
  useEffect(() => {
    if (playbackQueue.length === 0) return;
    const delay = fastMode ? 0 : SLOW_DELAY_MS;
    const timer = setTimeout(() => {
      const [event, ...rest] = playbackQueue;
      setDisplayedState(prev => applyTeamEventToState(prev, event));
      setLog(prev => [...prev, event]);
      setPlaybackQueue(rest);
    }, delay);
    return () => clearTimeout(timer);
  }, [playbackQueue, fastMode]);

  const toggleFastMode = useCallback(() => setFastMode(f => !f), []);

  const nextTurn = useCallback(() => {
    if (thinking || isPlaying || done) return;
    setThinking(true);
    setTimeout(() => {
      const a0 = legalActions(state, 0).length > 0 ? mctsTeamAI.selectAction(state, 0) : null;
      const a1 = legalActions(state, 1).length > 0 ? mctsTeamAI.selectAction(state, 1) : null;
      const { next, events } = applyActions(state, a0, a1);
      setState(next);
      setPlaybackQueue(events);
      setThinking(false);
    }, 0);
  }, [state, thinking, isPlaying, done]);

  const submitPlayerAction = useCallback((a0: TeamAction) => {
    if (thinking || isPlaying || done) return;
    setThinking(true);
    setTimeout(() => {
      let cur = state;
      const newEvents: TeamTurnEvent[] = [];
      const a1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
      const step = applyActions(cur, a0, a1);
      newEvents.push(...step.events);
      cur = step.next;
      while (battleWinner(cur) === null && legalActions(cur, 0).length === 0) {
        const ai1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
        const step2 = applyActions(cur, null, ai1);
        newEvents.push(...step2.events);
        cur = step2.next;
      }
      setState(cur);
      setPlaybackQueue(newEvents);
      setThinking(false);
    }, 0);
  }, [state, thinking, isPlaying, done]);

  const reset = useCallback((newInitial: TeamBattleState, newLog: TeamTurnEvent[] = []) => {
    setState(newInitial);
    setDisplayedState(newInitial);
    setLog(newLog);
    setPlaybackQueue([]);
    setThinking(false);
  }, []);

  return {
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
  };
}
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

```
npx vitest run
```

Expected: all tests PASS (no tests cover the hook directly, but TypeScript compilation catches type errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/useTeamBattleController.ts
git commit -m "feat: add playback queue and fastMode to useTeamBattleController"
```

---

## Task 3: Update `Battle4v4Page.tsx`

**Files:**
- Modify: `src/components/Battle4v4Page.tsx`

Key changes:
1. Destructure `displayedState`, `isPlaying`, `fastMode`, `toggleFastMode` from the hook
2. Render `displayedState` everywhere instead of `state` (except `PlayerActionBar` and AI logic which need resolved state)
3. Add `isPlaying` to button disabled conditions and TeamView switch guard
4. Gate winner banner and `DamageSummaryBlock` on `!isPlaying`
5. Add Slow/Fast toggle to battle log header

- [ ] **Step 1: Update the destructure line (line 75-76)**

Find:
```typescript
  const { state, log, thinking, winner, done, nextTurn, submitPlayerAction, reset } =
    useTeamBattleController(initialState.state, initialState.events);
```

Replace with:
```typescript
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
```

- [ ] **Step 2: Update the auto-scroll effect to depend on `log` length (already correct, no change needed)**

Verify line 84-86 still reads:
```typescript
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
```

- [ ] **Step 3: Update the battle arena to render `displayedState`**

Find:
```tsx
      <div className="team-arena">
        <TeamView
          state={state}
          side={0}
          onSwitch={mode === 'play' && phase === 'battle' && !thinking
            ? (slot) => submitPlayerAction({ kind: 'switch', targetIdx: slot })
            : undefined}
        />
        <div className="arena-center">
          <WeatherDisplay field={state.field} />
          <div className="arena-vs">VS</div>
          <TerrainDisplay field={state.field} />
        </div>
        <TeamView state={state} side={1} />
      </div>
```

Replace with:
```tsx
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
```

- [ ] **Step 4: Gate winner banner and damage summary on `!isPlaying`**

Find:
```tsx
      {done && winner !== null && (
        <div className="winner-banner card">
```

Replace with:
```tsx
      {done && !isPlaying && winner !== null && (
        <div className="winner-banner card">
```

Find:
```tsx
      {done && damageSummary && (
        <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
      )}
```

Replace with:
```tsx
      {done && !isPlaying && damageSummary && (
        <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
      )}
```

- [ ] **Step 5: Add `isPlaying` to spectate Next Turn button**

Find:
```tsx
      {!done && mode === 'spectate' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={thinking}>
            {thinking ? 'Thinking…' : 'Next Turn →'}
          </button>
        </div>
      )}
```

Replace with:
```tsx
      {!done && mode === 'spectate' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={thinking || isPlaying}>
            {thinking ? 'Thinking…' : isPlaying ? 'Playing…' : 'Next Turn →'}
          </button>
        </div>
      )}
```

- [ ] **Step 6: Thread `isPlaying` into `PlayerActionBar` to disable buttons during playback**

Find:
```tsx
      {!done && mode === 'play' && (
        <PlayerActionBar
          state={state}
          thinking={thinking}
          onAction={submitPlayerAction}
        />
      )}
```

Replace with:
```tsx
      {!done && mode === 'play' && (
        <PlayerActionBar
          state={state}
          thinking={thinking || isPlaying}
          onAction={submitPlayerAction}
        />
      )}
```

- [ ] **Step 7: Add speed toggle to the battle log header**

Find:
```tsx
      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
```

Replace with:
```tsx
      <div className="card battle-log" ref={logRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 className="section-title" style={{ margin: 0 }}>Battle Log</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ color: !fastMode ? 'var(--text)' : 'var(--text-muted)' }}>Slow</span>
            <input type="checkbox" checked={fastMode} onChange={toggleFastMode} style={{ display: 'none' }} />
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
```

- [ ] **Step 8: Build to check for TypeScript errors**

```
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 9: Commit**

```bash
git add src/components/Battle4v4Page.tsx
git commit -m "feat: wire turn playback into Battle4v4Page"
```

---

## Task 4: Update `BattlePage.tsx` (1v1)

**Files:**
- Modify: `src/components/BattlePage.tsx`

Changes:
1. Track `field` state (currently missing — needed for `applyEventToState`)
2. Add `displayedP1`, `displayedP2`, `displayedField`, `playbackQueue`, `fastMode`
3. Add drip `useEffect`
4. Render from displayed state; disable Next Turn while playing
5. Add speed toggle to log header

- [ ] **Step 1: Update imports**

Find:
```typescript
import { useState, useRef, useEffect } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn, applyInitialSwitchIns } from '../battle/battleEngine';
```

Replace with:
```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent, FieldState } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn, applyInitialSwitchIns, makeInitialField } from '../battle/battleEngine';
import { applyEventToState } from '../battle/applyEventToState';
```

- [ ] **Step 2: Add new state variables after the existing state declarations**

Find the block of `useState` declarations (lines 30–35):
```typescript
  const [p1, setP1] = useState<BattlePokemon | null>(null);
  const [p2, setP2] = useState<BattlePokemon | null>(null);
  const [log, setLog] = useState<TurnEvent[]>([]);
  const [turn, setTurn] = useState(1);
  const [battleOver, setBattleOver] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
```

Replace with:
```typescript
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
```

- [ ] **Step 3: Add the drip useEffect after the existing scroll useEffect**

Find:
```typescript
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);
```

Add after it:
```typescript
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
```

- [ ] **Step 4: Update `startBattle` to initialize all state including field**

Find:
```typescript
  function startBattle() {
    const dataA = allPokemon.find(p => p.id === selA);
    const dataB = allPokemon.find(p => p.id === selB);
    if (!dataA || !dataB || selA === selB) return;
    setBattleSelection(selA, selB);
    const init = applyInitialSwitchIns(buildBattlePokemon(dataA), buildBattlePokemon(dataB));
    setP1(init.p1);
    setP2(init.p2);
    setLog(init.events);
    setTurn(1);
    setBattleOver(false);
    setPhase('battle');
  }
```

Replace with:
```typescript
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
```

- [ ] **Step 5: Update `nextTurn` to store resolved field state and enqueue events**

Find:
```typescript
  function nextTurn() {
    if (!p1 || !p2 || battleOver) return;
    const { events, p1After, p2After, battleOver: over, lastAttackerIsP1 } = resolveTurn(p1, p2, turn, expectiminimaxAI, expectiminimaxAI);
    setLog(prev => [...prev, ...events]);
    setP1(p1After);
    setP2(p2After);
    setTurn(t => t + 1);
    if (over) {
```

Replace with:
```typescript
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
```

(Remove the `setLog(prev => [...prev, ...events]);` line — log is now built by the drip effect.)

- [ ] **Step 6: Update `rematch` to reset all new state**

Find:
```typescript
  function rematch() {
    if (!p1 || !p2) return;
    const dataA = allPokemon.find(p => p.id === p1.data.id);
    const dataB = allPokemon.find(p => p.id === p2.data.id);
    if (!dataA || !dataB) return;
    const init = applyInitialSwitchIns(buildBattlePokemon(dataA), buildBattlePokemon(dataB));
    setP1(init.p1);
    setP2(init.p2);
    setLog(init.events);
    setTurn(1);
    setBattleOver(false);
    setPhase('battle');
  }
```

Replace with:
```typescript
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
```

- [ ] **Step 7: Update battle arena rendering to use displayed state**

Find:
```tsx
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
```

Replace with:
```tsx
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
```

- [ ] **Step 8: Disable Next Turn while playing and update button label**

Find:
```tsx
      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn}>Next Turn →</button>
        </div>
      )}
```

Replace with:
```tsx
      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn} disabled={isPlaying}>
            {isPlaying ? 'Playing…' : 'Next Turn →'}
          </button>
        </div>
      )}
```

- [ ] **Step 9: Add speed toggle to the log header**

Find:
```tsx
      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
```

Replace with:
```tsx
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
```

- [ ] **Step 10: Build to check for TypeScript errors**

```
npm run build
```

Expected: build succeeds with no errors

- [ ] **Step 11: Commit**

```bash
git add src/components/BattlePage.tsx
git commit -m "feat: add turn playback to 1v1 BattlePage"
```

---

## Task 5: Final build verification

- [ ] **Step 1: Run full test suite**

```
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 2: Run production build**

```
npm run build
```

Expected: build completes with no errors or warnings

- [ ] **Step 3: Add `.superpowers/` to `.gitignore` if not present**

Check:
```bash
grep -q '.superpowers' .gitignore && echo "already present" || echo ".superpowers/" >> .gitignore
```

- [ ] **Step 4: Final commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm artifacts"
```
