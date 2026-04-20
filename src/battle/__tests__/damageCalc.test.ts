import { describe, it, expect } from 'vitest';
import { calcDamage, effectiveSpeed } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst, stubRng } from './rng';

describe('calcDamage', () => {
  it('deals non-zero damage on a normal hit', () => {
    stubRngConst(0.5); // accuracy pass, no crit
    const attacker = makePokemon({ name: 'atk', types: ['water'] });
    const defender = makePokemon({ name: 'def', types: ['fire'] });
    const move = makeMove({ type: 'water', power: 80, damageClass: 'special' });
    const r = calcDamage(attacker, defender, move);
    expect(r.missed).toBe(false);
    expect(r.effectiveness).toBe(2);
    expect(r.damage).toBeGreaterThan(0);
  });

  it('misses when accuracy roll exceeds move accuracy', () => {
    stubRngConst(0.99); // 99% > 80% accuracy
    const a = makePokemon();
    const d = makePokemon();
    const move = makeMove({ accuracy: 80, power: 60 });
    const r = calcDamage(a, d, move);
    expect(r.missed).toBe(true);
    expect(r.damage).toBe(0);
  });

  it('returns 0 damage and effectiveness=0 vs immune type', () => {
    stubRngConst(0); // pass accuracy
    const a = makePokemon({ types: ['normal'] });
    const d = makePokemon({ types: ['ghost'] });
    const move = makeMove({ type: 'normal', power: 80 });
    const r = calcDamage(a, d, move);
    expect(r.effectiveness).toBe(0);
    expect(r.damage).toBe(0);
  });

  it('STAB adds 1.5x damage', () => {
    // Accuracy pass, no crit — same roll for both
    stubRngConst(0);
    const stab = makePokemon({ types: ['water'] });
    const nonStab = makePokemon({ types: ['normal'] });
    const defender = makePokemon({ types: ['normal'] });
    const move = makeMove({ type: 'water', power: 60, damageClass: 'special' });
    const rStab = calcDamage(stab, defender, move, 1.0);
    const rNon = calcDamage(nonStab, defender, move, 1.0);
    expect(rStab.damage).toBe(Math.floor(rNon.damage * 1.5));
  });

  it('4x super-effective = 4x 1x damage (double-type)', () => {
    stubRngConst(0);
    const attacker = makePokemon({ types: ['normal'] });
    const neutralDef = makePokemon({ types: ['normal'] });
    const doubleWeakDef = makePokemon({ types: ['grass', 'ground'] });
    const move = makeMove({ type: 'ice', power: 60, damageClass: 'special' });
    const neutral = calcDamage(attacker, neutralDef, move, 1.0);
    const quad = calcDamage(attacker, doubleWeakDef, move, 1.0);
    expect(quad.effectiveness).toBe(4);
    expect(quad.damage).toBe(Math.floor(neutral.damage * 4));
  });

  it('critical hit multiplies damage by 1.5', () => {
    const attacker = makePokemon();
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    // [accuracy 0, crit 0 (hits), roll 1.0]
    stubRng([0, 0, 1.0]);
    const crit = calcDamage(attacker, defender, move);
    // [accuracy 0, crit 0.99 (no), roll 1.0]
    stubRng([0, 0.99, 1.0]);
    const normal = calcDamage(attacker, defender, move);
    expect(crit.isCrit).toBe(true);
    expect(normal.isCrit).toBe(false);
    expect(crit.damage).toBe(Math.floor(normal.damage * 1.5));
  });
});

describe('effectiveSpeed', () => {
  it('returns level-50 speed at neutral stages', () => {
    const p = makePokemon({ stats: { speed: 120 } });
    expect(effectiveSpeed(p)).toBe(120);
  });

  it('halves speed when paralyzed', () => {
    const p = makePokemon({ stats: { speed: 120 }, statusCondition: 'paralysis' });
    expect(effectiveSpeed(p)).toBe(60);
  });

  it('applies +1 stat stage (1.5x)', () => {
    const p = makePokemon({ stats: { speed: 100 }, statStages: { speed: 1 } });
    expect(effectiveSpeed(p)).toBe(150);
  });
});
