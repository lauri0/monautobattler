import { describe, it, expect } from 'vitest';
import { makeInitialField, resolveSingleAttack } from '../battleEngine';
import type { FieldState, TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// RNG call order inside resolveSingleAttack when attacker has no status/confusion:
//   1. accuracy roll      (always, if move.accuracy !== null)
//   2. crit roll           (always when it gets past accuracy + effectiveness != 0)
//   3. damage roll         (0.85–1.0 range)
//   4+. secondary-effect rolls in this order:
//        - statChance       (only if statChanges present AND statChance !== 0)
//        - ailmentChance    (only if ailment present AND ailmentChance !== 0)
//        - flinchChance     (only if flinchChance present)
//        - confusionChance  (only if confuses)
//        - confusion turns  (only if confusion actually applied)
//        - lock turnsLeft   (only if confusesUser fires and user is not already locked/confused)

describe('drain / recoil', () => {
  it('heals user for percentage of damage dealt', () => {
    stubRng([0, 0.99, 1.0]); // accuracy, no-crit, max roll
    const attacker = makePokemon({ name: 'atk', currentHp: 50, stats: { hp: 200 } });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 60, damageClass: 'physical', effect: { drain: 50 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    const attackEvent = events.find(e => e.kind === 'attack')!;
    const drainEvent = events.find(e => e.kind === 'drain');
    if (!drainEvent || drainEvent.kind !== 'drain') throw new Error('no drain event');
    const damage = attackEvent.kind === 'attack' ? attackEvent.damage : 0;
    expect(drainEvent.healed).toBe(Math.max(1, Math.floor(damage * 0.5)));
    expect(r.attacker.currentHp).toBe(50 + drainEvent.healed);
  });

  it('does not over-heal past max HP', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'atk', currentHp: 198, stats: { hp: 200 } });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 80, damageClass: 'physical', effect: { drain: 100 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.currentHp).toBe(200);
  });

  it('applies recoil (negative drain) to user', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'atk', currentHp: 200, stats: { hp: 200 } });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 60, damageClass: 'physical', effect: { drain: -33 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    const attackEvent = events.find(e => e.kind === 'attack');
    const recoilEvent = events.find(e => e.kind === 'recoil');
    if (!recoilEvent || recoilEvent.kind !== 'recoil') throw new Error('no recoil event');
    const damage = attackEvent && attackEvent.kind === 'attack' ? attackEvent.damage : 0;
    expect(recoilEvent.damage).toBe(Math.max(1, Math.floor(damage * 0.33)));
    expect(r.attacker.currentHp).toBe(200 - recoilEvent.damage);
  });

  it('no drain/recoil on a missed move', () => {
    stubRng([0.99]); // miss: no further RNG consumed
    const attacker = makePokemon({ name: 'atk', currentHp: 100, stats: { hp: 200 } });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ accuracy: 50, power: 60, damageClass: 'physical', effect: { drain: -50 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.currentHp).toBe(100);
    expect(events.some(e => e.kind === 'recoil' || e.kind === 'drain')).toBe(false);
  });
});

describe('stat changes', () => {
  it('always-on (statChance=0) applies to user', () => {
    stubRng([0, 0.99, 1.0]); // acc, no-crit, roll — no RNG for stat since chance=0
    const attacker = makePokemon({ name: 'atk' });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 60, effect: {
      statChanges: [{ stat: 'attack', change: 1, target: 'user' }],
      statChance: 0,
    }});
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statStages.attack).toBe(1);
  });

  it('percent-based (statChance=100) rolls RNG and applies', () => {
    stubRng([0, 0.99, 1.0, 0.5]); // acc, no-crit, roll, stat roll
    const attacker = makePokemon({ name: 'atk' });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 60, effect: {
      statChanges: [{ stat: 'defense', change: -1, target: 'foe' }],
      statChance: 100,
    }});
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.statStages.defense).toBe(-1);
  });

  it('percent-based rolls RNG and does NOT apply when roll fails', () => {
    stubRng([0, 0.99, 1.0, 0.99]); // last roll = 99 >= 10
    const attacker = makePokemon();
    const defender = makePokemon();
    const move = makeMove({ power: 60, effect: {
      statChanges: [{ stat: 'defense', change: -1, target: 'foe' }],
      statChance: 10,
    }});
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.statStages.defense).toBe(0);
  });

  it('stat stage clamped at +6', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ statStages: { attack: 6 } });
    const defender = makePokemon();
    const move = makeMove({ power: 60, effect: {
      statChanges: [{ stat: 'attack', change: 2, target: 'user' }],
      statChance: 0,
    }});
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statStages.attack).toBe(6);
  });
});

