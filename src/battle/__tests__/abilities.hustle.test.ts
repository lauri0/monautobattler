import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';

const hustle = makePokemon({ name: 'h', ability: 'hustle', stats: { attack: 100, specialAttack: 100 } });
const plain  = makePokemon({ name: 'p', stats: { attack: 100, specialAttack: 100 } });
const target = makePokemon({ name: 't' });

function physicalMove() { return makeMove({ name: 'tackle',       type: 'normal', power: 60, damageClass: 'physical', accuracy: 100 }); }
function specialMove()  { return makeMove({ name: 'flamethrower', type: 'fire',   power: 60, damageClass: 'special',  accuracy: 100 }); }

// RNG call order in calcDamage (when randomRoll is passed explicitly, skipping the roll call):
//   1. hit check  2. crit check
// When randomRoll is NOT passed:
//   1. hit check  2. crit check  3. damage roll

describe('Hustle — Attack boost', () => {
  it('deals 1.5× damage on physical moves compared to no ability', () => {
    // Roll 0.5 passes Hustle's 80% accuracy; pass explicit randomRoll=1.0 to skip the roll RNG.
    stubRng([0.5, 0.99]); // hit passes, no crit
    const withHustle = calcDamage(hustle, target, physicalMove(), 1.0);
    stubRng([0.5, 0.99]);
    const withoutHustle = calcDamage(plain, target, physicalMove(), 1.0);
    expect(withHustle.missed).toBe(false);
    expect(withoutHustle.missed).toBe(false);
    expect(withHustle.damage).toBe(Math.floor(withoutHustle.damage * 1.5));
  });

  it('does not boost special moves', () => {
    stubRng([0.5, 0.99]);
    const withHustle = calcDamage(hustle, target, specialMove(), 1.0);
    stubRng([0.5, 0.99]);
    const withoutHustle = calcDamage(plain, target, specialMove(), 1.0);
    expect(withHustle.damage).toBe(withoutHustle.damage);
  });
});

describe('Hustle — accuracy penalty', () => {
  it('misses a physical move when the roll falls in the 80–100% band', () => {
    // Accuracy is 80% with Hustle, so 0.85 > 0.80 → miss (no further RNG calls)
    stubRng([0.85]);
    const result = calcDamage(hustle, target, physicalMove());
    expect(result.missed).toBe(true);
  });

  it('hits a physical move when the roll is within the 80% window', () => {
    // 0.79 ≤ 0.80 → hits; then crit check + damage roll
    stubRng([0.79, 0.99, 0.92]);
    const result = calcDamage(hustle, target, physicalMove());
    expect(result.missed).toBe(false);
  });

  it('does not reduce accuracy of special moves', () => {
    // Hustle only penalises physical moves; 0.85 ≤ 1.00 → hits
    stubRng([0.85, 0.99, 0.92]);
    const result = calcDamage(hustle, target, specialMove());
    expect(result.missed).toBe(false);
  });

  it('does not reduce accuracy for a pokemon without Hustle', () => {
    stubRng([0.85, 0.99, 0.92]);
    const result = calcDamage(plain, target, physicalMove());
    expect(result.missed).toBe(false);
  });
});

describe('Hustle — integration via resolveSingleAttack', () => {
  it('deals more physical damage than an identical attacker without the ability', () => {
    stubRngConst(0.5);
    const hustleAttacker = makePokemon({ name: 'h', ability: 'hustle', stats: { attack: 100 } });
    const plainAttacker  = makePokemon({ name: 'p', stats: { attack: 100 } });
    const def1 = makePokemon({ name: 'd1', stats: { hp: 500 } });
    const def2 = makePokemon({ name: 'd2', stats: { hp: 500 } });
    const r1 = resolveSingleAttack(hustleAttacker, def1, physicalMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    const r2 = resolveSingleAttack(plainAttacker,  def2, physicalMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    const dmg1 = def1.currentHp - r1.defender.currentHp;
    const dmg2 = def2.currentHp - r2.defender.currentHp;
    // Hustle gives 1.5× so dmg1 should be meaningfully larger, accounting for integer floors
    expect(dmg1).toBeGreaterThan(dmg2 * 1.4);
    expect(dmg1).toBeLessThan(dmg2 * 1.6);
  });
});
