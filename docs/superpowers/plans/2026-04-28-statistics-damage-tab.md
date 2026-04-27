# Statistics Damage Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Damage" tab to the Statistics page that shows per-pokemon average damage % aggregated across all completed 4v4 Round Robin tournaments.

**Architecture:** A new `damageStatsStorage.ts` module stores running sums + tournament counts per pokemon in localStorage. When the user resets a finished tournament, `recordTournamentDamage` computes per-tournament averages and merges them into the stored sums. The Statistics page reads these sums and displays averages (sum / count).

**Tech Stack:** React 19, TypeScript, Vitest, localStorage

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/persistence/damageStatsStorage.ts` | Storage type, pure avg computation, CRUD over localStorage |
| Create | `src/persistence/__tests__/damageStatsStorage.test.ts` | Unit tests for `computeTournamentAverages` |
| Modify | `src/components/RoundRobin4v4Page.tsx` | Add `startNewTournament()`, update `FinishedView` props |
| Modify | `src/components/StatisticsPage.tsx` | Add `'damage'` tab |

---

### Task 1: Storage module — tests first

**Files:**
- Create: `src/persistence/__tests__/damageStatsStorage.test.ts`
- Create: `src/persistence/damageStatsStorage.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/persistence/__tests__/damageStatsStorage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { RR4v4State } from '../../tournament/roundRobin4v4Engine';
import { computeTournamentAverages } from '../damageStatsStorage';

function makeState(overrides: Partial<RR4v4State> = {}): RR4v4State {
  return {
    teams: [
      { name: 'A', roster: [1, 2, 3, 4], isPlayer: false },
      { name: 'B', roster: [5, 6, 7, 8], isPlayer: false },
    ],
    schedule: [{ a: 0, b: 1 }],
    results: [null],
    currentMatchIdx: 0,
    mode: 'spectate',
    phase: 'finished',
    draft: null,
    ...overrides,
  };
}

