import { describe, it, expect } from 'vitest';
import { abilityBlocksAilment } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { StatusCondition } from '../../models/types';

const magmaArmor = makePokemon({ name: 'ma', ability: 'magma-armor' });

describe('Magma Armor — abilityBlocksAilment', () => {
  it('blocks freeze', () => {
    expect(abilityBlocksAilment(magmaArmor, 'freeze')).toBe(true);
  });

  it('does not block other status conditions', () => {
    const others: StatusCondition[] = ['burn', 'poison', 'paralysis', 'sleep'];
    for (const s of others) {
      expect(abilityBlocksAilment(magmaArmor, s)).toBe(false);
    }
  });

  it('does not block freeze on a Pokemon without Magma Armor', () => {
    const plain = makePokemon({ name: 'p' });
    expect(abilityBlocksAilment(plain, 'freeze')).toBe(false);
  });
});

describe('Magma Armor — integration via resolveSingleAttack', () => {
  it('prevents freeze from an ice-type move with a freeze chance', () => {
    stubRngConst(0); // ailment chance always passes
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 } });
    // ice beam: 10% freeze chance
    const iceBeam = makeMove({
      name: 'ice-beam', type: 'ice', power: 90, damageClass: 'special',
      effect: { ailment: 'freeze', ailmentChance: 10 },
    });
    const result = resolveSingleAttack(attacker, magmaArmor, iceBeam, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });
});
