import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// acc=pass, crit=forced, roll=max
function rollsCritMax() { stubRng([0, 0, 1.0]); }

describe('Shell Armor', () => {
  it('prevents critical hits', () => {
    rollsCritMax();
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'shell-armor' });
    const move = makeMove({ name: 'slash', type: 'normal', power: 70, damageClass: 'physical' });
    const result = calcDamage(attacker, defender, move);
    expect(result.isCrit).toBe(false);
  });

  it('deals less damage than against a non-Shell-Armor target on a forced crit roll', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const plain = makePokemon({ name: 'plain', types: ['normal'] });
    const shelled = makePokemon({ name: 'shelled', types: ['normal'], ability: 'shell-armor' });
    const move = makeMove({ name: 'slash', type: 'normal', power: 70, damageClass: 'physical' });

    rollsCritMax();
    const vsPlain = calcDamage(attacker, plain, move);
    rollsCritMax();
    const vsShelled = calcDamage(attacker, shelled, move);

    expect(vsPlain.isCrit).toBe(true);
    expect(vsShelled.isCrit).toBe(false);
    expect(vsShelled.damage).toBeLessThan(vsPlain.damage);
  });
});
