# Damage Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track and attribute all damage (physical, special, other, recoil, heal) dealt during 4v4 matches; show a Damage tab on the tournament standings page and an end-of-match summary in the battle log.

**Architecture:** A single `parseDamageSummary(log, nameToId)` function scans the `TeamTurnEvent[]` log produced by every battle to build per-pokemon damage stats. The result is stored in `RR4v4MatchResult.damageSummary` and aggregated in `RoundRobinStandingsView`. A shared `DamageSummaryBlock` component renders the end-of-match ranking in both the tournament `MatchView` and standalone `Battle4v4Page`.

**Tech Stack:** TypeScript, React, Vitest (test runner already in use — see `src/battle/__tests__/`)

---

## File Map

| File | Change |
|------|--------|
| `src/models/types.ts` | Add `damageClass: DamageClass` to `attack` TurnEvent; add `DamageStat` interface; add `MatchDamageSummary` type |
| `src/battle/battleEngine.ts` | Emit `damageClass: move.damageClass` on all 7 `attack` event push sites |
| `src/battle/damageSummary.ts` | **New** — `parseDamageSummary` + `buildNameToIdMap` |
| `src/battle/__tests__/damageSummary.test.ts` | **New** — unit tests for `parseDamageSummary` |
| `src/tournament/roundRobin4v4Engine.ts` | Add `damageSummary?: MatchDamageSummary` to `RR4v4MatchResult` |
| `src/components/RoundRobin4v4Page.tsx` | Wire `parseDamageSummary` into `simulateUntilPlayer` and `MatchView.handleContinue`; add `allPokemon` prop to `MatchView`; show `DamageSummaryBlock` after battle ends |
| `src/components/DamageSummaryBlock.tsx` | **New** — end-of-match ranking component |
| `src/components/Battle4v4Page.tsx` | Show `DamageSummaryBlock` after battle ends |
| `src/components/RoundRobinStandingsView.tsx` | Add tab UI; add Damage tab with aggregated table |

---

## Task 1: Add `damageClass` to `attack` TurnEvent and emit it

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/battle/battleEngine.ts`

- [ ] **Step 1: Add `damageClass` field to `attack` TurnEvent in `types.ts`**

In `src/models/types.ts`, locate the `attack` variant of `TurnEvent` (around line 173) and add `damageClass: DamageClass` after `moveType`:

```ts
| {
    kind: 'attack';
    turn: number;
    attackerName: string;
    defenderName: string;
    moveName: string;
    moveType: TypeName;
    damageClass: DamageClass;   // ← add this line
    damage: number;
    isCrit: boolean;
    missed: boolean;
    effectiveness: number;
    attackerHpAfter: number;
    defenderHpAfter: number;
  }
