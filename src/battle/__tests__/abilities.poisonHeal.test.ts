import { describe, it, expect } from 'vitest';
import { hasPoisonHeal } from '../abilities';
import { applyEndOfTurnStatus } from '../battleEngine';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

const maxHp = 200;
const damaged = makePokemon({ name: 'ph', ability: 'poison-heal', statusCondition: 'poison', currentHp: 100 });
const full    = makePokemon({ name: 'ph', ability: 'poison-heal', statusCondition: 'poison', currentHp: maxHp });
const noAbility = makePokemon({ name: 'p', statusCondition: 'poison', currentHp: 100 });
const burned  = makePokemon({ name: 'b', ability: 'poison-heal', statusCondition: 'burn', currentHp: 100 });

describe('hasPoisonHeal', () => {
  it('returns true when the bearer is poisoned and has Poison Heal', () => {
    expect(hasPoisonHeal(damaged)).toBe(true);
  });

  it('returns false when the bearer is not poisoned', () => {
    const healthy = makePokemon({ name: 'h', ability: 'poison-heal' });
    expect(hasPoisonHeal(healthy)).toBe(false);
  });

  it('returns false when the bearer does not have Poison Heal', () => {
    expect(hasPoisonHeal(noAbility)).toBe(false);
  });
});

describe('Poison Heal — applyEndOfTurnStatus', () => {
  it('heals 1/8 max HP instead of dealing damage when poisoned', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnStatus(damaged, 1, events);
    const expectedHeal = Math.max(1, Math.floor(maxHp / 8)); // 25
    expect(result.currentHp).toBe(100 + expectedHeal);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'poison-heal')).toBe(true);
    expect(events.some(e => e.kind === 'heal')).toBe(true);
    expect(events.some(e => e.kind === 'status_damage')).toBe(false);
  });

  it('does not heal beyond max HP', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnStatus(full, 1, events);
    expect(result.currentHp).toBe(maxHp);
    // No events when already at full HP
    expect(events.length).toBe(0);
  });

  it('still deals damage on burn even with Poison Heal', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnStatus(burned, 1, events);
    expect(result.currentHp).toBeLessThan(100);
    expect(events.some(e => e.kind === 'status_damage')).toBe(true);
  });

  it('still deals damage to a poisoned Pokemon without Poison Heal', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnStatus(noAbility, 1, events);
    expect(result.currentHp).toBeLessThan(100);
    expect(events.some(e => e.kind === 'status_damage')).toBe(true);
  });
});

describe('Poison Heal — integration via resolveTurnWithMoves', () => {
  it('heals the bearer at end of turn when poisoned', () => {
    stubRngConst(0.5);
    const bearer = makePokemon({ name: 'ph', ability: 'poison-heal', statusCondition: 'poison', currentHp: 100 });
    const foe    = makePokemon({ name: 'foe', stats: { speed: 1 } }); // slower, skips action
    const splash = makeMove({ name: 'splash', type: 'normal', power: 0, damageClass: 'status' });
    const result = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(result.p1After.currentHp).toBeGreaterThan(100);
    expect(result.events.some(e => e.kind === 'ability_triggered' && e.ability === 'poison-heal')).toBe(true);
  });
});
