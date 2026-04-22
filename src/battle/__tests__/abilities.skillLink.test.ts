import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import type { TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';

// RNG order for a hitsVariable move (no status/confusion on attacker):
//   1. rollVariableHits  (1 call) — skipped when Skill Link is active
//   2. per hit: accuracy (first hit only, if accuracy !== null), crit, damage roll
//
// Subsequent hits have accuracy: null so they skip the accuracy roll.

const CTX = { preFlinched: false, foeHitUserThisTurn: false };

function countAttackEvents(events: TurnEvent[]): number {
  return events.filter(e => e.kind === 'attack').length;
}

describe('Skill Link', () => {
  it('always hits 5 times with a hitsVariable move', () => {
    // No rollVariableHits call. Hit 1: acc + crit + dmg. Hits 2-5: crit + dmg each.
    // Total: 1 + 2 + 4*2 = 11 calls.
    stubRng([
      0,    // hit 1 accuracy (pass)
      0.99, // hit 1 no crit
      1.0,  // hit 1 damage roll
      0.99, // hit 2 no crit
      1.0,  // hit 2 damage roll
      0.99, // hit 3 no crit
      1.0,  // hit 3 damage roll
      0.99, // hit 4 no crit
      1.0,  // hit 4 damage roll
      0.99, // hit 5 no crit
      1.0,  // hit 5 damage roll
    ]);
    const attacker = makePokemon({ ability: 'skill-link' });
    const defender = makePokemon({ stats: { hp: 9999 } });
    const move = makeMove({ power: 25, effect: { hitsVariable: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, events);
    expect(countAttackEvents(events)).toBe(5);
  });

  it('without Skill Link, hitsVariable rolls 2 hits when RNG is low', () => {
    // rollVariableHits returns 2 (r < 3/8 = 0.375). Hit 1: acc + crit + dmg. Hit 2: crit + dmg.
    stubRng([
      0,    // rollVariableHits → 2 hits
      0,    // hit 1 accuracy (pass)
      0.99, // hit 1 no crit
      1.0,  // hit 1 damage roll
      0.99, // hit 2 no crit
      1.0,  // hit 2 damage roll
    ]);
    const attacker = makePokemon();
    const defender = makePokemon({ stats: { hp: 9999 } });
    const move = makeMove({ power: 25, effect: { hitsVariable: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, events);
    expect(countAttackEvents(events)).toBe(2);
  });

  it('without Skill Link, hitsVariable rolls 5 hits when RNG is high', () => {
    // rollVariableHits returns 5 (r >= 7/8 = 0.875).
    stubRng([
      0.9,  // rollVariableHits → 5 hits
      0,    // hit 1 accuracy (pass)
      0.99, // hit 1 no crit
      1.0,  // hit 1 damage roll
      0.99, // hit 2 no crit
      1.0,  // hit 2 damage roll
      0.99, // hit 3 no crit
      1.0,  // hit 3 damage roll
      0.99, // hit 4 no crit
      1.0,  // hit 4 damage roll
      0.99, // hit 5 no crit
      1.0,  // hit 5 damage roll
    ]);
    const attacker = makePokemon();
    const defender = makePokemon({ stats: { hp: 9999 } });
    const move = makeMove({ power: 25, effect: { hitsVariable: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, events);
    expect(countAttackEvents(events)).toBe(5);
  });

  it('Skill Link does not affect hitsExactly moves', () => {
    // hitsExactly: 2 — no rollVariableHits, always 2 hits regardless of ability.
    stubRng([
      0,    // hit 1 accuracy (pass)
      0.99, // hit 1 no crit
      1.0,  // hit 1 damage roll
      0.99, // hit 2 no crit
      1.0,  // hit 2 damage roll
    ]);
    const attacker = makePokemon({ ability: 'skill-link' });
    const defender = makePokemon({ stats: { hp: 9999 } });
    const move = makeMove({ power: 40, effect: { hitsExactly: 2 } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, events);
    expect(countAttackEvents(events)).toBe(2);
  });

  it('Skill Link deals 5× the single-hit damage total', () => {
    stubRngConst(0); // accuracy passes, no crits, min damage roll (still > 0)
    const attacker = makePokemon({ ability: 'skill-link', stats: { attack: 100 } });
    const defender = makePokemon({ stats: { hp: 9999, defense: 100 } });
    const move = makeMove({ power: 25, effect: { hitsVariable: true } });

    const multiEvents: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, multiEvents);
    const totalDamage = multiEvents
      .filter(e => e.kind === 'attack')
      .reduce((sum, e) => sum + (e.kind === 'attack' ? e.damage : 0), 0);

    // Single-hit for reference
    const singleEvents: TurnEvent[] = [];
    resolveSingleAttack(attacker, makePokemon({ stats: { hp: 9999, defense: 100 } }), makeMove({ power: 25 }), 1, CTX, singleEvents);
    const singleDamage = singleEvents.find(e => e.kind === 'attack' && e.kind === 'attack')!;
    const oneDmg = singleDamage.kind === 'attack' ? singleDamage.damage : 0;

    expect(totalDamage).toBe(oneDmg * 5);
  });

  it('stops hitting if the defender faints mid-combo', () => {
    stubRngConst(0); // accuracy passes, no crits, min damage roll
    const attacker = makePokemon({ ability: 'skill-link', stats: { attack: 999 } });
    const defender = makePokemon({ stats: { hp: 1, defense: 1 } });
    const move = makeMove({ power: 25, effect: { hitsVariable: true } });
    const events: TurnEvent[] = [];
    resolveSingleAttack(attacker, defender, move, 1, CTX, events);
    // Defender faints on hit 1, so only 1 attack event is emitted
    expect(countAttackEvents(events)).toBe(1);
  });
});
