import { describe, it, expect } from 'vitest';
import { calcDamage, calcExpectedDamage, calcMinDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

const ember  = makeMove({ name: 'ember',  type: 'fire', power: 40, damageClass: 'special',  accuracy: 100 });
const tackle = makeMove({ name: 'tackle', type: 'normal', power: 60, damageClass: 'physical', accuracy: 100 });

describe('Infiltrator', () => {
  it('ignores Light Screen on special moves', () => {
    const attacker = makePokemon({ ability: 'infiltrator', stats: { specialAttack: 100 } });
    const plain    = makePokemon({ stats: { specialAttack: 100 } });
    const defender = makePokemon({ stats: { specialDefense: 100, hp: 400 }, currentHp: 400 });
    const screens  = { lightScreen: true };

    stubRng([0, 0.99]);
    const withInfiltrator = calcDamage(attacker, defender, ember, 1.0, screens);

    stubRng([0, 0.99]);
    const withoutAbility = calcDamage(plain, defender, ember, 1.0, screens);

    // Infiltrator should deal roughly double the screened damage
    expect(withInfiltrator.damage).toBeGreaterThan(withoutAbility.damage);
    expect(withInfiltrator.damage / withoutAbility.damage).toBeCloseTo(2, 0);
  });

  it('ignores Reflect on physical moves', () => {
    const attacker = makePokemon({ ability: 'infiltrator', stats: { attack: 100 } });
    const plain    = makePokemon({ stats: { attack: 100 } });
    const defender = makePokemon({ stats: { defense: 100, hp: 400 }, currentHp: 400 });
    const screens  = { reflect: true };

    stubRng([0, 0.99]);
    const withInfiltrator = calcDamage(attacker, defender, tackle, 1.0, screens);

    stubRng([0, 0.99]);
    const withoutAbility = calcDamage(plain, defender, tackle, 1.0, screens);

    expect(withInfiltrator.damage).toBeGreaterThan(withoutAbility.damage);
    expect(withInfiltrator.damage / withoutAbility.damage).toBeCloseTo(2, 0);
  });

  it('does not affect damage when no screen is active', () => {
    const attacker = makePokemon({ ability: 'infiltrator', stats: { specialAttack: 100 } });
    const plain    = makePokemon({ stats: { specialAttack: 100 } });
    const defender = makePokemon({ stats: { specialDefense: 100, hp: 400 }, currentHp: 400 });

    stubRng([0, 0.99]);
    const withInfiltrator = calcDamage(attacker, defender, ember, 1.0);

    stubRng([0, 0.99]);
    const withoutAbility = calcDamage(plain, defender, ember, 1.0);

    expect(withInfiltrator.damage).toBe(withoutAbility.damage);
  });

  it('ignores Light Screen in calcMinDamage and calcExpectedDamage', () => {
    const attacker = makePokemon({ ability: 'infiltrator', stats: { specialAttack: 100 } });
    const plain    = makePokemon({ stats: { specialAttack: 100 } });
    const defender = makePokemon({ stats: { specialDefense: 100, hp: 400 }, currentHp: 400 });
    const screens  = { lightScreen: true };

    expect(calcMinDamage(attacker, defender, ember, screens))
      .toBeGreaterThan(calcMinDamage(plain, defender, ember, screens));

    expect(calcExpectedDamage(attacker, defender, ember, screens))
      .toBeGreaterThan(calcExpectedDamage(plain, defender, ember, screens));
  });
});
