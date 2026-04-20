import { describe, it, expect } from 'vitest';
import { resolveSingleAttack, usableMoves } from '../battleEngine';
import type { TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

describe('locked moves (Outrage/Petal Dance/Thrash)', () => {
  it('first use sets lockedMove with turnsLeft in [1,2]', () => {
    const outrage = makeMove({ id: 42, name: 'outrage', power: 120, damageClass: 'physical', type: 'dragon', effect: { confusesUser: true } });
    const attacker = makePokemon({ moves: [outrage] });
    const defender = makePokemon();
    // acc=0, no-crit=0.99, roll=1.0, lock turnsLeft pick=0 → turnsLeft=1
    stubRng([0, 0.99, 1.0, 0]);
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, outrage, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.lockedMove).toEqual({ moveId: 42, turnsLeft: 1 });

    // With RNG=0.99 on the lock pick, turnsLeft should be 2
    stubRng([0, 0.99, 1.0, 0.99]);
    const events2: TurnEvent[] = [];
    const r2 = resolveSingleAttack(attacker, defender, outrage, 1, { preFlinched: false, foeHitUserThisTurn: false }, events2);
    expect(r2.attacker.lockedMove).toEqual({ moveId: 42, turnsLeft: 2 });
  });

  it('usableMoves returns only the locked move', () => {
    const outrage = makeMove({ id: 42, name: 'outrage', power: 120, effect: { confusesUser: true } });
    const tackle = makeMove({ id: 33, name: 'tackle', power: 40 });
    const attacker = makePokemon({ moves: [outrage, tackle], lockedMove: { moveId: 42, turnsLeft: 1 } });
    const options = usableMoves(attacker, 2);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe(42);
  });

  it('tick expires the lock and confuses the user', () => {
    const outrage = makeMove({ id: 42, name: 'outrage', power: 120, damageClass: 'physical', type: 'dragon', effect: { confusesUser: true } });
    const attacker = makePokemon({ moves: [outrage], lockedMove: { moveId: 42, turnsLeft: 1 } });
    const defender = makePokemon();
    // acc, no-crit, roll, confusion-turns pick=0 → 2 turns
    stubRng([0, 0.99, 1.0, 0]);
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, outrage, 2, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.lockedMove).toBeUndefined();
    expect(r.attacker.confused).toBe(true);
    expect(r.attacker.confusionTurnsLeft).toBe(2);
    expect(events.find(e => e.kind === 'confused')).toBeTruthy();
  });

  it('tick with turnsLeft>1 just decrements and keeps lock', () => {
    const outrage = makeMove({ id: 42, name: 'outrage', power: 120, damageClass: 'physical', effect: { confusesUser: true } });
    const attacker = makePokemon({ moves: [outrage], lockedMove: { moveId: 42, turnsLeft: 2 } });
    const defender = makePokemon();
    stubRng([0, 0.99, 1.0]); // no confusion roll consumed
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, outrage, 2, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.lockedMove).toEqual({ moveId: 42, turnsLeft: 1 });
    expect(r.attacker.confused).toBeFalsy();
  });

  it('does not re-lock if attacker is already confused', () => {
    const outrage = makeMove({ id: 42, name: 'outrage', power: 120, effect: { confusesUser: true } });
    // confused=true blocks confusesUser lock even though not already locked
    stubRng([0.9, 0, 0.99, 1.0]); // confusion no-self-hit, acc, no-crit, roll — no lock pick
    const attacker = makePokemon({ moves: [outrage], confused: true, confusionTurnsLeft: 3 });
    const defender = makePokemon();
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, outrage, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.lockedMove).toBeUndefined();
  });
});
