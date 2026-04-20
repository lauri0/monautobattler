import { describe, it, expect } from 'vitest';
import { resolveSingleAttack, applyEndOfTurnStatus } from '../battleEngine';
import type { TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// ── Paralysis ────────────────────────────────────────────────────────────────
describe('paralysis', () => {
  it('skips the turn when RNG < 1/8', () => {
    stubRng([0.1]); // 0.1 < 1/8 → skip; no further RNG consumed
    const attacker = makePokemon({ statusCondition: 'paralysis' });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.find(e => e.kind === 'cant_move')).toBeTruthy();
    expect(r.defender.currentHp).toBe(defender.currentHp);
  });

  it('acts normally when RNG >= 1/8', () => {
    stubRng([0.5, 0, 0.99, 1.0]); // paralysis pass, acc, no-crit, roll
    const attacker = makePokemon({ statusCondition: 'paralysis' });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.currentHp).toBeLessThan(defender.currentHp);
  });
});

// ── Sleep ────────────────────────────────────────────────────────────────────
describe('sleep', () => {
  it('first turn asleep always skips (no RNG consumed)', () => {
    // sleepTurnsUsed undefined → bumped to 1 → branch emits cant_move without rolling
    const attacker = makePokemon({ statusCondition: 'sleep' });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.find(e => e.kind === 'cant_move')).toBeTruthy();
  });

  it('wakes on turn 3 regardless of RNG', () => {
    stubRng([0, 0.99, 1.0]); // post-wake: acc, no-crit, roll
    const attacker = makePokemon({ statusCondition: 'sleep', sleepTurnsUsed: 2 });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 3, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.find(e => e.kind === 'status_cured')).toBeTruthy();
    expect(r.attacker.statusCondition).toBeUndefined();
    expect(r.defender.currentHp).toBeLessThan(defender.currentHp);
  });

  it('2nd turn asleep wakes when RNG < 1/3', () => {
    stubRng([0.1, 0, 0.99, 1.0]); // wake, then acc, no-crit, roll
    const attacker = makePokemon({ statusCondition: 'sleep', sleepTurnsUsed: 1 });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 2, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statusCondition).toBeUndefined();
  });
});

// ── Freeze ───────────────────────────────────────────────────────────────────
describe('freeze', () => {
  it('thaws (25% chance) when RNG < 0.25', () => {
    stubRng([0.1, 0, 0.99, 1.0]);
    const attacker = makePokemon({ statusCondition: 'freeze' });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statusCondition).toBeUndefined();
  });

  it('stays frozen when RNG >= 0.25', () => {
    stubRng([0.5]); // no further RNG since move is skipped
    const attacker = makePokemon({ statusCondition: 'freeze' });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statusCondition).toBe('freeze');
    expect(events.find(e => e.kind === 'cant_move')).toBeTruthy();
  });

  it('forced thaw after 3 turns', () => {
    stubRng([0.99, 0, 0.99, 1.0]); // even with 0.99 > 0.25, forced since turnsUsed becomes 3
    const attacker = makePokemon({ statusCondition: 'freeze', frozenTurnsUsed: 2 });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 3, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.statusCondition).toBeUndefined();
  });
});

// ── End-of-turn damage ───────────────────────────────────────────────────────
describe('applyEndOfTurnStatus', () => {
  it('burn: HP/16 per turn', () => {
    const p = makePokemon({ statusCondition: 'burn', stats: { hp: 160 }, currentHp: 160 });
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnStatus(p, 1, events);
    expect(after.currentHp).toBe(150); // 160 - 10
    expect(events[0].kind).toBe('status_damage');
  });

  it('poison: HP/8 per turn', () => {
    const p = makePokemon({ statusCondition: 'poison', stats: { hp: 160 }, currentHp: 160 });
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnStatus(p, 1, events);
    expect(after.currentHp).toBe(140); // 160 - 20
  });

  it('no damage when already fainted', () => {
    const p = makePokemon({ statusCondition: 'burn', currentHp: 0 });
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnStatus(p, 1, events);
    expect(after.currentHp).toBe(0);
    expect(events.length).toBe(0);
  });

  it('no damage for non-damaging ailments (paralysis/sleep/freeze)', () => {
    const p = makePokemon({ statusCondition: 'paralysis', currentHp: 100 });
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnStatus(p, 1, events);
    expect(after.currentHp).toBe(100);
    expect(events.length).toBe(0);
  });

  it('burn dealt damage floored at 1', () => {
    const p = makePokemon({ statusCondition: 'burn', stats: { hp: 10 }, currentHp: 10 });
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnStatus(p, 1, events);
    expect(after.currentHp).toBe(9); // floor(10/16)=0, max(1,0)=1
  });
});
