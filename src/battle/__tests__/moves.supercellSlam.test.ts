import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';

function supercellSlam() {
  return makeMove({
    name: 'supercell-slam', type: 'electric', power: 100,
    damageClass: 'physical', accuracy: 95,
    effect: { crashOnMiss: true },
  });
}

const attacker = makePokemon({ name: 'a', stats: { hp: 200, attack: 100 } });
const defender = makePokemon({ name: 'd', stats: { hp: 500, defense: 100 } });

describe('Supercell Slam — crash on miss', () => {
  it('deals crash damage equal to 1/2 max HP when the move misses', () => {
    stubRng([0.99]); // accuracy roll fails (0.99 > 0.95)
    const result = resolveSingleAttack(attacker, defender, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, []);
    // Attacker should have taken floor(200/2) = 100 crash damage
    expect(result.attacker.currentHp).toBe(attacker.currentHp - 100);
    expect(result.defender.currentHp).toBe(defender.currentHp);
    expect(result.dealtDamage).toBe(false);
  });

  it('emits a crash event when the move misses', () => {
    const events: import('../../models/types').TurnEvent[] = [];
    stubRng([0.99]);
    resolveSingleAttack(attacker, defender, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, events);
    const crashEvent = events.find(e => e.kind === 'crash');
    expect(crashEvent).toBeDefined();
    if (crashEvent && crashEvent.kind === 'crash') {
      expect(crashEvent.pokemonName).toBe('a');
      expect(crashEvent.damage).toBe(100);
    }
  });

  it('does not deal crash damage when the move hits', () => {
    stubRng([0.5, 0.99, 0.92]); // hit, no crit, damage roll
    const result = resolveSingleAttack(attacker, defender, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, []);
    expect(result.attacker.currentHp).toBe(attacker.currentHp);
    expect(result.dealtDamage).toBe(true);
  });

  it('crash damage is floored at 1/2 max HP (odd HP)', () => {
    stubRng([0.99]);
    const oddHp = makePokemon({ name: 'b', stats: { hp: 201, attack: 100 } });
    const result = resolveSingleAttack(oddHp, defender, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, []);
    expect(result.attacker.currentHp).toBe(oddHp.currentHp - 100); // floor(201/2) = 100
  });
});

describe('Supercell Slam — crash on ability absorption', () => {
  it('deals crash damage when absorbed by Volt Absorb', () => {
    stubRngConst(0); // always hits
    const voltAbsorber = makePokemon({
      name: 'jolteon', types: ['electric'], ability: 'volt-absorb',
      stats: { hp: 300 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const slamUser = makePokemon({ name: 'a', stats: { hp: 200, attack: 100 } });
    const events: import('../../models/types').TurnEvent[] = [];
    const result = resolveSingleAttack(slamUser, voltAbsorber, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, events);
    expect(result.attacker.currentHp).toBe(slamUser.currentHp - 100);
    expect(events.some(e => e.kind === 'crash')).toBe(true);
  });

  it('deals crash damage when absorbed by Motor Drive', () => {
    stubRngConst(0);
    const motorDriven = makePokemon({
      name: 'electivire', types: ['electric'], ability: 'motor-drive',
      stats: { hp: 300 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const slamUser = makePokemon({ name: 'a', stats: { hp: 200, attack: 100 } });
    const result = resolveSingleAttack(slamUser, motorDriven, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, []);
    expect(result.attacker.currentHp).toBe(slamUser.currentHp - 100);
  });
});

describe('Supercell Slam — crash on type immunity', () => {
  it('deals crash damage against a Ground-type (immune to Electric)', () => {
    stubRngConst(0); // always hits accuracy
    const ground = makePokemon({
      name: 'sandslash', types: ['ground'],
      stats: { hp: 300, defense: 100 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const slamUser = makePokemon({ name: 'a', stats: { hp: 200, attack: 100 } });
    const events: import('../../models/types').TurnEvent[] = [];
    const result = resolveSingleAttack(slamUser, ground, supercellSlam(), 1, {
      preFlinched: false, foeHitUserThisTurn: false,
    }, events);
    expect(result.attacker.currentHp).toBe(slamUser.currentHp - 100);
    expect(result.defender.currentHp).toBe(ground.currentHp); // no damage to defender
    expect(events.some(e => e.kind === 'crash')).toBe(true);
  });
});
