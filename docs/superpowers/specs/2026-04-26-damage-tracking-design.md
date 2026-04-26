# Damage Tracking Design

**Date:** 2026-04-26  
**Scope:** Per-pokemon damage statistics across 4v4 matches — tournament standings Damage tab + end-of-match battle log summary.

---

## Goals

- Track and attribute all damage dealt during a 4v4 match to the responsible pokemon.
- Accumulate stats across all tournament matches (played, spectated, and simulated).
- Show a Damage tab on the tournament standings page ranking all 40 pokemon by total enemy damage.
- Append a damage ranking summary to the battle log at the end of every 4v4 match (tournament and single battle).
- Also track recoil and healing per pokemon as supplementary stats.

---

## Data Model

### `DamageStat` (new, `src/models/types.ts`)

```ts
export interface DamageStat {
  physical: number;  // damage dealt to enemies via physical moves
  special: number;   // damage dealt to enemies via special moves
  other: number;     // status/weather/hazard/confusion damage dealt to enemies
  recoil: number;    // self-damage from recoil
  heal: number;      // all HP recovered (drain, Recover/Roost, Grassy Terrain)
}
```

Total enemy damage for ranking = `physical + special + other`.

### `MatchDamageSummary` (new, `src/models/types.ts`)

```ts
export type MatchDamageSummary = Array<{ pokemonId: number } & DamageStat>;
```

One entry per pokemon that participated, keyed by `pokemonId`. Pokemon with all-zero stats are omitted.

### `attack` TurnEvent — add `damageClass: DamageClass`

The existing `attack` event is missing `damageClass`, making it impossible to classify physical vs. special from the log alone. Add the field where the event is emitted in `battleEngine.ts` (the `move` object is available there).

### `RR4v4MatchResult` — extend with `damageSummary?`

```ts
damageSummary?: MatchDamageSummary;
```

Optional for backward compatibility — old persisted saves without this field contribute 0 to all stats.

---

## Log Parsing: `parseDamageSummary`

**File:** `src/battle/damageSummary.ts`

**Signature:**
```ts
export function parseDamageSummary(
  log: TeamTurnEvent[],
  nameToId: Map<string, number>,
): MatchDamageSummary
```

Single sequential scan. Builds attribution context, then accumulates damage into a `Map<string, DamageStat>` keyed by pokemon name, then converts to the output array using `nameToId`.

### Attribution Context

