import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

const GRASS_MOVE = makeMove({ name: 'grass', type: 'grass', power: 60, damageClass: 'physical' });
const NORMAL_MOVE = makeMove({ name: 'thrash', type: 'normal', power: 60, damageClass: 'physical' });

// rng order in calcDamage: accuracy, crit, damage-roll.
// Pre-set: accuracy=0 (hit), crit=0.99 (no crit), damage-roll=1.0 (max).
function rollsNoCrit() { stubRng([0, 0.99, 1.0]); }

describe('Overgrow', () => {
  it('boosts grass moves by 1.5x below 1/3 HP', () => {
    const lowHp = makePokemon({
      name: 'venusaur', types: ['grass'], ability: 'overgrow',
      stats: { hp: 300, attack: 120 }, currentHp: 99, // 99/300 = 33% < 1/3
    });
    const highHp = makePokemon({
      name: 'venusaur', types: ['grass'], ability: 'overgrow',
      stats: { hp: 300, attack: 120 }, currentHp: 120, // 40%
    });
    const target = makePokemon({ name: 'target', types: ['water'] });

    rollsNoCrit();
    const low = calcDamage(lowHp, target, GRASS_MOVE);
    rollsNoCrit();
    const high = calcDamage(highHp, target, GRASS_MOVE);

    expect(low.damage).toBe(Math.floor(high.damage * 1.5));
  });

  it('does not boost non-grass moves', () => {
    const lowHp = makePokemon({
      name: 'venusaur', types: ['grass'], ability: 'overgrow',
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const noAbility = makePokemon({
      name: 'venusaur', types: ['grass'],
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const target = makePokemon({ name: 'target', types: ['normal'] });

    rollsNoCrit();
    const a = calcDamage(lowHp, target, NORMAL_MOVE);
    rollsNoCrit();
    const b = calcDamage(noAbility, target, NORMAL_MOVE);

    expect(a.damage).toBe(b.damage);
  });

  it('does nothing for pokemon without Overgrow', () => {
    const lowHp = makePokemon({
      name: 'bulbasaur', types: ['grass'],
      stats: { hp: 300, attack: 120 }, currentHp: 50,
    });
    const target = makePokemon({ name: 'target', types: ['water'] });

    rollsNoCrit();
    const withAbility = calcDamage(
      { ...lowHp, ability: 'overgrow' }, target, GRASS_MOVE,
    );
    rollsNoCrit();
    const withoutAbility = calcDamage(lowHp, target, GRASS_MOVE);

    expect(withAbility.damage).toBeGreaterThan(withoutAbility.damage);
  });
});
