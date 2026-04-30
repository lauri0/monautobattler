import { describe, it, expect } from 'vitest';
import { resolveSingleAttack, resolveTurnWithMoves, THROAT_CHOP_TURNS } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

function throatChop() {
  return makeMove({
    name: 'throat-chop', type: 'dark', power: 85,
    damageClass: 'physical', accuracy: 100,
    effect: { throatChop: true },
  });
}

const bugBuzz  = makeMove({ name: 'bug-buzz',    type: 'bug',    power: 90, damageClass: 'special',  accuracy: 100 });
const tackle   = makeMove({ name: 'tackle',       type: 'normal', power: 40, damageClass: 'physical', accuracy: 100 });
const splash   = makeMove({ name: 'splash',       type: 'normal', power: 0,  damageClass: 'status',   accuracy: null });

describe('Throat Chop — applying the effect', () => {
  it('silences the defender after a hit', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'b', stats: { hp: 500, defense: 100 } });
    const result = resolveSingleAttack(attacker, defender, throatChop(), 1, ctx, []);
    expect(result.defender.throatChopTurns).toBe(THROAT_CHOP_TURNS);
  });

  it('emits a throat_chopped event', () => {
    const events: TurnEvent[] = [];
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'b', stats: { hp: 500, defense: 100 } });
    resolveSingleAttack(attacker, defender, throatChop(), 1, ctx, events);
    const ev = events.find(e => e.kind === 'throat_chopped');
    expect(ev).toBeDefined();
    if (ev && ev.kind === 'throat_chopped') {
      expect(ev.pokemonName).toBe('b');
      expect(ev.turns).toBe(THROAT_CHOP_TURNS);
    }
  });

  it('does not silence the defender if already fainted', () => {
    stubRng([0, 0.99, 1.0]);
    const attacker = makePokemon({ name: 'a', stats: { attack: 999 } });
    const defender = makePokemon({ name: 'b', stats: { hp: 1, defense: 1 }, currentHp: 1 });
    const result = resolveSingleAttack(attacker, defender, throatChop(), 1, ctx, []);
    expect(result.defender.currentHp).toBe(0);
    expect(result.defender.throatChopTurns).toBeUndefined();
  });
});

describe('Throat Chop — blocking sound moves', () => {
  it('prevents the silenced pokemon from using bug-buzz', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', throatChopTurns: 2 });
    const defender = makePokemon({ name: 'b' });
    const result = resolveSingleAttack(attacker, defender, bugBuzz, 1, ctx, events);
    expect(result.defender.currentHp).toBe(defender.currentHp);
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
  });

  it('does not block non-sound moves while silenced', () => {
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 }, throatChopTurns: 2 });
    const defender = makePokemon({ name: 'b', stats: { hp: 300, defense: 100 }, currentHp: 300 });
    stubRng([0, 0.99, 1.0]);
    const result = resolveSingleAttack(attacker, defender, tackle, 1, ctx, []);
    expect(result.defender.currentHp).toBeLessThan(300);
  });
});

describe('Throat Chop — countdown', () => {
  it('ticks down and expires after 2 turns', () => {
    stubRngConst(0.5);
    const silenced = makePokemon({ name: 'a', throatChopTurns: 2 });
    const foe      = makePokemon({ name: 'b' });

    // Turn 1: counter goes from 2 → 1
    const r1 = resolveTurnWithMoves(silenced, foe, splash, splash, 1);
    expect(r1.p1After.throatChopTurns).toBe(1);

    // Turn 2: counter goes from 1 → 0, emits throat_chop_end
    const r2 = resolveTurnWithMoves(r1.p1After, r1.p2After, splash, splash, 2);
    expect(r2.p1After.throatChopTurns).toBeUndefined();
    expect(r2.events.some(e => e.kind === 'throat_chop_end' && e.pokemonName === 'a')).toBe(true);
  });
});
