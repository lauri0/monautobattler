import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

const move = makeMove({ name: 'tackle', type: 'normal', power: 80, damageClass: 'physical', accuracy: 100 });
const attacker = makePokemon({ name: 'a', ability: 'analytic', stats: { attack: 100 } });
const defender = makePokemon({ name: 'd', stats: { hp: 500, defense: 100 } });

function damageMoved(foeMovedBeforeUser: boolean): number {
  stubRng([0.5, 0.99, 0.92]); // hit, no crit, damage roll
  const before = defender.currentHp;
  const result = resolveSingleAttack(attacker, defender, move, 1, {
    preFlinched: false,
    foeHitUserThisTurn: false,
    foeMovedBeforeUser,
  }, []);
  return before - result.defender.currentHp;
}

describe('Analytic', () => {
  it('boosts damage by 30% when moving second', () => {
    const dmgFirst  = damageMoved(false);
    const dmgSecond = damageMoved(true);
    expect(dmgSecond).toBeGreaterThan(dmgFirst * 1.2);
    expect(dmgSecond).toBeLessThan(dmgFirst * 1.4);
  });

  it('does not boost damage when moving first', () => {
    const dmgFirst  = damageMoved(false);
    const dmgSecond = damageMoved(false);
    expect(dmgFirst).toBe(dmgSecond);
  });

  it('does not apply to status moves', () => {
    stubRng([0.5]);
    const statusMove = makeMove({ name: 'growl', type: 'normal', power: 0, damageClass: 'status', accuracy: 100 });
    // resolveSingleAttack with a status move should not crash with foeMovedBeforeUser=true
    const result = resolveSingleAttack(attacker, defender, statusMove, 1, {
      preFlinched: false,
      foeHitUserThisTurn: false,
      foeMovedBeforeUser: true,
    }, []);
    expect(result.dealtDamage).toBe(false);
  });
});
