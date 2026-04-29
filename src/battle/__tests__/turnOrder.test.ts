import { describe, it, expect } from 'vitest';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

describe('turn order', () => {
  it('higher priority attacker goes first regardless of speed', () => {
    const fast = makePokemon({ name: 'fast', stats: { speed: 200 }, moves: [] });
    const slow = makePokemon({ name: 'slow', stats: { speed: 50 }, moves: [] });
    const normalMove = makeMove({ name: 'normal', power: 60, priority: 0 });
    const quick = makeMove({ name: 'quick', power: 60, priority: 1 });

    // fast uses normal, slow uses quick — slow should go first
    stubRng([0, 0.99, 1.0, 0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(fast, slow, normalMove, quick, 1);
    const attacks = r.events.filter(e => e.kind === 'attack');
    expect(attacks[0].kind === 'attack' && attacks[0].attackerName).toBe('slow');
  });

  it('same priority: faster speed attacks first', () => {
    const fast = makePokemon({ name: 'fast', stats: { speed: 200 } });
    const slow = makePokemon({ name: 'slow', stats: { speed: 50 } });
    const move = makeMove({ power: 60 });
    stubRng([0, 0.99, 1.0, 0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(fast, slow, move, move, 1);
    const attacks = r.events.filter(e => e.kind === 'attack');
    expect(attacks[0].kind === 'attack' && attacks[0].attackerName).toBe('fast');
  });

  it('paralysis halves speed and flips order', () => {
    const p1 = makePokemon({ name: 'p1', stats: { speed: 120 } });
    // Unparalyzed p2 faster even though raw speed is lower
    const p2 = makePokemon({ name: 'p2', stats: { speed: 80 }, statusCondition: 'paralysis' });
    // Wait: 120 > 80 regardless. Use paralyzed p1.
    const p1b = makePokemon({ name: 'p1', stats: { speed: 120 }, statusCondition: 'paralysis' }); // effective 60
    const p2b = makePokemon({ name: 'p2', stats: { speed: 80 } });
    const move = makeMove({ power: 60 });
    // p1b paralysis check (RNG 0.5 → acts), acc, no-crit, roll, then p2b's acc, no-crit, roll
    stubRng([0.5, 0, 0.99, 1.0, 0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(p1b, p2b, move, move, 1);
    const attacks = r.events.filter(e => e.kind === 'attack');
    expect(attacks[0].kind === 'attack' && attacks[0].attackerName).toBe('p2');
    // silence unused warnings
    void p1; void p2;
  });

  it('speed tie resolved by Math.random() < 0.5', () => {
    const a = makePokemon({ name: 'a', stats: { speed: 100 } });
    const b = makePokemon({ name: 'b', stats: { speed: 100 } });
    const move = makeMove({ power: 60 });

    // Math.random()=0.1 → p1 first
    stubRng([0.1, 0, 0.99, 1.0, 0, 0.99, 1.0]);
    const r1 = resolveTurnWithMoves(a, b, move, move, 1);
    const first1 = r1.events.filter(e => e.kind === 'attack')[0];
    expect(first1.kind === 'attack' && first1.attackerName).toBe('a');

    // Math.random()=0.9 → p2 first
    stubRng([0.9, 0, 0.99, 1.0, 0, 0.99, 1.0]);
    const r2 = resolveTurnWithMoves(a, b, move, move, 1);
    const first2 = r2.events.filter(e => e.kind === 'attack')[0];
    expect(first2.kind === 'attack' && first2.attackerName).toBe('b');
  });

  it('prankster: slow pokemon with prankster status move goes before fast pokemon using normal move', () => {
    const slow = makePokemon({ name: 'slow', stats: { speed: 50 }, ability: 'prankster' });
    const fast = makePokemon({ name: 'fast', stats: { speed: 200 } });
    const statusMove = makeMove({ name: 'growl', power: 0, damageClass: 'status', priority: 0, effect: { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }] } });
    const normalMove = makeMove({ name: 'tackle', power: 40, priority: 0 });

    // slow's status move (prankster → priority 1) goes before fast's normal move (priority 0).
    // Status moves emit an 'attack' event when landing, followed by 'stat_change'.
    // The first attack event should belong to slow.
    stubRng([0, 0.99, 1.0, 0.99, 0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(slow, fast, statusMove, normalMove, 1);
    const firstAttack = r.events.find(e => e.kind === 'attack');
    expect(firstAttack?.kind === 'attack' && firstAttack.attackerName).toBe('slow');
  });

  it('prankster: does not boost priority of damaging moves', () => {
    const slow = makePokemon({ name: 'slow', stats: { speed: 50 }, ability: 'prankster' });
    const fast = makePokemon({ name: 'fast', stats: { speed: 200 } });
    const damageMove = makeMove({ name: 'tackle', power: 40, damageClass: 'physical', priority: 0 });
    const normalMove = makeMove({ name: 'scratch', power: 40, priority: 0 });

    // fast (speed 200) should go first since prankster does not boost physical moves.
    // Extra RNG: applyContactAbility rolls when fast hits slow (slow has prankster ability).
    stubRng([0, 0.99, 1.0, 0.99, 0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(slow, fast, damageMove, normalMove, 1);
    const attacks = r.events.filter(e => e.kind === 'attack');
    expect(attacks[0].kind === 'attack' && attacks[0].attackerName).toBe('fast');
  });

  it('firstTurnOnly move emits move_failed on turn 2 without damage', () => {
    const a = makePokemon({ name: 'a', stats: { speed: 200 } });
    const b = makePokemon({ name: 'b', stats: { speed: 50 } });
    const fakeOut = makeMove({ name: 'fakeout', power: 40, priority: 3, effect: { firstTurnOnly: true, flinchChance: 100 } });
    const tackle = makeMove({ name: 'tackle', power: 40 });
    // a's fakeout fails (no RNG), then b's tackle: acc, no-crit, roll
    stubRng([0, 0.99, 1.0]);
    const r = resolveTurnWithMoves(a, b, fakeOut, tackle, 2);
    expect(r.events.find(e => e.kind === 'move_failed')).toBeTruthy();
    expect(r.p2After.currentHp).toBe(b.currentHp); // a didn't hit b
  });
});
