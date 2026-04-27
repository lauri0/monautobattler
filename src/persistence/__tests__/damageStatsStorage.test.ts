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
    // pokemon 1: physical = 100 → 50%, recoil = 10 → 5%
    // pokemon 5: special  = 100 → 50%, heal = 20 → 10%
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