describe('computeTournamentAverages', () => {
  it('returns empty map when no results have a damageSummary', () => {
    const state = makeState({ results: [null] });
    expect(computeTournamentAverages(state).size).toBe(0);
  });

  it('returns empty map when result has no damageSummary field', () => {
    const state = makeState({
      results: [{
        winner: 0, rosterA: [1,2,3,4], rosterB: [5,6,7,8],
        pokemonSurvivedA: 2, pokemonSurvivedB: 0,
      }],
    });
    expect(computeTournamentAverages(state).size).toBe(0);
  });

  it('computes correct % for a single match', () => {
    // total battle damage = 100 + 100 = 200
    // pokemon 1: physical = 100 → 50%, all others 0
    // pokemon 5: special  = 100 → 50%, all others 0
    // pokemon 2,3,4,6,7,8: count=1, all zeros
    const state = makeState({
      results: [{
        winner: 0, rosterA: [1,2,3,4], rosterB: [5,6,7,8],
        pokemonSurvivedA: 2, pokemonSurvivedB: 0,
        damageSummary: [
          { pokemonId: 1, physical: 100, special: 0, other: 0, recoil: 10, heal: 0 },
          { pokemonId: 5, physical: 0,   special: 100, other: 0, recoil: 0,  heal: 20 },
        ],
      }],
    });
    const result = computeTournamentAverages(state);
    expect(result.get(1)).toEqual({ phys: 50, spec: 0, other: 0, total: 50, recoil: 5, heal: 0 });
    expect(result.get(5)).toEqual({ phys: 0, spec: 50, other: 0, total: 50, recoil: 0, heal: 10 });
    // roster member with no damage entry — still counted with zeros
    expect(result.get(2)).toEqual({ phys: 0, spec: 0, other: 0, total: 0, recoil: 0, heal: 0 });
  });

  it('averages correctly across two matches for the same pokemon', () => {
    // match 1: pokemon 1 deals 100 out of 200 total → 50%
    // match 2: pokemon 1 deals 20  out of 200 total → 10%
    // average: (50 + 10) / 2 = 30%
    const state: RR4v4State = {
      teams: [
        { name: 'A', roster: [1, 2, 3, 4], isPlayer: false },
        { name: 'B', roster: [5, 6, 7, 8], isPlayer: false },
        { name: 'C', roster: [9, 10, 11, 12], isPlayer: false },
      ],
      schedule: [{ a: 0, b: 1 }, { a: 0, b: 2 }],
      results: [
        {
          winner: 0, rosterA: [1,2,3,4], rosterB: [5,6,7,8],
          pokemonSurvivedA: 2, pokemonSurvivedB: 0,
          damageSummary: [
            { pokemonId: 1, physical: 100, special: 0, other: 0, recoil: 0, heal: 0 },
            { pokemonId: 5, physical: 100, special: 0, other: 0, recoil: 0, heal: 0 },
          ],
        },
        {
          winner: 0, rosterA: [1,2,3,4], rosterB: [9,10,11,12],
          pokemonSurvivedA: 2, pokemonSurvivedB: 0,
          damageSummary: [
            { pokemonId: 1,  physical: 20,  special: 0, other: 0, recoil: 0, heal: 0 },
            { pokemonId: 9,  physical: 180, special: 0, other: 0, recoil: 0, heal: 0 },
          ],
        },
      ],
      currentMatchIdx: 2,
      mode: 'spectate',
      phase: 'finished',
      draft: null,
    };
    const result = computeTournamentAverages(state);
    // pokemon 1: match1 total=50%, match2 total=10% → avg=30%
    expect(result.get(1)?.total).toBeCloseTo(30);
    expect(result.get(1)?.phys).toBeCloseTo(30);
  });

  it('skips matches where total battle damage is zero', () => {
    const state = makeState({
      results: [{
        winner: 0, rosterA: [1,2,3,4], rosterB: [5,6,7,8],
        pokemonSurvivedA: 4, pokemonSurvivedB: 4,
        damageSummary: [
          { pokemonId: 1, physical: 0, special: 0, other: 0, recoil: 0, heal: 0 },
        ],
      }],
    });
    // All damage is zero, so no count is incremented
    expect(computeTournamentAverages(state).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- --reporter=verbose src/persistence/__tests__/damageStatsStorage.test.ts
```

Expected: FAIL — `computeTournamentAverages` not found.

- [ ] **Step 3: Implement the storage module**

Create `src/persistence/damageStatsStorage.ts`:

```typescript
import type { RR4v4State } from '../tournament/roundRobin4v4Engine';

export interface PokemonDamageAccum {
  physSum: number;
  specSum: number;
  otherSum: number;
  totalSum: number;
  recoilSum: number;
  healSum: number;
  tournamentCount: number;
}

interface TournamentAvg {
  phys: number;
  spec: number;
  other: number;
  total: number;
  recoil: number;
  heal: number;
}

const KEY = 'tournament_damage_stats';

function loadDamageStats(): Record<number, PokemonDamageAccum> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDamageStats(stats: Record<number, PokemonDamageAccum>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // storage quota or disabled — silently drop
  }
}

export function computeTournamentAverages(state: RR4v4State): Map<number, TournamentAvg> {
  // accum[id] = { sums..., count } — count = number of battles the pokemon participated in
  const accum = new Map<number, { physSum: number; specSum: number; otherSum: number; totalSum: number; recoilSum: number; healSum: number; count: number }>();

  state.schedule.forEach((pair, i) => {
    const result = state.results[i];
    if (!result?.damageSummary) return;

    const participatingIds = [
      ...state.teams[pair.a].roster,
      ...state.teams[pair.b].roster,
    ];
    const battleTotal = result.damageSummary.reduce(
      (s, e) => s + e.physical + e.special + e.other, 0,
    );
    if (battleTotal === 0) return;

    const entryById = new Map(result.damageSummary.map(e => [e.pokemonId, e]));

    for (const id of participatingIds) {
      if (!accum.has(id)) {
        accum.set(id, { physSum: 0, specSum: 0, otherSum: 0, totalSum: 0, recoilSum: 0, healSum: 0, count: 0 });
      }
      const a = accum.get(id)!;
      const entry = entryById.get(id);
      const phys  = (entry?.physical ?? 0) / battleTotal * 100;
      const spec  = (entry?.special  ?? 0) / battleTotal * 100;
      const other = (entry?.other    ?? 0) / battleTotal * 100;
      a.physSum  += phys;
      a.specSum  += spec;
      a.otherSum += other;
      a.totalSum += phys + spec + other;
      a.recoilSum += (entry?.recoil ?? 0) / battleTotal * 100;
      a.healSum   += (entry?.heal   ?? 0) / battleTotal * 100;
      a.count++;
    }
  });

  const averages = new Map<number, TournamentAvg>();
  for (const [id, a] of accum) {
    averages.set(id, {
      phys:  a.physSum  / a.count,
      spec:  a.specSum  / a.count,
      other: a.otherSum / a.count,
      total: a.totalSum / a.count,
      recoil: a.recoilSum / a.count,
      heal:  a.healSum  / a.count,
    });
  }
  return averages;
}

export function getDamageStats(): Record<number, PokemonDamageAccum> {
  return loadDamageStats();
}

export function recordTournamentDamage(state: RR4v4State): void {
  const averages = computeTournamentAverages(state);
  if (averages.size === 0) return;
  const all = loadDamageStats();
  for (const [pokemonId, avg] of averages) {
    const existing = all[pokemonId] ?? {
      physSum: 0, specSum: 0, otherSum: 0, totalSum: 0, recoilSum: 0, healSum: 0, tournamentCount: 0,
    };
    all[pokemonId] = {
      physSum:         existing.physSum  + avg.phys,
      specSum:         existing.specSum  + avg.spec,
      otherSum:        existing.otherSum + avg.other,
      totalSum:        existing.totalSum + avg.total,
      recoilSum:       existing.recoilSum + avg.recoil,
      healSum:         existing.healSum  + avg.heal,
      tournamentCount: existing.tournamentCount + 1,
    };
  }
  saveDamageStats(all);
}

export function clearDamageStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npm test -- --reporter=verbose src/persistence/__tests__/damageStatsStorage.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Verify build is clean**

```
npm run build
```

Expected: exits with code 0, no TypeScript errors.

- [ ] **Step 6: Commit**

```
git add src/persistence/damageStatsStorage.ts src/persistence/__tests__/damageStatsStorage.test.ts
git commit -m "feat: add damage stats storage with per-tournament average computation"
```

---

### Task 2: Wire save trigger in RoundRobin4v4Page

**Files:**
- Modify: `src/components/RoundRobin4v4Page.tsx`

- [ ] **Step 1: Add `startNewTournament` and update `FinishedView`**

At the top of `RoundRobin4v4Page.tsx`, add the import (after the existing persistence imports):

```typescript
import { recordTournamentDamage } from '../persistence/damageStatsStorage';
```

Inside `RoundRobin4v4Page` (after the existing `abandonTournament` function), add:

```typescript
function startNewTournament() {
  if (!state) return;
  recordTournamentDamage(state);
  clearRoundRobin4v4();
  setState(null);
  setPending(null);
  setLocalPhase('setup');
}
```

Change the `FinishedView` call (currently near the bottom of the component, in the `localPhase === 'finished'` block) from:

```typescript
<FinishedView
  state={state}
  allPokemon={allPokemon}
  onBack={onBack}
  onReset={abandonTournament}
/>
```

to:

```typescript
<FinishedView
  state={state}
  allPokemon={allPokemon}
  onBack={onBack}
  onStartNew={startNewTournament}
/>
```

Change the `FinishedView` function signature and body (at the bottom of the file) from:

```typescript
function FinishedView(props: {
  state: RR4v4State;
  allPokemon: PokemonData[];
  onBack: () => void;
  onReset: () => void;
}) {
  const { state, allPokemon, onBack, onReset } = props;
  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">🏆 Tournament Finished</h1>
      <div className="card">
        <RoundRobinStandingsView state={state} allPokemon={allPokemon} />
      </div>
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <button className="btn-primary" onClick={onReset}>Start New Tournament</button>
      </div>
    </div>
  );
}
```

to:

```typescript
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
```

- [ ] **Step 2: Verify build is clean**

```
npm run build
```

Expected: exits with code 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```
git add src/components/RoundRobin4v4Page.tsx
git commit -m "feat: save tournament damage stats when starting new tournament"
```

---

### Task 3: Statistics page — Damage tab

**Files:**
- Modify: `src/components/StatisticsPage.tsx`

- [ ] **Step 1: Add the import and extend the Tab type**

At the top of `StatisticsPage.tsx`, add the import alongside the existing persistence imports:

```typescript
import { getDamageStats } from '../persistence/damageStatsStorage';
```

Change the Tab type from:

```typescript
type Tab = 'moves' | 'coverage' | 'elo';
```

to:

```typescript
type Tab = 'moves' | 'coverage' | 'elo' | 'damage';
```

- [ ] **Step 2: Add the `damageRankings` memo**

Inside `StatisticsPage`, after the existing `eloRankings` memo, add:

```typescript
const damageRankings = useMemo(() => {
  const stats = getDamageStats();
  return nonDisabled
    .map(p => ({ pokemon: p, accum: stats[p.id] }))
    .filter(({ accum }) => accum !== undefined && accum.tournamentCount > 0)
    .sort((a, b) => {
      const avgA = a.accum.totalSum / a.accum.tournamentCount;
      const avgB = b.accum.totalSum / b.accum.tournamentCount;
      return avgB - avgA;
    });
}, [nonDisabled]);
```

- [ ] **Step 3: Add the tab button**

In the `<div className="stats-tabs">` block, after the existing ELO tab button, add:

```tsx
<button className={`stats-tab${tab === 'damage' ? ' active' : ''}`} onClick={() => setTab('damage')}>
  Damage
</button>
```

- [ ] **Step 4: Add the tab content**

After the closing `}` of the `{tab === 'elo' && ( ... )}` block (before the tooltip div), add:

```tsx
{tab === 'damage' && (
  <div className="card">
    <p className="stats-desc">
      Average damage contribution per battle across all completed Round Robin tournaments.
    </p>
    {damageRankings.length === 0 ? (
      <p className="stats-desc">No tournament data yet. Complete a 4v4 Round Robin and start a new one to record stats.</p>
    ) : (
      <div className="stats-table-wrapper">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Pokemon</th>
              <th style={{ textAlign: 'right' }}>Phys%</th>
              <th style={{ textAlign: 'right' }}>Spec%</th>
              <th style={{ textAlign: 'right' }}>Other%</th>
              <th style={{ textAlign: 'right' }}>Total%</th>
              <th style={{ textAlign: 'right' }}>Recoil%</th>
              <th style={{ textAlign: 'right' }}>Heal%</th>
              <th style={{ textAlign: 'right' }}>Tournaments</th>
            </tr>
          </thead>
          <tbody>
            {damageRankings.map(({ pokemon, accum }, i) => {
              const n = accum.tournamentCount;
              const fmt = (sum: number) => (sum / n).toFixed(1) + '%';
              return (
                <tr key={pokemon.id}>
                  <td className="rank-cell">#{i + 1}</td>
                  <td>
                    <div className="pokemon-cell">
                      <img src={pokemon.spriteUrl} alt={pokemon.name} className="sim-sprite" />
                      <div>
                        <div className="stats-pokemon-name">{formatPokemonName(pokemon.name)}</div>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {pokemon.types.map(t => <TypeBadge key={t} type={t} />)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(accum.physSum)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(accum.specSum)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(accum.otherSum)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(accum.totalSum)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(accum.recoilSum)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(accum.healSum)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify build is clean**

```
npm run build
```

Expected: exits with code 0, no TypeScript errors.

- [ ] **Step 6: Run full test suite**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```
git add src/components/StatisticsPage.tsx
git commit -m "feat: add Damage tab to Statistics page showing cumulative tournament damage averages"
```