**Hazard setters:** `hazardSetters[side]` holds `{ stealthRock?, spikes?, toxicSpikes? }` where `side` is the side the hazard *lands on* (the opponent of the setter). A `field_set` event with `side=S` (setter's side) → stored as `hazardSetters[1-S]`.

**Weather setter:** Updated on `weather_set` events.

**Status sources:** `Map<pokemonName, causerName>`. Set by:
- `status_applied` following an `attack` where `defenderName` matches → attacker is the cause.
- `status_applied` following an `ability_triggered` for a *different* pokemon immediately before it → the ability holder is the cause (covers Static, Flame Body, etc.).
- `toxic_spikes_poison` for a pokemon on side S → cause is `hazardSetters[S].toxicSpikes`.

**Confusion causers:** `Map<pokemonName, causerName>`. Set on `confused` events: check `lastReceivedAttack[pokemonName]` for the current turn. If a different pokemon attacked them this turn → that pokemon is the causer. Otherwise the confused pokemon caused its own confusion (Outrage/Petal Dance/Thrash lock expiry).

### Damage Accumulation

| Event | Category | Attributed to |
|---|---|---|
| `attack` (not missed, damage > 0) | `damageClass` from event | `attackerName` |
| `stealth_rock_damage` (side S) | `other` | `hazardSetters[S].stealthRock` |
| `spikes_damage` (side S) | `other` | `hazardSetters[S].spikes` |
| `status_damage` | `other` | `statusSources[pokemonName]` |
| `weather_damage` | `other` | `weatherSetter` |
| `confusion_hit` (causer ≠ self) | `other` | `confusionCausers[pokemonName]` |
| `confusion_hit` (self-caused) | `other` | pokemon itself, as **negative** |
| `recoil` | `recoil` | `pokemonName` (self) |
| `drain` | `heal` | `pokemonName` (self) |
| `heal` | `heal` | `pokemonName` (self) |
| `terrain_heal` | `heal` | `pokemonName` (self) |

Damage attributed to an unknown source (hazard setter not found, etc.) is silently dropped — this can only happen if the log is malformed.

---

## Integration Points

### 1. Simulated matches — `simulateUntilPlayer` in `RoundRobin4v4Page.tsx`

```ts
const battle = runFullTeamBattle(initial, mctsTeamAI, mctsTeamAI);
const nameToId = buildNameToIdMap([...aIds, ...bIds], allPokemon);
const damageSummary = parseDamageSummary(battle.log, nameToId);
current = applyMatchResult(current, {
  winner: battle.winner === 0 ? 0 : 1,
  rosterA: aIds, rosterB: bIds,
  pokemonSurvivedA: survivedA, pokemonSurvivedB: survivedB,
  damageSummary,
});
```

### 2. Spectated/played matches — `MatchView.handleContinue`

The `log: TeamTurnEvent[]` is already available from `useTeamBattleController`. Parse it and include in the `RR4v4MatchResult` passed to `onEnd`.

### 3. Single 4v4 battle — `Battle4v4Page.tsx`

Parse at match end for display only (no persistence required).

### Helper: `buildNameToIdMap`

```ts
function buildNameToIdMap(ids: number[], allPokemon: PokemonData[]): Map<string, number>
```

Builds a name → id map from the match rosters. Lives in `damageSummary.ts`. If two pokemon in the same match share a name (same-species edge case, pre-existing ambiguity), one entry wins — acceptable.

---

## UI

### End-of-match damage summary

Rendered as a styled block **below** the battle log (not as a log event). Appears on both `MatchView` (tournament) and `Battle4v4Page`. Shows all 8 match participants ranked by total enemy damage:

```
=== Damage Summary ===
1. Charizard  342  (Phys: 0 / Spec: 318 / Other: 24 | Recoil: 45 | Heal: 0)
2. Arcanine   280  (Phys: 280 / Spec: 0 / Other: 0  | Recoil: 60 | Heal: 0)
…
```

### Tournament standings — Damage tab

`RoundRobinStandingsView` gains a two-tab header: **Standings** (existing) and **Damage** (new).

The Damage tab aggregates `damageSummary` across all `state.results` entries by `pokemonId`. Shows a table of all 40 pokemon (10 teams × 4), sorted by total enemy damage descending:

| # | Pokemon | Team | Phys | Spec | Other | Total | Recoil | Heal |
|---|---------|------|------|------|-------|-------|--------|------|

- Pokemon column: sprite + formatted name.
- Matches without `damageSummary` (old saves) contribute 0.
- Table is sortable (optional future enhancement — not in scope now).

---

## Files Changed

| File | Change |
|---|---|
| `src/models/types.ts` | Add `DamageStat`, `MatchDamageSummary`; add `damageClass` to `attack` TurnEvent |
| `src/battle/battleEngine.ts` | Emit `damageClass` on `attack` events |
| `src/battle/damageSummary.ts` | **New** — `parseDamageSummary`, `buildNameToIdMap` |
| `src/tournament/roundRobin4v4Engine.ts` | Add `damageSummary?` to `RR4v4MatchResult` |
| `src/components/RoundRobin4v4Page.tsx` | Call `parseDamageSummary` in simulate + match end; pass to result; render end-of-match summary in `MatchView` |
| `src/components/RoundRobinStandingsView.tsx` | Add tab UI; add Damage tab |
| `src/components/Battle4v4Page.tsx` | Render end-of-match damage summary |

---

## Out of Scope

- Sorting the damage table by column (click-to-sort).
- Per-match damage drill-down in the standings.
- Persisting damage stats for the single-battle page.
