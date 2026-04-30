import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { absorbsSound, isSoundMove } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import type { TurnEvent } from '../../models/types';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

const bugBuzz      = makeMove({ name: 'bug-buzz',      type: 'bug',    power: 90,  damageClass: 'special',  accuracy: 100 });
const hyperVoice   = makeMove({ name: 'hyper-voice',   type: 'normal', power: 90,  damageClass: 'special',  accuracy: 100 });
const snarl        = makeMove({ name: 'snarl',         type: 'dark',   power: 55,  damageClass: 'special',  accuracy: 95  });
const alluringVoice = makeMove({ name: 'alluring-voice', type: 'fairy', power: 80, damageClass: 'special',  accuracy: 100 });
const partingShot  = makeMove({ name: 'parting-shot',  type: 'dark',   power: 0,   damageClass: 'status',   accuracy: 100,
  effect: { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }, { stat: 'special-attack', change: -1, target: 'foe' }], statChance: 0 } });
const surf         = makeMove({ name: 'surf',          type: 'water',  power: 90,  damageClass: 'special',  accuracy: 100 });

describe('isSoundMove', () => {
  it('identifies all listed sound moves', () => {
    expect(isSoundMove(bugBuzz)).toBe(true);
    expect(isSoundMove(hyperVoice)).toBe(true);
    expect(isSoundMove(snarl)).toBe(true);
    expect(isSoundMove(alluringVoice)).toBe(true);
    expect(isSoundMove(partingShot)).toBe(true);
  });

  it('does not flag non-sound moves', () => {
    expect(isSoundMove(surf)).toBe(false);
  });
});

describe('Soundproof — damaging sound moves', () => {
  it('nullifies bug-buzz and deals no damage', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'soundproof', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, bugBuzz, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
    expect(result.dealtDamage).toBe(false);
  });

  it('nullifies hyper-voice', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'soundproof', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, hyperVoice, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('emits ability_triggered and a 0-damage attack event', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'soundproof' });
    resolveSingleAttack(attacker, defender, bugBuzz, 1, ctx, events);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'soundproof')).toBe(true);
    const atkEv = events.find(e => e.kind === 'attack');
    expect(atkEv).toBeDefined();
    if (atkEv && atkEv.kind === 'attack') expect(atkEv.damage).toBe(0);
  });

  it('does not block non-sound moves', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'soundproof', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, surf, 1, ctx, []);
    expect(result.defender.currentHp).toBeLessThan(300);
  });
});

describe('Soundproof — status sound moves', () => {
  it('blocks parting-shot and emits move_failed', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a' });
    const defender = makePokemon({ name: 'b', ability: 'soundproof' });
    const result = resolveSingleAttack(attacker, defender, partingShot, 1, ctx, events);
    expect(result.defender.statStages.attack).toBe(0);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'soundproof')).toBe(true);
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
  });
});

describe('absorbsSound', () => {
  it('returns true for soundproof vs damaging sound move', () => {
    expect(absorbsSound(makePokemon({ name: 'x', ability: 'soundproof' }), bugBuzz)).toBe(true);
  });

  it('returns false for soundproof vs status sound move (handled separately)', () => {
    expect(absorbsSound(makePokemon({ name: 'x', ability: 'soundproof' }), partingShot)).toBe(false);
  });

  it('returns false for non-soundproof vs sound move', () => {
    expect(absorbsSound(makePokemon({ name: 'x' }), bugBuzz)).toBe(false);
  });
});
