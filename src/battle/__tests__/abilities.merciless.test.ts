import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

const attacker          = makePokemon({ name: 'a',    types: ['normal'], ability: 'merciless', stats: { specialAttack: 100 } });
const plainAttacker     = makePokemon({ name: 'plain', types: ['normal'],                      stats: { specialAttack: 100 } });

const poisonedTarget    = makePokemon({ name: 'poisoned', types: ['normal'], statusCondition: 'poison',   stats: { specialDefense: 100 } });
const healthyTarget     = makePokemon({ name: 'healthy',  types: ['normal'],                              stats: { specialDefense: 100 } });
const shellPoisoned     = makePokemon({ name: 'shell',    types: ['normal'], ability: 'shell-armor', statusCondition: 'poison', stats: { specialDefense: 100 } });

const move = makeMove({ name: 'venoshock', type: 'poison', power: 65, damageClass: 'special' });

// acc=pass, crit=miss (no natural crit), roll=max
function rollNoCrit() { stubRng([0, 0.99, 1.0]); }

describe('Merciless', () => {
  it('always crits a poisoned target', () => {
    // Force the RNG to a value that would never naturally crit (0.99 > 1/24).
    stubRng([0, 0.99, 1.0]);
    const result = calcDamage(attacker, poisonedTarget, move);
    expect(result.isCrit).toBe(true);
  });

  it('does not crit a healthy (non-poisoned) target', () => {
    rollNoCrit();
    const result = calcDamage(attacker, healthyTarget, move);
    expect(result.isCrit).toBe(false);
  });

  it('crits deal more damage than non-crits (crit multiplier applied)', () => {
    stubRng([0, 0.99, 1.0]);
    const critResult = calcDamage(attacker, poisonedTarget, move);

    rollNoCrit();
    const noCritResult = calcDamage(plainAttacker, poisonedTarget, move);

    expect(critResult.damage).toBeGreaterThan(noCritResult.damage);
  });

  it('bypasses Shell Armor on a poisoned target', () => {
    stubRng([0, 0.99, 1.0]);
    const result = calcDamage(attacker, shellPoisoned, move);
    expect(result.isCrit).toBe(true);
  });

  it('plain attacker does not crit a poisoned Shell Armor target', () => {
    rollNoCrit();
    const result = calcDamage(plainAttacker, shellPoisoned, move);
    expect(result.isCrit).toBe(false);
  });

  it('non-poison status (burn) does not trigger Merciless', () => {
    const burnedTarget = makePokemon({ name: 'burned', types: ['normal'], statusCondition: 'burn', stats: { specialDefense: 100 } });
    rollNoCrit();
    const result = calcDamage(attacker, burnedTarget, move);
    expect(result.isCrit).toBe(false);
  });
});