describe('ailment application', () => {
  it('applies burn to non-immune target when roll passes', () => {
    stubRng([0, 0.99, 1.0, 0]); // acc, no-crit, roll, ailment roll 0 < 30
    const attacker = makePokemon();
    const defender = makePokemon({ types: ['normal'] });
    const move = makeMove({ power: 60, type: 'fire', effect: { ailment: 'burn', ailmentChance: 30 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.statusCondition).toBe('burn');
  });

  it('type immunity blocks burn on fire-types without consuming RNG', () => {
    stubRng([0, 0.99, 1.0]); // NO ailment roll
    const attacker = makePokemon();
    const defender = makePokemon({ types: ['fire'] });
    const move = makeMove({ power: 60, type: 'water', effect: { ailment: 'burn', ailmentChance: 100 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.statusCondition).toBeUndefined();
  });

  it('does not overwrite an existing status', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon();
    const defender = makePokemon({ types: ['normal'], statusCondition: 'poison' });
    const move = makeMove({ power: 60, effect: { ailment: 'paralysis', ailmentChance: 100 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.statusCondition).toBe('poison');
  });
});

describe('flinch', () => {
  it('sets defenderFlinched when flinch roll passes', () => {
    stubRng([0, 0.99, 1.0, 0]); // last: flinch roll 0 < 30
    const attacker = makePokemon();
    const defender = makePokemon();
    const move = makeMove({ power: 60, effect: { flinchChance: 30 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defenderFlinched).toBe(true);
  });

  it('does not flinch when roll fails', () => {
    stubRng([0, 0.99, 1.0, 0.99]);
    const attacker = makePokemon();
    const defender = makePokemon();
    const move = makeMove({ power: 60, effect: { flinchChance: 30 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defenderFlinched).toBe(false);
  });
});

describe('context-power multipliers', () => {
  it('Revenge doubles power when attacker was hit earlier this turn', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'atk' });
    const defender = makePokemon({ name: 'def' });
    const move = makeMove({ power: 60, damageClass: 'physical', effect: { doublePowerIfHit: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: true }, events);
    const withBonus = events.find(e => e.kind === 'attack')!;
    stubRng([0, 0.99, 1.0]);
    const events2: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events2);
    const without = events2.find(e => e.kind === 'attack')!;
    if (withBonus.kind !== 'attack' || without.kind !== 'attack') throw new Error();
    expect(withBonus.damage).toBeGreaterThan(without.damage * 1.9);
    expect(withBonus.damage).toBeLessThan(without.damage * 2.1);
  });

  it('Hex doubles power when target has a major status condition', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon();
    const defender = makePokemon({ statusCondition: 'poison' });
    const move = makeMove({ power: 60, damageClass: 'special', effect: { doublePowerIfTargetStatus: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    const hit = events.find(e => e.kind === 'attack');

    stubRng([0, 0.99, 1.0]);
    const attacker2 = makePokemon();
    const defender2 = makePokemon(); // no status
    const events2: TurnEvent[] = [];
    resolveSingleAttack(attacker2, defender2, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events2);
    const hit2 = events2.find(e => e.kind === 'attack');
    if (!hit || hit.kind !== 'attack' || !hit2 || hit2.kind !== 'attack') throw new Error();
    expect(hit.damage).toBeGreaterThan(hit2.damage);
  });

  it('firstTurnOnly move fails on turn 2', () => {
    const attacker = makePokemon();
    const defender = makePokemon();
    const move = makeMove({ power: 40, effect: { firstTurnOnly: true } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 2, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events[0].kind).toBe('move_failed');
    expect(r.defender.currentHp).toBe(defender.currentHp);
  });

  it('useFoeAttack uses defender attack stat', () => {
    stubRng([0, 0.99, 1.0]);
    // Weak attacker, strong defender — foul-play-like move should hit hard
    const attacker = makePokemon({ name: 'atk', stats: { attack: 10 } });
    const defender = makePokemon({ name: 'def', stats: { attack: 200 } });
    const move = makeMove({ power: 60, damageClass: 'physical', effect: { useFoeAttack: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    const attackEv = events.find(e => e.kind === 'attack')!;

    // Control: same move but no useFoeAttack
    stubRng([0, 0.99, 1.0]);
    const move2 = makeMove({ power: 60, damageClass: 'physical' });
    const events2: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move2, 1, { preFlinched: false, foeHitUserThisTurn: false }, events2);
    const attackEv2 = events2.find(e => e.kind === 'attack')!;

    if (attackEv.kind !== 'attack' || attackEv2.kind !== 'attack') throw new Error();
    expect(attackEv.damage).toBeGreaterThan(attackEv2.damage * 5);
  });
});

describe('Rapid Spin', () => {
  const rapidSpin = () => makeMove({
    name: 'rapid-spin', type: 'normal', damageClass: 'physical', power: 50, accuracy: 100,
    effect: { clearsHazards: true },
  });

  it('clears Stealth Rock from user side after hitting', () => {
    stubRng([0, 0.99, 1.0]); // accuracy, no-crit, damage roll
    const field: FieldState = makeInitialField();
    field.sides[0].stealthRock = true;
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(
      makePokemon({ name: 'atk' }), makePokemon({ name: 'def' }), rapidSpin(), 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, events,
    );
    expect(r.field.sides[0].stealthRock).toBe(false);
    expect(events.some(e => e.kind === 'field_expired' && e.effect === 'stealthRock')).toBe(true);
  });

  it('does not clear Stealth Rock on foe side', () => {
    stubRng([0, 0.99, 1.0]);
    const field: FieldState = makeInitialField();
    field.sides[1].stealthRock = true;
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(
      makePokemon({ name: 'atk' }), makePokemon({ name: 'def' }), rapidSpin(), 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, events,
    );
    expect(r.field.sides[1].stealthRock).toBe(true);
    expect(events.some(e => e.kind === 'field_expired')).toBe(false);
  });

  it('does nothing when no hazards are present', () => {
    stubRng([0, 0.99, 1.0]);
    const field: FieldState = makeInitialField();
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(
      makePokemon({ name: 'atk' }), makePokemon({ name: 'def' }), rapidSpin(), 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, events,
    );
    expect(r.field.sides[0].stealthRock).toBe(false);
    expect(events.some(e => e.kind === 'field_expired')).toBe(false);
  });

  it('does not clear hazards when the move misses', () => {
    stubRng([0.9]); // roll > 0.8 (accuracy 80) → miss
    const field: FieldState = makeInitialField();
    field.sides[0].stealthRock = true;
    const events: TurnEvent[] = [];
    const missMove = makeMove({
      name: 'rapid-spin', type: 'normal', damageClass: 'physical', power: 50, accuracy: 80,
      effect: { clearsHazards: true },
    });
    const r = resolveSingleAttack(
      makePokemon({ name: 'atk' }), makePokemon({ name: 'def' }), missMove, 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, events,
    );
    expect(r.field.sides[0].stealthRock).toBe(true);
  });
});
