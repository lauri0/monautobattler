import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { absorbsWind } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import type { TurnEvent } from '../../models/types';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

const hurricane    = makeMove({ name: 'hurricane',     type: 'flying', power: 110, damageClass: 'special',  accuracy: 70 });
const blizzard     = makeMove({ name: 'blizzard',      type: 'ice',    power: 110, damageClass: 'special',  accuracy: 70 });
const heatWave     = makeMove({ name: 'heat-wave',     type: 'fire',   power: 95,  damageClass: 'special',  accuracy: 90 });
const icyWind      = makeMove({ name: 'icy-wind',      type: 'ice',    power: 55,  damageClass: 'special',  accuracy: 95 });
const airCutter    = makeMove({ name: 'air-cutter',    type: 'flying', power: 60,  damageClass: 'special',  accuracy: 95 });
const petalBlizzard = makeMove({ name: 'petal-blizzard', type: 'grass', power: 90, damageClass: 'physical', accuracy: 100 });
const surf         = makeMove({ name: 'surf',          type: 'water',  power: 90,  damageClass: 'special',  accuracy: 100 });
const tailwindMove = makeMove({ name: 'tailwind', damageClass: 'status', power: 0,
  accuracy: null, effect: { fieldEffect: 'tailwind' } });

describe('Wind Rider — wind move immunity', () => {
  it('nullifies incoming hurricane', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, hurricane, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('nullifies blizzard', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, blizzard, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('nullifies heat-wave', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, heatWave, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('nullifies icy-wind', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, icyWind, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('nullifies air-cutter', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, airCutter, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('nullifies petal-blizzard', () => {
    const attacker = makePokemon({ name: 'a', stats: { attack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider', stats: { hp: 300 }, currentHp: 300 });
    const result = resolveSingleAttack(attacker, defender, petalBlizzard, 1, ctx, []);
    expect(result.defender.currentHp).toBe(300);
  });

  it('raises Attack by 1 stage when absorbing a wind move', () => {
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider' });
    const result = resolveSingleAttack(attacker, defender, hurricane, 1, ctx, []);
    expect(result.defender.statStages.attack).toBe(1);
  });

  it('emits ability_triggered and 0-damage attack events', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', stats: { specialAttack: 150 } });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider' });
    resolveSingleAttack(attacker, defender, hurricane, 1, ctx, events);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'wind-rider')).toBe(true);
    const atkEvent = events.find(e => e.kind === 'attack');
    expect(atkEvent).toBeDefined();
    if (atkEvent && atkEvent.kind === 'attack') expect(atkEvent.damage).toBe(0);
  });

  it('does not absorb non-wind moves', () => {
    expect(absorbsWind(makePokemon({ name: 'x', ability: 'wind-rider' }), surf)).toBe(false);
  });
});

describe('Wind Rider — Tailwind trigger', () => {
  it('raises Attack by 1 when the bearer sets Tailwind', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', ability: 'wind-rider' });
    const defender = makePokemon({ name: 'b' });
    const result = resolveSingleAttack(attacker, defender, tailwindMove, 1, ctx, events);
    expect(result.attacker.statStages.attack).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'wind-rider')).toBe(true);
  });

  it('does not boost Attack when another Pokémon sets Tailwind (no ability)', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a' });
    const defender = makePokemon({ name: 'b', ability: 'wind-rider' });
    const result = resolveSingleAttack(attacker, defender, tailwindMove, 1, ctx, events);
    expect(result.attacker.statStages.attack).toBe(0);
    expect(result.defender.statStages.attack).toBe(0);
  });
});
