import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const technician = makePokemon({ name: 'tech',  types: ['normal'], ability: 'technician', stats: { attack: 100 } });
const plain       = makePokemon({ name: 'plain', types: ['normal'],                        stats: { attack: 100 } });
const target      = makePokemon({ name: 'tgt',   types: ['normal'],                        stats: { defense: 100 } });

const move60  = makeMove({ name: 'cut',        type: 'normal', power: 60,  damageClass: 'physical' });
const move61  = makeMove({ name: 'slash',      type: 'normal', power: 61,  damageClass: 'physical' });
const move40  = makeMove({ name: 'quick-attack', type: 'normal', power: 40, damageClass: 'physical' });
const move80  = makeMove({ name: 'body-slam',  type: 'normal', power: 80,  damageClass: 'physical' });

describe('Technician', () => {
  it('boosts a 60-power move by 1.5×', () => {
    stubRngConst(0.99);
    const boosted = calcDamage(technician, target, move60);
    stubRngConst(0.99);
    const unboosted = calcDamage(plain, target, move60);
    expect(boosted.damage / unboosted.damage).toBeCloseTo(1.5, 1);
  });

  it('boosts a 40-power move by 1.5×', () => {
    stubRngConst(0.99);
    const boosted = calcDamage(technician, target, move40);
    stubRngConst(0.99);
    const unboosted = calcDamage(plain, target, move40);
    expect(boosted.damage / unboosted.damage).toBeCloseTo(1.5, 1);
  });

  it('does not boost a 61-power move', () => {
    stubRngConst(0.99);
    const withAbility = calcDamage(technician, target, move61);
    stubRngConst(0.99);
    const withoutAbility = calcDamage(plain, target, move61);
    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it('does not boost an 80-power move', () => {
    stubRngConst(0.99);
    const withAbility = calcDamage(technician, target, move80);
    stubRngConst(0.99);
    const withoutAbility = calcDamage(plain, target, move80);
    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it('does not boost a move whose in-battle power is doubled past 60 (Revenge)', () => {
    // Revenge has base power 60; when doublePowerIfHit fires it becomes 120.
    // calcDamage receives the already-doubled move, so Technician must not apply.
    const revengeDoubled = makeMove({ name: 'revenge', type: 'fighting', power: 120, damageClass: 'physical' });
    stubRngConst(0.99);
    const withAbility = calcDamage(technician, target, revengeDoubled);
    stubRngConst(0.99);
    const withoutAbility = calcDamage(plain, target, revengeDoubled);
    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it('boosts escalating hits whose per-hit power is ≤60', () => {
    // Triple Axel: hit 1 = 20, hit 2 = 40, hit 3 = 60. All qualify for Technician.
    // Integer floors at low power make the ratio imprecise, so just confirm boost fires.
    for (const power of [20, 40, 60]) {
      const hit = makeMove({ name: `axel-hit-${power}`, type: 'ice', power, damageClass: 'physical' });
      stubRngConst(0.99);
      const boosted = calcDamage(technician, target, hit);
      stubRngConst(0.99);
      const unboosted = calcDamage(plain, target, hit);
      expect(boosted.damage).toBeGreaterThan(unboosted.damage);
    }
  });
});
