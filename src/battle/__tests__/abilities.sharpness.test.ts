import { describe, it, expect } from 'vitest';
import { isSlicingMove } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';
import { calcDamage } from '../damageCalc';

const sharpness = makePokemon({ name: 's', ability: 'sharpness', stats: { attack: 100 } });
const plain     = makePokemon({ name: 'p', stats: { attack: 100 } });
const target    = makePokemon({ name: 't' });

describe('isSlicingMove', () => {
  it.each([
    'night-slash',
    'leaf-blade',
    'air-cutter',
    'x-scissor',
    'razor-leaf',
    'sacred-sword',
    'slash',
    'solar-blade',
    'fury-cutter',
    'shadow-claw',
    'dragon-claw',
    'metal-claw',
  ])('identifies "%s" as a slicing move', (name) => {
    expect(isSlicingMove(makeMove({ name, power: 60, damageClass: 'physical' }))).toBe(true);
  });

  it('does not classify non-slicing moves', () => {
    expect(isSlicingMove(makeMove({ name: 'tackle',      power: 40, damageClass: 'physical' }))).toBe(false);
    expect(isSlicingMove(makeMove({ name: 'flamethrower', power: 90, damageClass: 'special' }))).toBe(false);
    expect(isSlicingMove(makeMove({ name: 'earthquake',  power: 100, damageClass: 'physical' }))).toBe(false);
  });

  it('does not classify status moves even if the name matches', () => {
    expect(isSlicingMove(makeMove({ name: 'sword-dance', power: 0, damageClass: 'status' }))).toBe(false);
  });
});

describe('Sharpness — damage multiplier', () => {
  it('boosts slicing moves by 1.5×', () => {
    const slash = makeMove({ name: 'slash', type: 'normal', power: 70, damageClass: 'physical', accuracy: 100 });
    stubRng([0.5, 0.99]); // hit passes, no crit
    const withSharpness = calcDamage(sharpness, target, slash, 1.0);
    stubRng([0.5, 0.99]);
    const withoutSharpness = calcDamage(plain, target, slash, 1.0);
    expect(withSharpness.damage).toBe(Math.floor(withoutSharpness.damage * 1.5));
  });

  it('does not boost non-slicing moves', () => {
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical', accuracy: 100 });
    stubRng([0.5, 0.99]);
    const withSharpness = calcDamage(sharpness, target, tackle, 1.0);
    stubRng([0.5, 0.99]);
    const withoutSharpness = calcDamage(plain, target, tackle, 1.0);
    expect(withSharpness.damage).toBe(withoutSharpness.damage);
  });
});

describe('Sharpness — integration via resolveSingleAttack', () => {
  it('deals more damage with slicing moves than a plain attacker', () => {
    stubRngConst(0.5);
    const slash = makeMove({ name: 'night-slash', type: 'dark', power: 70, damageClass: 'physical' });
    const def1 = makePokemon({ name: 'd1', stats: { hp: 500 } });
    const def2 = makePokemon({ name: 'd2', stats: { hp: 500 } });
    const r1 = resolveSingleAttack(sharpness, def1, slash, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    const r2 = resolveSingleAttack(plain,     def2, slash, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    const dmg1 = def1.currentHp - r1.defender.currentHp;
    const dmg2 = def2.currentHp - r2.defender.currentHp;
    expect(dmg1).toBeGreaterThan(dmg2 * 1.4);
    expect(dmg1).toBeLessThan(dmg2 * 1.6);
  });
});
