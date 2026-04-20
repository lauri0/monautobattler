import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import type { TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// canAct RNG order when only `confused` is set:
//   1. self-hit roll (1/3)
//   2. if self-hit → confusion self-damage roll (0.85–1.0)

describe('confusion', () => {
  it('hits self when RNG < 1/3 and skips the move', () => {
    stubRng([0, 0.9]); // self-hit, damage roll
    const attacker = makePokemon({ confused: true, confusionTurnsLeft: 3, currentHp: 200, stats: { hp: 200 } });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.find(e => e.kind === 'confusion_hit')).toBeTruthy();
    expect(r.defender.currentHp).toBe(defender.currentHp); // move skipped
    expect(r.attacker.currentHp).toBeLessThan(200);
  });

  it('acts through confusion when RNG >= 1/3 and decrements counter', () => {
    stubRng([0.5, 0, 0.99, 1.0]); // no self-hit, acc, no-crit, roll
    const attacker = makePokemon({ confused: true, confusionTurnsLeft: 3 });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.attacker.confused).toBe(true);
    expect(r.attacker.confusionTurnsLeft).toBe(2);
    expect(r.defender.currentHp).toBeLessThan(defender.currentHp);
  });

  it('confusion wears off when counter reaches 0', () => {
    stubRng([0, 0.99, 1.0]); // post-cure: acc, no-crit, roll
    const attacker = makePokemon({ confused: true, confusionTurnsLeft: 1 });
    const defender = makePokemon();
    const move = makeMove({ power: 60 });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(events.find(e => e.kind === 'confusion_end')).toBeTruthy();
    expect(r.attacker.confused).toBe(false);
    expect(r.attacker.confusionTurnsLeft).toBeUndefined();
  });

  it('confuses move is a no-op on already-confused target', () => {
    stubRng([0, 0.99, 1.0]); // no confusion RNG consumed since target already confused
    const attacker = makePokemon();
    const defender = makePokemon({ confused: true, confusionTurnsLeft: 4 });
    const move = makeMove({ power: 60, effect: { confuses: true, confusionChance: 100 } });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(attacker, defender, move, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(r.defender.confusionTurnsLeft).toBe(4);
  });
});
