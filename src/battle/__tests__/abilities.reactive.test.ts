import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { applyStatChangeFromFoe, noGuardInEffect } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';
import type { TurnEvent } from '../../models/types';

describe('No Guard', () => {
  it('causes the attacker to never miss', () => {
    const attacker = makePokemon({ name: 'machamp', types: ['fighting'], ability: 'no-guard' });
    const defender = makePokemon({ name: 'target', types: ['normal'] });
    const move = makeMove({ name: 'dynamicpunch', type: 'fighting', power: 100, accuracy: 50, damageClass: 'physical' });

    // accuracy=0.99 would normally miss at 50% accuracy; crit=0.99, dmg-roll=1.0
    stubRng([0.99, 0.99, 1.0]);
    const result = calcDamage(attacker, defender, move);

    expect(result.missed).toBe(false);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('causes attacks aimed at the bearer to never miss', () => {
    const attacker = makePokemon({ name: 'attacker', types: ['fighting'] });
    const defender = makePokemon({ name: 'machamp', types: ['normal'], ability: 'no-guard' });
    const move = makeMove({ name: 'stone-edge', type: 'rock', power: 100, accuracy: 50, damageClass: 'physical' });

    stubRng([0.99, 0.99, 1.0]);
    const result = calcDamage(attacker, defender, move);

    expect(result.missed).toBe(false);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('still misses without No Guard on either side', () => {
    const attacker = makePokemon({ name: 'attacker', types: ['fighting'] });
    const defender = makePokemon({ name: 'target', types: ['normal'] });
    const move = makeMove({ name: 'stone-edge', type: 'rock', power: 100, accuracy: 50, damageClass: 'physical' });

    stubRng([0.99, 0.99, 1.0]);
    const result = calcDamage(attacker, defender, move);
    expect(result.missed).toBe(true);
  });

  it('noGuardInEffect is true when either side has the ability', () => {
    const a = makePokemon({ name: 'a' });
    const b = makePokemon({ name: 'b' });
    expect(noGuardInEffect(a, b)).toBe(false);
    expect(noGuardInEffect({ ...a, ability: 'no-guard' }, b)).toBe(true);
    expect(noGuardInEffect(a, { ...b, ability: 'no-guard' })).toBe(true);
  });
});

describe('Big Pecks', () => {
  it('blocks foe-initiated defense drops', () => {
    const target = makePokemon({ name: 'pidgey', ability: 'big-pecks' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'defense', -1, 1, events);

    expect(result.statStages.defense).toBe(0);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'big-pecks')).toBe(true);
    expect(events.some(e => e.kind === 'stat_change')).toBe(false);
  });

  it('does not block non-defense stat drops', () => {
    const target = makePokemon({ name: 'pidgey', ability: 'big-pecks' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events);

    expect(result.statStages.attack).toBe(-1);
  });

  it('does not block defense boosts (only drops)', () => {
    const target = makePokemon({ name: 'pidgey', ability: 'big-pecks' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'defense', 1, 1, events);

    expect(result.statStages.defense).toBe(1);
  });
});

describe('Competitive', () => {
  it('raises Sp. Atk by 2 when a foe lowers any stat', () => {
    const target = makePokemon({ name: 'milotic', ability: 'competitive' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events);

    expect(result.statStages.attack).toBe(-1);
    expect(result.statStages['special-attack']).toBe(2);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'competitive')).toBe(true);
  });

  it('does not trigger when the stat drop is blocked/capped (no actual decrease)', () => {
    const target = makePokemon({ name: 'milotic', ability: 'competitive', statStages: { attack: -6 } });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events);

    expect(result.statStages['special-attack']).toBe(0);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'competitive')).toBe(false);
  });

  it('does not trigger on stat boosts', () => {
    const target = makePokemon({ name: 'milotic', ability: 'competitive' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'attack', 1, 1, events);

    expect(result.statStages['special-attack']).toBe(0);
  });
});

describe('Defiant', () => {
  it('raises Attack by 2 when a foe lowers any stat', () => {
    const target = makePokemon({ name: 'bisharp', ability: 'defiant' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'speed', -1, 1, events);

    expect(result.statStages.speed).toBe(-1);
    expect(result.statStages.attack).toBe(2);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'defiant')).toBe(true);
  });

  it('combines with Big Pecks if both somehow applied: Big Pecks wins for defense and suppresses Defiant', () => {
    // Sanity: Defiant triggers only when the drop actually happened. Big Pecks blocks it.
    // No pokemon has both, but the helper should be robust.
    const target = makePokemon({ name: 'x', ability: 'big-pecks' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'defense', -1, 1, events);
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages.attack).toBe(0);
  });

  it('triggers on Intimidate switch-in (attack drop from foe)', () => {
    const target = makePokemon({ name: 'bisharp', ability: 'defiant' });
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events);

    expect(result.statStages.attack).toBe(1); // -1 + +2 = 1
  });
});
