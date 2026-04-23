import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { calcDamage } from '../damageCalc';
import { absorbsFire } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

const fireMove = makeMove({ name: 'flamethrower', type: 'fire', power: 90, damageClass: 'special', accuracy: 100 });
const waterMove = makeMove({ name: 'surf', type: 'water', power: 90, damageClass: 'special', accuracy: 100 });
const fireStatus = makeMove({ name: 'will-o-wisp', type: 'fire', damageClass: 'status', power: 0, effect: { ailment: 'burn' } });

describe('Flash Fire — absorption', () => {
  it('nullifies incoming fire-type damaging moves', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', types: ['fire'], stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', types: ['fire'], ability: 'flash-fire', stats: { hp: 200 } });
    const result = resolveSingleAttack(attacker, defender, fireMove, 1, ctx, []);
    expect(result.defender.currentHp).toBe(200);
  });

  it('emits ability_triggered and 0-damage attack events', () => {
    stubRngConst(0);
    const events: import('../../models/types').TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', types: ['fire'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'flash-fire' });
    resolveSingleAttack(attacker, defender, fireMove, 1, ctx, events);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'flash-fire')).toBe(true);
    const atk = events.find(e => e.kind === 'attack');
    expect(atk).toBeDefined();
    if (atk && atk.kind === 'attack') expect(atk.damage).toBe(0);
  });

  it('sets flashFireActive on the defender after absorbing a fire move', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', types: ['fire'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'flash-fire' });
    const result = resolveSingleAttack(attacker, defender, fireMove, 1, ctx, []);
    expect(result.defender.flashFireActive).toBe(true);
  });

  it('does not absorb non-fire moves', () => {
    expect(absorbsFire(makePokemon({ name: 'x', ability: 'flash-fire' }), waterMove)).toBe(false);
  });

  it('does not absorb fire-type status moves', () => {
    expect(absorbsFire(makePokemon({ name: 'x', ability: 'flash-fire' }), fireStatus)).toBe(false);
  });
});

describe('Flash Fire — damage boost', () => {
  it('boosts fire moves by 1.5× when active', () => {
    const boosted = makePokemon({ name: 'b', types: ['fire'], ability: 'flash-fire', flashFireActive: true, stats: { specialAttack: 100 } });
    const unboosted = makePokemon({ name: 'u', types: ['fire'], ability: 'flash-fire', stats: { specialAttack: 100 } });
    const target = makePokemon({ name: 't', types: ['normal'], stats: { specialDefense: 100 } });

    // Use a fixed roll to eliminate RNG variance; check approximate 1.5× ratio
    // (integer flooring means it won't be exact).
    stubRngConst(0.99); // no crit, near-max roll
    const withBoost = calcDamage(boosted, target, fireMove);
    stubRngConst(0.99);
    const withoutBoost = calcDamage(unboosted, target, fireMove);

    expect(withBoost.damage / withoutBoost.damage).toBeCloseTo(1.5, 1);
  });

  it('does not boost non-fire moves', () => {
    stubRngConst(0.99);
    const boosted = makePokemon({ name: 'b', types: ['water'], ability: 'flash-fire', flashFireActive: true, stats: { specialAttack: 100 } });
    const plain = makePokemon({ name: 'p', types: ['water'], ability: 'flash-fire', stats: { specialAttack: 100 } });
    const target = makePokemon({ name: 't', types: ['normal'], stats: { specialDefense: 100 } });

    stubRngConst(0.99);
    const d1 = calcDamage(boosted, target, waterMove);
    stubRngConst(0.99);
    const d2 = calcDamage(plain, target, waterMove);

    expect(d1.damage).toBe(d2.damage);
  });
});
