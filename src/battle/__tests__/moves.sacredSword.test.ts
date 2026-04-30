import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
const target   = makePokemon({ name: 't', stats: { defense: 100 } });

function sacredSword() {
  return makeMove({
    name: 'sacred-sword', type: 'fighting', power: 90, damageClass: 'physical', accuracy: 100,
    effect: { ignoreDefenseStages: true },
  });
}

function regularMove() {
  return makeMove({ name: 'tackle', type: 'normal', power: 90, damageClass: 'physical', accuracy: 100 });
}

describe('Sacred Sword — ignores positive defense stages', () => {
  it('deals the same damage regardless of the target\'s defense boost', () => {
    const boosted = { ...target, statStages: { ...target.statStages, defense: 6 } };

    stubRng([0.5, 0.99]); // hit, no crit; explicit randomRoll=1.0
    const vsNormal  = calcDamage(attacker, target,  sacredSword(), 1.0);
    stubRng([0.5, 0.99]);
    const vsBoosted = calcDamage(attacker, boosted, sacredSword(), 1.0);

    expect(vsNormal.missed).toBe(false);
    expect(vsBoosted.missed).toBe(false);
    expect(vsNormal.damage).toBe(vsBoosted.damage);
  });

  it('a regular move is weakened by the target\'s defense boost', () => {
    const boosted = { ...target, statStages: { ...target.statStages, defense: 6 } };

    stubRng([0.5, 0.99]);
    const vsNormal  = calcDamage(attacker, target,  regularMove(), 1.0);
    stubRng([0.5, 0.99]);
    const vsBoosted = calcDamage(attacker, boosted, regularMove(), 1.0);

    expect(vsNormal.damage).toBeGreaterThan(vsBoosted.damage);
  });
});

describe('Sacred Sword — ignores negative defense stages', () => {
  it('deals the same damage regardless of the target\'s defense drop', () => {
    const lowered = { ...target, statStages: { ...target.statStages, defense: -6 } };

    stubRng([0.5, 0.99]);
    const vsNormal  = calcDamage(attacker, target,  sacredSword(), 1.0);
    stubRng([0.5, 0.99]);
    const vsLowered = calcDamage(attacker, lowered, sacredSword(), 1.0);

    expect(vsNormal.damage).toBe(vsLowered.damage);
  });

  it('a regular move is boosted by the target\'s defense drop', () => {
    const lowered = { ...target, statStages: { ...target.statStages, defense: -6 } };

    stubRng([0.5, 0.99]);
    const vsNormal  = calcDamage(attacker, target,  regularMove(), 1.0);
    stubRng([0.5, 0.99]);
    const vsLowered = calcDamage(attacker, lowered, regularMove(), 1.0);

    expect(vsLowered.damage).toBeGreaterThan(vsNormal.damage);
  });
});

describe('Sacred Sword — integration via resolveSingleAttack', () => {
  it('deals the same damage to a +6 defense target as to a neutral target', () => {
    const neutral = makePokemon({ name: 'd1', stats: { hp: 500, defense: 100 } });
    const boosted = { ...makePokemon({ name: 'd2', stats: { hp: 500, defense: 100 } }), statStages: { ...makePokemon({ name: 'd2' }).statStages, defense: 6 } };

    stubRng([0.5, 0.99, 0.92]);
    const r1 = resolveSingleAttack(attacker, neutral, sacredSword(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    stubRng([0.5, 0.99, 0.92]);
    const r2 = resolveSingleAttack(attacker, boosted, sacredSword(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);

    const dmg1 = neutral.currentHp - r1.defender.currentHp;
    const dmg2 = boosted.currentHp - r2.defender.currentHp;
    expect(dmg1).toBe(dmg2);
  });
});
