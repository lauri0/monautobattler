import { describe, it, expect } from 'vitest';
import { applyWeakArmor } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const weakArmor = makePokemon({ name: 'wa', ability: 'weak-armor' });
const plain     = makePokemon({ name: 'p' });

describe('Weak Armor — unit', () => {
  it('lowers Defense by 1 and raises Speed by 2 when hit by a physical move', () => {
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const events: TurnEvent[] = [];
    const result = applyWeakArmor(weakArmor, move, 1, events);
    expect(result.statStages.defense).toBe(-1);
    expect(result.statStages.speed).toBe(2);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'weak-armor')).toBe(true);
  });

  it('does not trigger on a special move', () => {
    const move = makeMove({ name: 'surf', type: 'water', power: 90, damageClass: 'special' });
    const result = applyWeakArmor(weakArmor, move, 1, ev());
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger on a status move', () => {
    const move = makeMove({ name: 'growl', type: 'normal', power: 0, damageClass: 'status' });
    const result = applyWeakArmor(weakArmor, move, 1, ev());
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger when the bearer is already fainted', () => {
    const fainted = { ...weakArmor, currentHp: 0 };
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = applyWeakArmor(fainted, move, 1, ev());
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger on a Pokemon without Weak Armor', () => {
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = applyWeakArmor(plain, move, 1, ev());
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages.speed).toBe(0);
  });

  it('caps Defense drop at -6', () => {
    const atMin = { ...weakArmor, statStages: { ...weakArmor.statStages, defense: -6 } };
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = applyWeakArmor(atMin, move, 1, ev());
    expect(result.statStages.defense).toBe(-6);
    expect(result.statStages.speed).toBe(2);
  });

  it('caps Speed raise at +6', () => {
    const atMax = { ...weakArmor, statStages: { ...weakArmor.statStages, speed: 5 } };
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = applyWeakArmor(atMax, move, 1, ev());
    expect(result.statStages.speed).toBe(6);
  });
});

describe('Weak Armor — integration via resolveSingleAttack', () => {
  it('lowers Defense by 1 and raises Speed by 2 when hit by a physical move', () => {
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = resolveSingleAttack(attacker, weakArmor, tackle, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.defense).toBe(-1);
    expect(result.defender.statStages.speed).toBe(2);
  });

  it('does not trigger when hit by a special move', () => {
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 100 } });
    const surf = makeMove({ name: 'surf', type: 'water', power: 90, damageClass: 'special' });
    const result = resolveSingleAttack(attacker, weakArmor, surf, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.defense).toBe(0);
    expect(result.defender.statStages.speed).toBe(0);
  });
});