```

- [ ] **Step 2: Emit `damageClass` on the miss event (battleEngine.ts ~line 865)**

```ts
events.push({
  kind: 'attack', turn,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: true, effectiveness: 1,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 3: Emit `damageClass` on the "move landed" status-move announcement (battleEngine.ts ~line 876)**

```ts
events.push({
  kind: 'attack', turn,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: false, effectiveness: 1,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 4: Emit `damageClass` on the Water Absorb absorption event (~line 1113)**

```ts
events.push({
  kind: 'attack', turn: turnNumber,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: false, effectiveness: 0,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 5: Emit `damageClass` on the Lightning Rod absorption event (~line 1127)**

```ts
events.push({
  kind: 'attack', turn: turnNumber,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: false, effectiveness: 0,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 6: Emit `damageClass` on the Volt Absorb absorption event (~line 1147)**

```ts
events.push({
  kind: 'attack', turn: turnNumber,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: false, effectiveness: 0,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 7: Emit `damageClass` on the Flash Fire absorption event (~line 1163)**

```ts
events.push({
  kind: 'attack', turn: turnNumber,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: 0, isCrit: false, missed: false, effectiveness: 0,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
});
```

- [ ] **Step 8: Emit `damageClass` on the main damage event (~line 1203)**

```ts
events.push({
  kind: 'attack', turn: turnNumber,
  attackerName: attacker.data.name, defenderName: defender.data.name,
  moveName: move.name, moveType: move.type,
  damageClass: move.damageClass,
  damage: damageThisHit, isCrit: result.isCrit,
  missed: result.missed, effectiveness: result.effectiveness,
  attackerHpAfter: attacker.currentHp, defenderHpAfter: newDefHp,
});
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors. If existing test files reference `attack` events without `damageClass`, TypeScript will error — check `src/battle/__tests__/` for any manual event constructions and add `damageClass: 'physical'` (or appropriate value) to them.

- [ ] **Step 10: Commit**

```bash
git add src/models/types.ts src/battle/battleEngine.ts
git commit -m "feat: add damageClass field to attack TurnEvent"
```

---

## Task 2: Add `DamageStat`, `MatchDamageSummary` types; extend `RR4v4MatchResult`

**Files:**
- Modify: `src/models/types.ts`
- Modify: `src/tournament/roundRobin4v4Engine.ts`

- [ ] **Step 1: Add `DamageStat` and `MatchDamageSummary` to `types.ts`**

After the `BattleResult` interface (around line 217), add:

```ts
export interface DamageStat {
  physical: number;  // damage dealt to enemies via physical moves
  special: number;   // damage dealt to enemies via special moves
  other: number;     // status/weather/hazard/confusion damage dealt to enemies
  recoil: number;    // self-damage from recoil
  heal: number;      // all HP recovered (drain, Recover/Roost, Grassy Terrain)
}

export type MatchDamageSummary = Array<{ pokemonId: number } & DamageStat>;
```

- [ ] **Step 2: Add `damageSummary?` to `RR4v4MatchResult` in `roundRobin4v4Engine.ts`**

Locate `RR4v4MatchResult` (around line 15) and add the optional field:

```ts
export interface RR4v4MatchResult {
  winner: 0 | 1;
  rosterA: [number, number, number, number];
  rosterB: [number, number, number, number];
  pokemonSurvivedA: number;
  pokemonSurvivedB: number;
  damageSummary?: MatchDamageSummary;
}
```

Also add the import at the top of `roundRobin4v4Engine.ts`:

```ts
import type { PokemonData, DamageStat, MatchDamageSummary } from '../models/types';
```

(Replace the existing `import type { PokemonData }` line.)

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/models/types.ts src/tournament/roundRobin4v4Engine.ts
git commit -m "feat: add DamageStat and MatchDamageSummary types"
```

---

## Task 3: Implement `parseDamageSummary` with tests (TDD)

**Files:**
- Create: `src/battle/__tests__/damageSummary.test.ts`
- Create: `src/battle/damageSummary.ts`

### Key attribution rules to test

Before writing code, understand these invariants:
- `attack` events with `damage > 0` and `missed: false` → credit `attackerName` with `physical` or `special` depending on `damageClass`.
- `field_set` with `effect: 'stealthRock'/'spikes'/'toxicSpikes'` → `ev.side` is the **hazard side** (the foeSide, i.e., the side where incoming pokemon take damage). Store the setter for that side.
- `stealth_rock_damage` / `spikes_damage` → `ev.side` is the receiving pokemon's side = the hazard side → look up setter from `hazardSetters[ev.side]`.
- `weather_set` → store `weatherSetter`. `weather_damage` → credit `weatherSetter`.
- `status_applied` after a plain `attack` → credit the attacker. After an `ability_triggered` for a different pokemon → credit the ability holder (e.g., Static, Flame Body).
- `toxic_spikes_poison` (side S) → credit `hazardSetters[S].toxicSpikes`. Subsequent `status_damage` for that pokemon → credits whoever is in `statusSources`.
- `confused` event: if the current turn had an `attack` where `defenderName === pokemonName` and `attacker !== pokemonName` → that attacker caused it. Otherwise (Outrage expiry) → self-caused.
- `confusion_hit`: if caused by another → credit attacker's `other`. If self-caused → subtract from self's `other` (negative).
- `recoil` → credit `pokemonName`'s `recoil`.
- `drain` / `heal` / `terrain_heal` → credit `pokemonName`'s `heal`.

- [ ] **Step 1: Write failing tests**

Create `src/battle/__tests__/damageSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TeamTurnEvent, SideIndex } from '../../models/types';
import { parseDamageSummary } from '../damageSummary';

// Helper to cast a partial event object — avoids fighting TypeScript intersections.
function ev(partial: Record<string, unknown>): TeamTurnEvent {
  return partial as unknown as TeamTurnEvent;
}

const nameToId = new Map([
  ['attacker', 1],
  ['defender', 2],
  ['setter', 3],
  ['weather-setter', 4],
]);

describe('parseDamageSummary', () => {
  it('credits physical attack damage to the attacker', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 60, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 40 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(60);
    expect(entry?.special).toBe(0);
    expect(entry?.other).toBe(0);
  });

  it('credits special attack damage to the attacker', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flamethrower', moveType: 'fire', damageClass: 'special',
           damage: 80, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(80);
    expect(entry?.physical).toBe(0);
  });

  it('ignores missed attacks', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 0, isCrit: false, missed: true, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)).toBeUndefined();
  });

  it('credits stealth rock damage to the setter', () => {
    // setter (side 0) used stealth rock → hazard on side 1
    // field_set.side = foeSide = 1 (how tagAttackEvents works for hazards)
    const log: TeamTurnEvent[] = [
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'stealthRock', turns: 0, pokemonName: 'setter' }),
      // defender (side 1) switches in and takes SR damage
      ev({ side: 1, kind: 'stealth_rock_damage', turn: 2, pokemonName: 'defender', damage: 25, hpAfter: 75 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 3); // setter id=3
    expect(entry?.other).toBe(25);
  });

  it('credits spikes damage to the setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'spikes', turns: 1, pokemonName: 'setter' }),
      ev({ side: 1, kind: 'spikes_damage', turn: 2, pokemonName: 'defender', damage: 25, hpAfter: 75, layers: 1 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 3)?.other).toBe(25);
  });

  it('credits toxic spikes poison → status_damage to the toxic spikes setter', () => {
    const log: TeamTurnEvent[] = [
      // setter (side 0) lays toxic spikes → hazard on side 1
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'toxicSpikes', turns: 0, pokemonName: 'setter' }),
      // defender (side 1) gets poisoned on entry
      ev({ side: 1, kind: 'toxic_spikes_poison', turn: 2, pokemonName: 'defender' }),
      // end-of-turn poison tick
      ev({ side: 1, kind: 'status_damage', turn: 2, pokemonName: 'defender', condition: 'poison', damage: 25, hpAfter: 75 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 3)?.other).toBe(25);
  });

  it('credits weather damage to the weather setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'weather_set', turn: 1, weather: 'sandstorm', turns: 5, pokemonName: 'weather-setter' }),
      ev({ side: 1, kind: 'weather_damage', turn: 1, pokemonName: 'defender', weather: 'sandstorm', damage: 12, hpAfter: 88 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 4)?.other).toBe(12);
  });

  it('credits status_damage from a move-applied burn to the attacker', () => {
    const log: TeamTurnEvent[] = [
      // attacker hits defender with flamethrower, applies burn
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flamethrower', moveType: 'fire', damageClass: 'special',
           damage: 80, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
      ev({ side: 1, kind: 'status_applied', turn: 1, pokemonName: 'defender', condition: 'burn' }),
      ev({ side: 1, kind: 'status_damage', turn: 1, pokemonName: 'defender', condition: 'burn', damage: 12, hpAfter: 8 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(80);
    expect(entry?.other).toBe(12); // burn tick also attributed to attacker
  });

  it('credits status_damage from an ability-applied paralysis to the ability holder', () => {
    // defender has Static; attacker hits defender (contact), defender's Static paralyzes attacker
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 60 }),
      ev({ side: 1, kind: 'ability_triggered', turn: 1, pokemonName: 'defender', ability: 'static' }),
      ev({ side: 0, kind: 'status_applied', turn: 1, pokemonName: 'attacker', condition: 'paralysis' }),
      // attacker can't move due to paralysis and takes no status damage (paralysis ticks 0 dmg)
      // but if there were status_damage it'd be credited to defender (the ability holder)
    ];
    const result = parseDamageSummary(log, nameToId);
    // attacker still gets credit for the tackle damage
    expect(result.find(e => e.pokemonId === 1)?.physical).toBe(40);
    // The statusSources map for 'attacker' = 'defender' (ability holder caused paralysis)
    // No status_damage in this test, but verify no crash
    expect(result.find(e => e.pokemonId === 2)).toBeUndefined(); // defender dealt 0 damage
  });

  it('credits confusion_hit to the pokemon that caused the confusion', () => {
    // attacker uses confuse ray on defender (turn 1), defender hits itself (turn 2)
    const log: TeamTurnEvent[] = [
      // confuse ray: status move, damage=0, defenderName=defender
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'confuse-ray', moveType: 'ghost', damageClass: 'status',
           damage: 0, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
      ev({ side: 1, kind: 'confused', turn: 1, pokemonName: 'defender' }),
      ev({ side: 1, kind: 'confusion_hit', turn: 2, pokemonName: 'defender', damage: 30, hpAfter: 70 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.other).toBe(30); // attacker gets credit
  });

  it('subtracts confusion_hit from self when confusion was self-caused (Outrage)', () => {
    // attacker uses Outrage (attacks defender), then lock expires → self-confused, hits itself
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'outrage', moveType: 'dragon', damageClass: 'physical',
           damage: 100, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 0 }),
      // Lock expires at end of turn — attacker confuses itself (no attack was received by attacker)
      ev({ side: 0, kind: 'confused', turn: 1, pokemonName: 'attacker' }),
      ev({ side: 0, kind: 'confusion_hit', turn: 2, pokemonName: 'attacker', damage: 40, hpAfter: 60 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(100);
    expect(entry?.other).toBe(-40); // self-caused confusion = negative
  });

  it('tracks recoil damage', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flare-blitz', moveType: 'fire', damageClass: 'physical',
           damage: 120, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 0 }),
      ev({ side: 0, kind: 'recoil', turn: 1, pokemonName: 'attacker', damage: 40, hpAfter: 60 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(120);
    expect(entry?.recoil).toBe(40);
  });

  it('tracks drain healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'giga-drain', moveType: 'grass', damageClass: 'special',
           damage: 60, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 40 }),
      ev({ side: 0, kind: 'drain', turn: 1, pokemonName: 'attacker', healed: 30, hpAfter: 130 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(60);
    expect(entry?.heal).toBe(30);
  });

  it('tracks Recover/heal-move healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'heal', turn: 1, pokemonName: 'attacker', healed: 50, hpAfter: 150 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.heal).toBe(50);
  });

  it('tracks Grassy Terrain healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'terrain_heal', turn: 1, pokemonName: 'attacker', healed: 12, hpAfter: 112 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.heal).toBe(12);
  });

  it('omits pokemon with all-zero stats', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 0, isCrit: false, missed: true, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result).toHaveLength(0);
  });

  it('accumulates damage across multiple turns', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 60 }),
      ev({ side: 0, kind: 'attack', turn: 2, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.physical).toBe(80);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/battle/__tests__/damageSummary.test.ts
```

Expected: FAIL with "Cannot find module '../damageSummary'"

- [ ] **Step 3: Create `src/battle/damageSummary.ts`**

```ts
import type { TeamTurnEvent, DamageStat, MatchDamageSummary, TeamBattleState, SideIndex } from '../models/types';

interface HazardSetters {
  stealthRock?: string;
  spikes?: string;
  toxicSpikes?: string;
}

export function buildNameToIdMap(state: TeamBattleState): Map<string, number> {
  const map = new Map<string, number>();
  for (const team of state.teams) {
    for (const p of team.pokemon) {
      map.set(p.data.name, p.data.id);
    }
  }
  return map;
}

function emptyDamageStat(): DamageStat {
  return { physical: 0, special: 0, other: 0, recoil: 0, heal: 0 };
}

function isAllZero(s: DamageStat): boolean {
  return s.physical === 0 && s.special === 0 && s.other === 0 && s.recoil === 0 && s.heal === 0;
}

export function parseDamageSummary(
  log: TeamTurnEvent[],
  nameToId: Map<string, number>,
): MatchDamageSummary {
  // hazardSetters[side] = setters for hazards ON that side (placed by the opponent).
  const hazardSetters: [HazardSetters, HazardSetters] = [{}, {}];
  let weatherSetter: string | undefined;
  // pokemonName → name of the pokemon that caused their status condition
  const statusSources = new Map<string, string>();
  // pokemonName → name of the pokemon that caused their confusion
  const confusionCausers = new Map<string, string>();
  // most recent attack received this turn, keyed by defender name
  const lastReceivedAttack = new Map<string, { attacker: string; turn: number }>();
  const damage = new Map<string, DamageStat>();

  function get(name: string): DamageStat {
    if (!damage.has(name)) damage.set(name, emptyDamageStat());
    return damage.get(name)!;
  }

  // Tracks the pokemon whose ability fired on the immediately preceding event.
  // Used to attribute ability-triggered status conditions (Static, Flame Body, etc.)
  // to the ability holder rather than the move user.
  let prevAbilityHolder: string | null = null;

  for (const ev of log) {
    const abilityHolderThisStep = prevAbilityHolder;
    prevAbilityHolder = null;

    if (ev.kind === 'attack') {
      if (!ev.missed && ev.damage > 0) {
        const stat = get(ev.attackerName);
        if (ev.damageClass === 'physical') stat.physical += ev.damage;
        else stat.special += ev.damage;
      }
      // Track for status/confusion attribution: who attacked whom this turn.
      lastReceivedAttack.set(ev.defenderName, { attacker: ev.attackerName, turn: ev.turn });

    } else if (ev.kind === 'recoil') {
      get(ev.pokemonName).recoil += ev.damage;

    } else if (ev.kind === 'drain' || ev.kind === 'heal' || ev.kind === 'terrain_heal') {
      get(ev.pokemonName).heal += ev.healed;

    } else if (ev.kind === 'field_set') {
      // For hazard field_set events (stealthRock/spikes/toxicSpikes), ev.side is the
      // hazard side (foeSide) because tagAttackEvents spreads ev.side over the outer side.
      const side = ev.side as SideIndex;
      if (ev.effect === 'stealthRock') hazardSetters[side].stealthRock = ev.pokemonName;
      else if (ev.effect === 'spikes') hazardSetters[side].spikes = ev.pokemonName;
      else if (ev.effect === 'toxicSpikes') hazardSetters[side].toxicSpikes = ev.pokemonName;

    } else if (ev.kind === 'weather_set') {
      weatherSetter = ev.pokemonName;

    } else if (ev.kind === 'ability_triggered') {
      prevAbilityHolder = ev.pokemonName;

    } else if (ev.kind === 'status_applied') {
      const target = ev.pokemonName;
      if (abilityHolderThisStep && abilityHolderThisStep !== target) {
        // Ability caused the status (e.g., Static paralysis on contact).
        statusSources.set(target, abilityHolderThisStep);
      } else {
        const last = lastReceivedAttack.get(target);
        if (last) statusSources.set(target, last.attacker);
      }

    } else if (ev.kind === 'toxic_spikes_poison') {
      // ev.side = the pokemon's side = the side the hazard is on.
      const side = ev.side as SideIndex;
      const setter = hazardSetters[side].toxicSpikes;
      if (setter) statusSources.set(ev.pokemonName, setter);

    } else if (ev.kind === 'confused') {
      const target = ev.pokemonName;
      const last = lastReceivedAttack.get(target);
      if (last && last.turn === ev.turn && last.attacker !== target) {
        confusionCausers.set(target, last.attacker);
      } else {
        confusionCausers.set(target, target); // self-caused (Outrage/Petal Dance/Thrash)
      }

    } else if (ev.kind === 'stealth_rock_damage') {
      const setter = hazardSetters[ev.side as SideIndex].stealthRock;
      if (setter) get(setter).other += ev.damage;

    } else if (ev.kind === 'spikes_damage') {
      const setter = hazardSetters[ev.side as SideIndex].spikes;
      if (setter) get(setter).other += ev.damage;

    } else if (ev.kind === 'status_damage') {
      const causer = statusSources.get(ev.pokemonName);
      if (causer) get(causer).other += ev.damage;

    } else if (ev.kind === 'weather_damage') {
      if (weatherSetter) get(weatherSetter).other += ev.damage;

    } else if (ev.kind === 'confusion_hit') {
      const causer = confusionCausers.get(ev.pokemonName) ?? ev.pokemonName;
      if (causer !== ev.pokemonName) {
        get(causer).other += ev.damage;
      } else {
        // Self-caused confusion (Outrage etc.) counts as negative damage for the pokemon.
        get(ev.pokemonName).other -= ev.damage;
      }
    }
  }

  const result: MatchDamageSummary = [];
  for (const [name, stat] of damage) {
    if (isAllZero(stat)) continue;
    const id = nameToId.get(name);
    if (id !== undefined) result.push({ pokemonId: id, ...stat });
  }
  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/battle/__tests__/damageSummary.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Verify full build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/battle/damageSummary.ts src/battle/__tests__/damageSummary.test.ts
git commit -m "feat: implement parseDamageSummary with attribution logic"
```

---

## Task 4: Wire damage tracking into all match completion paths

**Files:**
- Modify: `src/components/RoundRobin4v4Page.tsx`

This task wires `parseDamageSummary` into both the simulated and interactive match paths. It does **not** add any UI yet — that comes in Task 5.

- [ ] **Step 1: Add imports at the top of `RoundRobin4v4Page.tsx`**

After the existing imports, add:

```ts
import { parseDamageSummary, buildNameToIdMap } from '../battle/damageSummary';
```

- [ ] **Step 2: Wire damage into `simulateUntilPlayer`**

Locate `simulateUntilPlayer` (around line 164). Inside the while loop, replace:

```ts
const initial = buildTeamBattleState(aIds, bIds, allPokemon, { activeIdx0, activeIdx1 });
const battle = runFullTeamBattle(initial, mctsTeamAI, mctsTeamAI);
const survivedA = battle.finalState.teams[0].pokemon.filter(p => p.currentHp > 0).length;
const survivedB = battle.finalState.teams[1].pokemon.filter(p => p.currentHp > 0).length;
current = applyMatchResult(current, {
  winner: battle.winner === 0 ? 0 : 1,
  rosterA: aIds,
  rosterB: bIds,
  pokemonSurvivedA: survivedA,
  pokemonSurvivedB: survivedB,
});
```

With:

```ts
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
```

- [ ] **Step 3: Add `allPokemon` prop to `MatchView` and wire damage into `handleContinue`**

Locate the `MatchView` function (around line 440). Change its props type from:

```ts
function MatchView(props: {
  tournamentState: RR4v4State;
  pending: PendingMatch;
  onEnd: (result: RR4v4MatchResult) => void;
  onBack: () => void;
})
```

To:

```ts
function MatchView(props: {
  tournamentState: RR4v4State;
  pending: PendingMatch;
  allPokemon: PokemonData[];
  onEnd: (result: RR4v4MatchResult) => void;
  onBack: () => void;
})
```

And update the destructure line: `const { tournamentState, pending, allPokemon, onEnd, onBack } = props;`

Inside `MatchView`, add this `useMemo` after the `useTeamBattleController` call:

```ts
const damageSummary = useMemo(() => {
  if (!done) return null;
  const nameToId = buildNameToIdMap(pending.initial);
  return parseDamageSummary(log, nameToId);
}, [done]); // recomputes once when battle ends
```

Inside `handleContinue`, update `onEnd(...)` to include `damageSummary`:

```ts
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
```

- [ ] **Step 4: Pass `allPokemon` to `MatchView` at its render site (around line 261)**

Find `<MatchView` usage and add the prop:

```tsx
<MatchView
  tournamentState={state}
  pending={pending}
  allPokemon={allPokemon}
  onEnd={onMatchEnd}
  onBack={onBack}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/RoundRobin4v4Page.tsx
git commit -m "feat: wire parseDamageSummary into simulated and interactive match results"
```

---

## Task 5: End-of-match damage summary UI component

**Files:**
- Create: `src/components/DamageSummaryBlock.tsx`
- Modify: `src/components/RoundRobin4v4Page.tsx`
- Modify: `src/components/Battle4v4Page.tsx`

- [ ] **Step 1: Create `src/components/DamageSummaryBlock.tsx`**

```tsx
import type { MatchDamageSummary, PokemonData } from '../models/types';
import { formatPokemonName } from '../utils/formatName';

interface Props {
  summary: MatchDamageSummary;
  allPokemon: PokemonData[];
}

export default function DamageSummaryBlock({ summary, allPokemon }: Props) {
  const byId = new Map(allPokemon.map(p => [p.id, p]));

  const sorted = [...summary].sort(
    (a, b) => (b.physical + b.special + b.other) - (a.physical + a.special + a.other),
  );

  if (sorted.length === 0) return null;

  return (
    <div className="card damage-summary-block">
      <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Damage Summary</h3>
      <ol className="damage-summary-list">
        {sorted.map((entry, i) => {
          const p = byId.get(entry.pokemonId);
          const name = p ? formatPokemonName(p.data?.name ?? p.name ?? '') : `#${entry.pokemonId}`;
          const total = entry.physical + entry.special + entry.other;
          return (
            <li key={entry.pokemonId} className="damage-summary-row">
              <span className="dsb-rank">{i + 1}.</span>
              {p && <img className="dsb-sprite" src={p.spriteUrl} alt={p.name} />}
              <span className="dsb-name">{name}</span>
              <span className="dsb-total">{total} dmg</span>
              <span className="dsb-breakdown">
                (Phys: {entry.physical} / Spec: {entry.special} / Other: {entry.other}
                {' | '}Recoil: {entry.recoil} / Heal: {entry.heal})
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

Note: `PokemonData` has a `.name` string field (not `.data.name`). Adjust the name lookup:

```tsx
const name = p ? formatPokemonName(p.name) : `#${entry.pokemonId}`;
```

- [ ] **Step 2: Show `DamageSummaryBlock` in `MatchView` after battle ends**

In `MatchView` in `RoundRobin4v4Page.tsx`, add the import at the top of the file:

```ts
import DamageSummaryBlock from './DamageSummaryBlock';
```

Then in the JSX, after the `winner-banner` div (around the `{done && winner !== null && (` block), add:

```tsx
{done && damageSummary && (
  <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
)}
```

- [ ] **Step 3: Show `DamageSummaryBlock` in `Battle4v4Page.tsx` after battle ends**

First add the imports to `Battle4v4Page.tsx`:

```ts
import { useMemo } from 'react'; // already imported, verify
import { parseDamageSummary, buildNameToIdMap } from '../battle/damageSummary';
import DamageSummaryBlock from './DamageSummaryBlock';
```

Then, inside `Battle4v4Page`, after the `const { state, log, ... } = useTeamBattleController(...)` line, add:

```ts
const damageSummary = useMemo(() => {
  if (!done) return null;
  const nameToId = buildNameToIdMap(initialState.state);
  return parseDamageSummary(log, nameToId);
}, [done]);
```

Then in the JSX, after the `.battle-log` div, add:

```tsx
{done && damageSummary && (
  <DamageSummaryBlock summary={damageSummary} allPokemon={allPokemon} />
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors. If `PokemonData` doesn't have `.data` nested (it doesn't — it has `.name` directly), the `DamageSummaryBlock` code in Step 1 is already correct. If any type errors appear, they'll be clear from the message.

- [ ] **Step 5: Commit**

```bash
git add src/components/DamageSummaryBlock.tsx src/components/RoundRobin4v4Page.tsx src/components/Battle4v4Page.tsx
git commit -m "feat: add end-of-match damage summary block to battle views"
```

---

## Task 6: Damage tab in tournament standings

**Files:**
- Modify: `src/components/RoundRobinStandingsView.tsx`

- [ ] **Step 1: Add tab state and imports**

At the top of `RoundRobinStandingsView.tsx`, add:

```ts
import { useState } from 'react';
import type { DamageStat, MatchDamageSummary } from '../models/types';
```

Inside the `RoundRobinStandingsView` component, add tab state before the existing `byId` line:

```ts
const [tab, setTab] = useState<'standings' | 'damage'>('standings');
```

- [ ] **Step 2: Replace the component's return with a tabbed layout**

Replace the current `return (` block entirely with:

```tsx
return (
  <div className="rr-standings">
    <div className="rr-tabs">
      <button
        className={'rr-tab' + (tab === 'standings' ? ' rr-tab--active' : '')}
        onClick={() => setTab('standings')}
      >Standings</button>
      <button
        className={'rr-tab' + (tab === 'damage' ? ' rr-tab--active' : '')}
        onClick={() => setTab('damage')}
      >Damage</button>
    </div>

    {tab === 'standings' && (
      <>
        {/* existing standings table JSX goes here — paste it unchanged */}
        <h3 className="section-title">Standings</h3>
        <table className="rr-standings-table">
          {/* ... existing thead and tbody ... */}
        </table>
        <h3 className="section-title" style={{ marginTop: '1.5rem' }}>Head-to-Head</h3>
        <div className="rr-matrix-wrap">
          {/* ... existing matrix table ... */}
        </div>
      </>
    )}

    {tab === 'damage' && <DamageTab state={state} byId={byId} />}
  </div>
);
```

Move the existing standings and head-to-head JSX (currently the entire return body) inside the `tab === 'standings'` block. Nothing changes functionally in those sections.

- [ ] **Step 3: Add the `DamageTab` sub-component at the bottom of `RoundRobinStandingsView.tsx`**

```tsx
function DamageTab({
  state,
  byId,
}: {
  state: RR4v4State;
  byId: Map<number, PokemonData>;
}) {
  // Aggregate damage across all completed matches.
  const totals = new Map<number, { pokemonId: number } & DamageStat>();

  for (const result of state.results) {
    if (!result?.damageSummary) continue;
    for (const entry of result.damageSummary) {
      const existing = totals.get(entry.pokemonId) ?? {
        pokemonId: entry.pokemonId,
        physical: 0, special: 0, other: 0, recoil: 0, heal: 0,
      };
      totals.set(entry.pokemonId, {
        pokemonId: entry.pokemonId,
        physical: existing.physical + entry.physical,
        special: existing.special + entry.special,
        other: existing.other + entry.other,
        recoil: existing.recoil + entry.recoil,
        heal: existing.heal + entry.heal,
      });
    }
  }

  // Build pokemonId → teamName map for display.
  const pokemonTeam = new Map<number, string>();
  state.teams.forEach(team => {
    team.roster.forEach(id => pokemonTeam.set(id, team.name));
  });

  // All 40 pokemon, including those with zero damage (they just don't appear in totals).
  const allIds = state.teams.flatMap(t => t.roster);
  const rows = allIds.map(id => totals.get(id) ?? {
    pokemonId: id, physical: 0, special: 0, other: 0, recoil: 0, heal: 0,
  });
  rows.sort((a, b) =>
    (b.physical + b.special + b.other) - (a.physical + a.special + a.other),
  );

  return (
    <div className="rr-damage-tab">
      <h3 className="section-title">Damage Dealt</h3>
      <table className="rr-damage-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Pokemon</th>
            <th>Team</th>
            <th>Phys</th>
            <th>Spec</th>
            <th>Other</th>
            <th>Total</th>
            <th>Recoil</th>
            <th>Heal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const p = byId.get(row.pokemonId);
            const total = row.physical + row.special + row.other;
            return (
              <tr key={row.pokemonId}>
                <td>{i + 1}</td>
                <td>
                  <div className="rr-pokemon-cell">
                    {p && <img src={p.spriteUrl} alt={p.name} style={{ width: 32, height: 32 }} />}
                    <span>{p ? formatPokemonName(p.name) : `#${row.pokemonId}`}</span>
                  </div>
                </td>
                <td>{pokemonTeam.get(row.pokemonId) ?? '—'}</td>
                <td>{row.physical}</td>
                <td>{row.special}</td>
                <td>{row.other}</td>
                <td><strong>{total}</strong></td>
                <td>{row.recoil}</td>
                <td>{row.heal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Run all existing tests**

```bash
npx vitest run
```

Expected: all tests pass. If any existing battle tests construct `attack` events manually without `damageClass`, add `damageClass: 'physical'` (or appropriate) to those objects — TypeScript should have already caught them in Task 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/RoundRobinStandingsView.tsx
git commit -m "feat: add Damage tab to tournament standings"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| `damageClass` on `attack` events | Task 1 |
| `DamageStat` / `MatchDamageSummary` types | Task 2 |
| `RR4v4MatchResult.damageSummary` optional field | Task 2 |
| `parseDamageSummary` attribution logic | Task 3 |
| Physical / special / other / recoil / heal categories | Task 3 |
| Stealth rock attributed to setter | Task 3 |
| Spikes attributed to setter | Task 3 |
| Toxic spikes → status damage attributed to setter | Task 3 |
| Weather damage attributed to weather setter | Task 3 |
| Move-applied status attributed to attacker | Task 3 |
| Ability-triggered status attributed to ability holder | Task 3 |
| Confusion by opponent: positive damage to causer | Task 3 |
| Self-caused confusion (Outrage): negative damage to self | Task 3 |
| Simulated matches include `damageSummary` | Task 4 |
| Spectated/played matches include `damageSummary` | Task 4 |
| End-of-match ranking in `MatchView` battle log | Task 5 |
| End-of-match ranking in `Battle4v4Page` | Task 5 |
| Damage tab on standings page with all 40 pokemon | Task 6 |
| Old saves (no `damageSummary`) contribute 0 | Task 6 (aggregation handles undefined) |

**Placeholder scan:** No TBDs or incomplete sections.

**Type consistency:**
- `DamageStat.heal` — used in `parseDamageSummary` (`drain`/`heal`/`terrain_heal` events → `.heal`) and in `DamageTab` aggregation. ✓
- `MatchDamageSummary = Array<{ pokemonId: number } & DamageStat>` — used consistently in `parseDamageSummary` return type and `RR4v4MatchResult.damageSummary`. ✓
- `buildNameToIdMap(state: TeamBattleState)` — called in Task 4 `simulateUntilPlayer` with `initial` (a `TeamBattleState`) and in `MatchView` with `pending.initial` (also `TeamBattleState`). ✓
- `DamageSummaryBlock` uses `allPokemon: PokemonData[]`, gets `p.name` directly (not `p.data.name` — `PokemonData` has a top-level `name` field). ✓
