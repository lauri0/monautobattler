import { describe, it, expect } from 'vitest';
import { abilityBlocksAilment } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { StatusCondition } from '../../models/types';

const waterVeil = makePokemon({ name: 'wv', ability: 'water-veil' });

describe('Water Veil — abilityBlocksAilment', () => {
  it('blocks burn', () => {
    expect(abilityBlocksAilment(waterVeil, 'burn')).toBe(true);
  });

  it('does not block other status conditions', () => {
    const others: StatusCondition[] = ['freeze', 'poison', 'paralysis', 'sleep'];
    for (const s of others) {
      expect(abilityBlocksAilment(waterVeil, s)).toBe(false);
    }
  });

  it('does not block burn on a Pokemon without Water Veil', () => {
    const plain = makePokemon({ name: 'p' });
    expect(abilityBlocksAilment(plain, 'burn')).toBe(false);
  });
});

describe('Water Veil — integration via resolveSingleAttack', () => {
  it('prevents burn from a move with a burn chance', () => {
    stubRngConst(0); // ailment chance always passes
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 } });
    const flamethrower = makeMove({
      name: 'flamethrower', type: 'fire', power: 90, damageClass: 'special',
      effect: { ailment: 'burn', ailmentChance: 10 },
    });
    const result = resolveSingleAttack(attacker, waterVeil, flamethrower, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });

  it('does not prevent other status conditions', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 } });
    const thunderbolt = makeMove({
      name: 'thunderbolt', type: 'electric', power: 90, damageClass: 'special',
      effect: { ailment: 'paralysis', ailmentChance: 10 },
    });
    const result = resolveSingleAttack(attacker, waterVeil, thunderbolt, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statusCondition).toBe('paralysis');
  });
});
