import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makeInitialField } from '../battleEngine';
import { getDetailedDefensiveMatchups } from '../../utils/typeChart';
import { makePokemon, makeMove } from './fixtures';

describe('Levitate ability', () => {
  it('grants immunity to ground-type moves in battle', () => {
    const attacker = makePokemon({ name: 'digger', types: ['ground'] });
    const defender = makePokemon({ name: 'floater', types: ['normal'], ability: 'levitate' });
    const groundMove = makeMove({ type: 'ground', damageClass: 'physical', power: 100 });
    const result = calcDamage(attacker, defender, groundMove, 1.0, undefined, makeInitialField());
    expect(result.effectiveness).toBe(0);
    expect(result.damage).toBe(0);
    expect(result.missed).toBe(false);
  });

  it('does not block non-ground moves', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'floater', types: ['normal'], ability: 'levitate' });
    const move = makeMove({ type: 'normal', damageClass: 'physical', power: 80 });
    const result = calcDamage(attacker, defender, move, 1.0);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('surfaces ground immunity in the defensive matchups panel when levitate is selected', () => {
    const withLevitate = getDetailedDefensiveMatchups(['normal'], 'levitate');
    const withoutAbility = getDetailedDefensiveMatchups(['normal']);
    expect(withLevitate.immune).toContain('ground');
    expect(withoutAbility.immune).not.toContain('ground');
    // Neutral bucket should lose 'ground' when levitate is active.
    expect(withLevitate.neutral).not.toContain('ground');
  });

  it('does not alter matchups for ground immunity pokemon already typed flying', () => {
    const flyer = getDetailedDefensiveMatchups(['flying'], 'levitate');
    expect(flyer.immune).toContain('ground');
  });
});
