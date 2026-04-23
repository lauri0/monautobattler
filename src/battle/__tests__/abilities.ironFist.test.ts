import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const attacker = makePokemon({ name: 'a', types: ['normal'], ability: 'iron-fist', stats: { attack: 100 } });
const plain    = makePokemon({ name: 'b', types: ['normal'],                        stats: { attack: 100 } });
const target   = makePokemon({ name: 't', types: ['normal'],                        stats: { defense: 100 } });

const punchMove    = makeMove({ name: 'fire-punch',  type: 'fire',   power: 75, damageClass: 'physical' });
const nonPunchMove = makeMove({ name: 'body-slam',   type: 'normal', power: 85, damageClass: 'physical' });

describe('Iron Fist', () => {
  it('boosts moves whose name contains "punch" by 20%', () => {
    stubRngConst(0.99);
    const boosted = calcDamage(attacker, target, punchMove);
    stubRngConst(0.99);
    const unboosted = calcDamage(plain, target, punchMove);
    expect(boosted.damage / unboosted.damage).toBeCloseTo(1.2, 1);
  });

  it('does not boost moves without "punch" in the name', () => {
    stubRngConst(0.99);
    const withAbility = calcDamage(attacker, target, nonPunchMove);
    stubRngConst(0.99);
    const withoutAbility = calcDamage(plain, target, nonPunchMove);
    expect(withAbility.damage).toBe(withoutAbility.damage);
  });
});
