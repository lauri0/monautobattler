# Statistics Page — Damage Tab

**Date:** 2026-04-28  
**Status:** Approved

## Overview

Add a "Damage" tab to the Statistics page that shows cumulative per-pokemon damage percentages aggregated across all completed 4v4 Round Robin tournaments. Stats are saved when the user presses "Start New Tournament" after a finished tournament.

## Data Model

New file: `src/persistence/damageStatsStorage.ts`

```typescript
interface PokemonDamageAccum {
  physSum: number;     // running sum of per-tournament avg phys%
  specSum: number;
  otherSum: number;
  totalSum: number;
  recoilSum: number;
  healSum: number;
  tournamentCount: number; // tournaments this pokemon appeared in
}
type DamageStatsRecord = Record<number, PokemonDamageAccum>;
```

Stored in a dedicated localStorage key. Display value for any column: `sum / tournamentCount`, formatted as `(value).toFixed(1) + '%'`.

Running average update on each new finished tournament:
- `newSum = prevSum + thisTournamentAvg`
- `newCount = prevCount + 1`

This is equivalent to the weighted formula `newAvg = (prevAvg * prevCount + latestAvg) / (prevCount + 1)`.

The per-tournament average computation (same math as `DamageTab` in `RoundRobinStandingsView`) lives inside this module as a private helper that takes `RR4v4State` and returns `Map<pokemonId, { phys, spec, other, total, recoil, heal }>`.

Exported API:
- `getDamageStats(): DamageStatsRecord`
- `recordTournamentDamage(state: RR4v4State): void`
- `clearDamageStats(): void`

## Save Trigger

`RoundRobin4v4Page.tsx` gets a new `startNewTournament()` function distinct from `abandonTournament()`:

- `abandonTournament()` — unchanged, shows confirm dialog, used mid-tournament
- `startNewTournament()` — no confirm dialog (tournament already finished), calls `recordTournamentDamage(state)` then clears tournament storage and resets local React state

`FinishedView` receives `onStartNew` prop (replacing `onReset`) wired to `startNewTournament()`.

Stats are saved **only** for completed tournaments (phase === 'finished'). Abandoning a mid-tournament does not save damage stats.

## Statistics Page — Damage Tab

`StatisticsPage.tsx` gains a new `'damage'` tab.

**Data source:** `getDamageStats()`  
**Filter:** pokemon with `tournamentCount > 0` AND not disabled (consistent with other tabs)  
**Sort:** descending by avg Total%

**Columns:**

| # | Pokemon | Phys% | Spec% | Other% | Total% | Recoil% | Heal% | Tournaments |
|---|---------|-------|-------|--------|--------|---------|-------|-------------|

- All `%` columns: `(sum / tournamentCount).toFixed(1) + '%'`
- Tournaments column: raw `tournamentCount` integer
- No "Team" column — pokemon may appear on different teams across tournaments

## Files Changed

| File | Change |
|------|--------|
| `src/persistence/damageStatsStorage.ts` | New — storage module |
| `src/components/RoundRobin4v4Page.tsx` | Add `startNewTournament()`, update `FinishedView` props |
| `src/components/StatisticsPage.tsx` | Add `'damage'` tab |
| `src/components/StatisticsPage.css` | Minor style additions if needed |
