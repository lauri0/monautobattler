import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';
import type { TypeName } from '../../models/types';

function rollsNoCrit() { stubRng([0, 0.99, 1.0]); }

const CASES: { ability: string; type: TypeName; weakTargetType: TypeName }[] = [
  { ability: 'blaze',   type: 'fire',  weakTargetType: 'grass' },
  { ability: 'torrent', type: 'water', weakTargetType: 'fire' },
  { ability: 'swarm',   type: 'bug',   weakTargetType: 'grass' },
];

describe.each(CASES)('$ability', ({ ability, type, weakTargetType }) => {
  const matchingMove = makeMove({ name: 'matching', type, power: 60, damageClass: 'physical' });
  const offTypeMove  = makeMove({ name: 'thrash',   type: 'normal', power: 60, damageClass: 'physical' });

  it(`boosts ${type} moves by 1.5x below 1/3 HP`, () => {
    const lowHp = makePokemon({
      name: 'user', types: [type], ability,
      stats: { hp: 300, attack: 120 }, currentHp: 99,
    });
    const highHp = makePokemon({
      name: 'user', types: [type], ability,
      stats: { hp: 300, attack: 120 }, currentHp: 120,
    });
    const target = makePokemon({ name: 'target', types: [weakTargetType] });

    rollsNoCrit();
    const low = calcDamage(lowHp, target, matchingMove);
    rollsNoCrit();
    const high = calcDamage(highHp, target, matchingMove);

    expect(low.damage).toBe(Math.floor(high.damage * 1.5));
  });

  it('does not boost off-type moves', () => {
    const lowHp = makePokemon({
      name: 'user', types: [type], ability,
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const noAbility = makePokemon({
      name: 'user', types: [type],
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const target = makePokemon({ name: 'target', types: ['normal'] });

    rollsNoCrit();
    const a = calcDamage(lowHp, target, offTypeMove);
    rollsNoCrit();
    const b = calcDamage(noAbility, target, offTypeMove);

    expect(a.damage).toBe(b.damage);
  });

  it('does nothing without the ability', () => {
    const lowHp = makePokemon({
      name: 'user', types: [type],
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const target = makePokemon({ name: 'target', types: ['normal'] });

    rollsNoCrit();
    const withAbility = calcDamage({ ...lowHp, ability }, target, matchingMove);
    rollsNoCrit();
    const withoutAbility = calcDamage(lowHp, target, matchingMove);

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });
});
