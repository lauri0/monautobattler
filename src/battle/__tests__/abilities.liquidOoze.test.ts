import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

const liquidOoze = makePokemon({ name: 'lo', ability: 'liquid-ooze' });

function drainMove() {
  return makeMove({
    name: 'absorb', type: 'grass', power: 20, damageClass: 'special',
    effect: { drain: 50 },
  });
}

describe('Liquid Ooze — integration via resolveSingleAttack', () => {
  it('deals damage to the attacker instead of healing them', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 }, currentHp: 150 });
    const result = resolveSingleAttack(attacker, liquidOoze, drainMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    // attacker should have taken damage, not healed
    expect(result.attacker.currentHp).toBeLessThan(150);
  });

  it('emits ability_triggered and recoil events', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 }, currentHp: 150 });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, liquidOoze, drainMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'liquid-ooze')).toBe(true);
    expect(events.some(e => e.kind === 'recoil' && e.pokemonName === 'a')).toBe(true);
    expect(events.some(e => e.kind === 'drain')).toBe(false);
  });

  it('does not damage the attacker when the defender lacks Liquid Ooze', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 }, currentHp: 150 });
    const plain = makePokemon({ name: 'p' });
    const events: TurnEvent[] = [];
    const result = resolveSingleAttack(attacker, plain, drainMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    // attacker should have healed, not taken damage
    expect(result.attacker.currentHp).toBeGreaterThanOrEqual(150);
    expect(events.some(e => e.kind === 'drain')).toBe(true);
  });

  it('can reduce the attacker to 0 HP', () => {
    stubRngConst(0.5);
    const weakAttacker = makePokemon({ name: 'a', stats: { specialAttack: 100 }, currentHp: 1 });
    const result = resolveSingleAttack(weakAttacker, liquidOoze, drainMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.attacker.currentHp).toBe(0);
  });
});
