import { describe, it, expect } from 'vitest';
import { applyStatChangeFromFoe, applySwitchInAbility } from '../abilities';
import { makeInitialField, resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function events(): TurnEvent[] { return []; }

describe('Clear Body', () => {
  it('blocks all foe-initiated stat drops', () => {
    const target = makePokemon({ name: 't', ability: 'clear-body' });
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events());
    expect(result.statStages.attack).toBe(0);
  });

  it('emits ability_triggered when blocking', () => {
    const ev: TurnEvent[] = [];
    const target = makePokemon({ name: 't', ability: 'clear-body' });
    applyStatChangeFromFoe(target, 'speed', -2, 1, ev);
    expect(ev.some(e => e.kind === 'ability_triggered' && e.ability === 'clear-body')).toBe(true);
  });

  it('does not block self-inflicted stat drops (target === user path is separate)', () => {
    // applyStatChangeFromFoe is only called for foe-targeting changes; this just
    // confirms a positive change still goes through.
    const target = makePokemon({ name: 't', ability: 'clear-body' });
    const result = applyStatChangeFromFoe(target, 'attack', +1, 1, events());
    expect(result.statStages.attack).toBe(1);
  });
});

describe('Hyper Cutter', () => {
  it('blocks foe-initiated Attack drops', () => {
    const target = makePokemon({ name: 't', ability: 'hyper-cutter' });
    const result = applyStatChangeFromFoe(target, 'attack', -1, 1, events());
    expect(result.statStages.attack).toBe(0);
  });

  it('does not block drops to other stats', () => {
    const target = makePokemon({ name: 't', ability: 'hyper-cutter' });
    const result = applyStatChangeFromFoe(target, 'speed', -1, 1, events());
    expect(result.statStages.speed).toBe(-1);
  });

  it('blocks Intimidate', () => {
    const ev: TurnEvent[] = [];
    const intimidator = makePokemon({ name: 'i', ability: 'intimidate' });
    const target = makePokemon({ name: 't', ability: 'hyper-cutter' });
    const { opponent } = applySwitchInAbility(intimidator, target, makeInitialField(), 1, ev);
    expect(opponent.statStages.attack).toBe(0);
    expect(ev.some(e => e.kind === 'ability_triggered' && e.ability === 'hyper-cutter')).toBe(true);
  });

  it('blocks move-based Attack drops (e.g. Growl)', () => {
    const ev: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const target = makePokemon({ name: 't', ability: 'hyper-cutter' });
    const growl = makeMove({ name: 'growl', damageClass: 'status', power: 0, effect: { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }] } });
    const result = resolveSingleAttack(attacker, target, growl, 1, { preFlinched: false, foeHitUserThisTurn: false }, ev);
    expect(result.defender.statStages.attack).toBe(0);
  });
});

describe('Own Tempo — Intimidate immunity', () => {
  it('blocks Intimidate', () => {
    const ev: TurnEvent[] = [];
    const intimidator = makePokemon({ name: 'i', ability: 'intimidate' });
    const target = makePokemon({ name: 't', ability: 'own-tempo' });
    const { opponent } = applySwitchInAbility(intimidator, target, makeInitialField(), 1, ev);
    expect(opponent.statStages.attack).toBe(0);
    expect(ev.some(e => e.kind === 'ability_triggered' && e.ability === 'own-tempo')).toBe(true);
  });

  it('does not block non-Attack stat drops from foes', () => {
    const target = makePokemon({ name: 't', ability: 'own-tempo' });
    const result = applyStatChangeFromFoe(target, 'defense', -1, 1, events());
    expect(result.statStages.defense).toBe(-1);
  });
});

describe('Inner Focus', () => {
  it('prevents flinching', () => {
    stubRngConst(0); // force every roll: acc passes, no crit, and flinch chance triggers
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'd', types: ['normal'], ability: 'inner-focus' });
    const flinchMove = makeMove({ name: 'iron-head', type: 'normal', power: 80, damageClass: 'physical', effect: { flinchChance: 30 } });
    const result = resolveSingleAttack(attacker, defender, flinchMove, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defenderFlinched).toBe(false);
  });

  it('a normal defender DOES flinch on the same roll', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', types: ['normal'] });
    const defender = makePokemon({ name: 'd', types: ['normal'] });
    const flinchMove = makeMove({ name: 'iron-head', type: 'normal', power: 80, damageClass: 'physical', effect: { flinchChance: 30 } });
    const result = resolveSingleAttack(attacker, defender, flinchMove, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defenderFlinched).toBe(true);
  });

  it('blocks Intimidate', () => {
    const ev: TurnEvent[] = [];
    const intimidator = makePokemon({ name: 'i', ability: 'intimidate' });
    const target = makePokemon({ name: 't', ability: 'inner-focus' });
    const { opponent } = applySwitchInAbility(intimidator, target, makeInitialField(), 1, ev);
    expect(opponent.statStages.attack).toBe(0);
    expect(ev.some(e => e.kind === 'ability_triggered' && e.ability === 'inner-focus')).toBe(true);
  });

  it('does not block drops to other stats', () => {
    const target = makePokemon({ name: 't', ability: 'inner-focus' });
    const result = applyStatChangeFromFoe(target, 'defense', -1, 1, events());
    expect(result.statStages.defense).toBe(-1);
  });
});
