import { describe, it, expect } from 'vitest';
import { resolveSingleAttack, applyToxicSpikesOnEntry, makeInitialField } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import type { TurnEvent } from '../../models/types';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

// Damaging move with guaranteed secondary status (ailmentChance: 0 = always applies)
function statusMove(ailment: 'sleep' | 'poison' | 'paralysis') {
  return makeMove({ name: `${ailment}-move`, damageClass: 'physical', power: 40, effect: { ailment, ailmentChance: 0 } });
}

const confusingMove = makeMove({ name: 'confuse-ray', damageClass: 'physical', power: 40, effect: { confuses: true, confusionChance: 0 } });

describe('Limber', () => {
  it('prevents paralysis from a secondary effect', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'limber' });
    const result = resolveSingleAttack(attacker, defender, statusMove('paralysis'), 1, ctx, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });

  it('does not prevent other statuses', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'limber' });
    const result = resolveSingleAttack(attacker, defender, statusMove('poison'), 1, ctx, []);
    expect(result.defender.statusCondition).toBe('poison');
  });
});

describe('Vital Spirit', () => {
  it('prevents sleep from a secondary effect', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'vital-spirit' });
    const result = resolveSingleAttack(attacker, defender, statusMove('sleep'), 1, ctx, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });

  it('prevents sleep from a status move', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'vital-spirit' });
    const sleepPowder = makeMove({ name: 'sleep-powder', damageClass: 'status', power: 0, accuracy: null, effect: { ailment: 'sleep' } });
    const events: TurnEvent[] = [];
    const result = resolveSingleAttack(attacker, defender, sleepPowder, 1, ctx, events);
    expect(result.defender.statusCondition).toBeUndefined();
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
  });
});

describe('Immunity', () => {
  it('prevents poison from a secondary effect', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'immunity' });
    const result = resolveSingleAttack(attacker, defender, statusMove('poison'), 1, ctx, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });

  it('blocks Toxic Spikes poisoning', () => {
    const p = makePokemon({ name: 'b', types: ['normal'], ability: 'immunity' });
    const field = makeInitialField();
    field.sides[0].toxicSpikes = true;
    const { pokemon } = applyToxicSpikesOnEntry(p, field, 0, 1, []);
    expect(pokemon.statusCondition).toBeUndefined();
  });
});

describe('Own Tempo', () => {
  it('prevents confusion from a secondary effect', () => {
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'own-tempo' });
    const result = resolveSingleAttack(attacker, defender, confusingMove, 1, ctx, []);
    expect(result.defender.confused).toBeFalsy();
  });
});
