import { describe, it, expect } from 'vitest';
import { applyEndOfTurnAbility } from '../abilities';
import { resolveTurnWithMoves, makeInitialField } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const speedBoost = makePokemon({ name: 'sb', ability: 'speed-boost' });
const plain      = makePokemon({ name: 'p' });

describe('Speed Boost — unit', () => {
  it('raises Speed by 1 stage each time it is called', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnAbility(speedBoost, 1, events);
    expect(result.statStages.speed).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'speed-boost')).toBe(true);
    expect(events.some(e => e.kind === 'stat_change' && e.stat === 'speed' && e.change === 1)).toBe(true);
  });

  it('does not affect other stats', () => {
    const result = applyEndOfTurnAbility(speedBoost, 1, ev());
    expect(result.statStages.attack).toBe(0);
    expect(result.statStages.defense).toBe(0);
    expect(result.statStages['special-attack']).toBe(0);
    expect(result.statStages['special-defense']).toBe(0);
  });

  it('does not trigger on a fainted pokemon', () => {
    const fainted = { ...speedBoost, currentHp: 0 };
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnAbility(fainted, 1, events);
    expect(result.statStages.speed).toBe(0);
    expect(events.length).toBe(0);
  });

  it('does not trigger on a pokemon without Speed Boost', () => {
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnAbility(plain, 1, events);
    expect(result.statStages.speed).toBe(0);
    expect(events.length).toBe(0);
  });

  it('caps Speed raise at +6', () => {
    const atMax = { ...speedBoost, statStages: { ...speedBoost.statStages, speed: 6 } };
    const events: TurnEvent[] = [];
    const result = applyEndOfTurnAbility(atMax, 1, events);
    expect(result.statStages.speed).toBe(6);
    expect(events.length).toBe(0);
  });

  it('stops one stage below cap correctly', () => {
    const nearMax = { ...speedBoost, statStages: { ...speedBoost.statStages, speed: 5 } };
    const result = applyEndOfTurnAbility(nearMax, 1, ev());
    expect(result.statStages.speed).toBe(6);
  });

  it('ability_triggered event appears before stat_change event', () => {
    const events: TurnEvent[] = [];
    applyEndOfTurnAbility(speedBoost, 1, events);
    const triggerIdx = events.findIndex(e => e.kind === 'ability_triggered');
    const statIdx = events.findIndex(e => e.kind === 'stat_change');
    expect(triggerIdx).toBeLessThan(statIdx);
  });
});

describe('Speed Boost — integration via resolveTurnWithMoves', () => {
  it('raises Speed by 1 after each turn', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { speed: 50 } });
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = resolveTurnWithMoves(speedBoost, attacker, tackle, tackle, 1, makeInitialField());
    expect(result.p1After.statStages.speed).toBe(1);
  });

  it('accumulates Speed boosts over multiple turns', () => {
    stubRngConst(0.5);
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const field = makeInitialField();
    let p1 = makePokemon({ name: 'sb', ability: 'speed-boost', stats: { speed: 50, hp: 500 } });
    let p2 = makePokemon({ name: 'a', stats: { hp: 500, attack: 10 } });

    for (let turn = 1; turn <= 3; turn++) {
      const result = resolveTurnWithMoves(p1, p2, tackle, tackle, turn, field);
      p1 = result.p1After;
      p2 = result.p2After;
    }

    expect(p1.statStages.speed).toBe(3);
  });

  it('emits ability_triggered and stat_change events in the turn events', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { speed: 50 } });
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const { events } = resolveTurnWithMoves(speedBoost, attacker, tackle, tackle, 1, makeInitialField());
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'speed-boost')).toBe(true);
    expect(events.some(e => e.kind === 'stat_change' && e.pokemonName === 'sb' && e.stat === 'speed')).toBe(true);
  });
});
