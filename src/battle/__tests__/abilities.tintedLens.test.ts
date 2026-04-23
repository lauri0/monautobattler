import { describe, it, expect } from 'vitest';
import { calcDamage, calcMinDamage, calcExpectedDamage } from '../damageCalc';
import { tintedLensMultiplier, isAbilityImplemented } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

function rollsNoCritMax() { stubRng([0, 0.99, 1.0]); }

describe('Tinted Lens', () => {
  it('doubles damage on a not-very-effective hit (0.5x → 1.0x effective)', () => {
    // Fire vs Water = 0.5x. Tinted Lens should double that.
    const tinted = makePokemon({ name: 'tinted', types: ['fire'], ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'plain',  types: ['fire'] });
    const defender = makePokemon({ name: 'water', types: ['water'] });
    const move = makeMove({ name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withTL = calcDamage(tinted, defender, move);
    rollsNoCritMax();
    const without = calcDamage(plain, defender, move);

    // Allow ±1 due to the final Math.floor being applied once to the full product.
    expect(withTL.damage).toBeGreaterThanOrEqual(without.damage * 2);
    expect(withTL.damage).toBeLessThanOrEqual(without.damage * 2 + 1);
  });

  it('doubles damage on a double-resist (0.25x → 0.5x effective)', () => {
    // Grass vs Fire/Flying = 0.25x.
    const tinted = makePokemon({ name: 'tinted', types: ['grass'], ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'plain',  types: ['grass'] });
    const defender = makePokemon({ name: 'charizard', types: ['fire', 'flying'] });
    const move = makeMove({ name: 'giga-drain', type: 'grass', power: 75, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withTL = calcDamage(tinted, defender, move);
    rollsNoCritMax();
    const without = calcDamage(plain, defender, move);

    expect(withTL.damage).toBe(without.damage * 2);
  });

  it('does not affect neutral hits (1x)', () => {
    const tinted = makePokemon({ name: 'tinted', types: ['normal'], ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'plain',  types: ['normal'] });
    const defender = makePokemon({ name: 'target', types: ['normal'] });
    const move = makeMove({ name: 'return', type: 'normal', power: 90, accuracy: 100, damageClass: 'physical' });

    rollsNoCritMax();
    const withTL = calcDamage(tinted, defender, move);
    rollsNoCritMax();
    const without = calcDamage(plain, defender, move);

    expect(withTL.damage).toBe(without.damage);
  });

  it('does not affect super-effective hits (2x)', () => {
    const tinted = makePokemon({ name: 'tinted', types: ['water'], ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'plain',  types: ['water'] });
    const defender = makePokemon({ name: 'fire', types: ['fire'] });
    const move = makeMove({ name: 'surf', type: 'water', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withTL = calcDamage(tinted, defender, move);
    rollsNoCritMax();
    const without = calcDamage(plain, defender, move);

    expect(withTL.damage).toBe(without.damage);
  });

  it('does not turn a zero-damage immunity into damage', () => {
    // Normal vs Ghost = 0x. Tinted Lens must not bypass immunities.
    const tinted = makePokemon({ name: 'tinted', types: ['normal'], ability: 'tinted-lens' });
    const defender = makePokemon({ name: 'gengar', types: ['ghost'] });
    const move = makeMove({ name: 'body-slam', type: 'normal', power: 85, accuracy: 100, damageClass: 'physical' });

    rollsNoCritMax();
    const result = calcDamage(tinted, defender, move);

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe(0);
  });

  it('applies in calcMinDamage and calcExpectedDamage as well', () => {
    const tinted = makePokemon({ name: 'tinted', types: ['fire'], ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'plain',  types: ['fire'] });
    const defender = makePokemon({ name: 'water', types: ['water'] });
    const move = makeMove({ name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' });

    const minWith = calcMinDamage(tinted, defender, move);
    const minWithout = calcMinDamage(plain, defender, move);
    expect(minWith).toBeGreaterThanOrEqual(minWithout * 2);
    expect(minWith).toBeLessThanOrEqual(minWithout * 2 + 1);

    const expWith = calcExpectedDamage(tinted, defender, move);
    const expWithout = calcExpectedDamage(plain, defender, move);
    expect(expWith).toBeGreaterThanOrEqual(expWithout * 2);
    expect(expWith).toBeLessThanOrEqual(expWithout * 2 + 1);
  });

  it('tintedLensMultiplier returns 2 only for attackers with the ability on NVE hits', () => {
    const tinted = makePokemon({ name: 't', ability: 'tinted-lens' });
    const plain  = makePokemon({ name: 'p' });

    expect(tintedLensMultiplier(tinted, 0.5)).toBe(2);
    expect(tintedLensMultiplier(tinted, 0.25)).toBe(2);
    expect(tintedLensMultiplier(tinted, 1)).toBe(1);
    expect(tintedLensMultiplier(tinted, 2)).toBe(1);
    expect(tintedLensMultiplier(tinted, 0)).toBe(1);
    expect(tintedLensMultiplier(plain, 0.5)).toBe(1);
  });

  it('is registered as an implemented ability', () => {
    expect(isAbilityImplemented('tinted-lens')).toBe(true);
  });
});

describe('Keen Eye', () => {
  // This engine does not model accuracy/evasion stat stages, so Keen Eye has
  // no mechanical effect to exercise. It is registered so the UI doesn't flag
  // it as "(Unimplemented)".
  it('is registered as an implemented ability', () => {
    expect(isAbilityImplemented('keen-eye')).toBe(true);
  });
});
