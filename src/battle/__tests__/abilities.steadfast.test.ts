import { describe, it, expect } from 'vitest';
import { applySteadfast } from '../abilities';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

const steadfast = makePokemon({ name: 'sf', ability: 'steadfast' });
const plain     = makePokemon({ name: 'p' });

describe('Steadfast — unit', () => {
  it('raises Speed by 1 and emits ability_triggered', () => {
    const events: TurnEvent[] = [];
    const result = applySteadfast(steadfast, 1, events);
    expect(result.statStages.speed).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'steadfast')).toBe(true);
  });

  it('does not trigger on a Pokemon without Steadfast', () => {
    const result = applySteadfast(plain, 1, []);
    expect(result.statStages.speed).toBe(0);
  });

  it('caps Speed raise at +6', () => {
    const atMax = { ...steadfast, statStages: { ...steadfast.statStages, speed: 6 } };
    const result = applySteadfast(atMax, 1, []);
    expect(result.statStages.speed).toBe(6);
  });
});

describe('Steadfast — integration via resolveTurnWithMoves', () => {
  it('raises Speed when the bearer flinches due to a flinch-inducing move', () => {
    stubRngConst(0); // move hits, crit check passes threshold, flinch chance 100%
    // p2 (steadfast) moves second; p1 uses a 100% flinch move and is faster
    const p1 = makePokemon({ name: 'fast', stats: { attack: 100, speed: 200 } });
    const p2 = makePokemon({ name: 'slow', ability: 'steadfast', stats: { speed: 50 } });
    const flinchMove = makeMove({
      name: 'headbutt', type: 'normal', power: 70, damageClass: 'physical',
      effect: { flinchChance: 100 },
    });
    const splash = makeMove({ name: 'splash', type: 'normal', power: 0, damageClass: 'status' });
    const result = resolveTurnWithMoves(p1, p2, flinchMove, splash, 1);
    expect(result.p2After.statStages.speed).toBe(1);
    expect(result.events.some(e => e.kind === 'ability_triggered' && e.ability === 'steadfast')).toBe(true);
  });

  it('does not raise Speed when the bearer acts freely', () => {
    stubRngConst(0.99);
    const p1 = makePokemon({ name: 'a', stats: { speed: 50 } });
    const p2 = makePokemon({ name: 'b', ability: 'steadfast', stats: { speed: 200 } });
    const splash = makeMove({ name: 'splash', type: 'normal', power: 0, damageClass: 'status' });
    const result = resolveTurnWithMoves(p1, p2, splash, splash, 1);
    expect(result.p2After.statStages.speed).toBe(0);
  });
});
