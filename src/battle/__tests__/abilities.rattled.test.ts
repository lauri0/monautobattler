import { describe, it, expect } from 'vitest';
import { applyRattledByMove, applyStatChangeFromFoe, applySwitchInAbility } from '../abilities';
import { makeInitialField, resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const rattled = makePokemon({ name: 'r', ability: 'rattled', stats: { defense: 100 } });
const plain   = makePokemon({ name: 'p', stats: { defense: 100 } });

describe('Rattled — hit by triggering move type', () => {
  for (const type of ['bug', 'ghost', 'dark'] as const) {
    it(`raises Speed by 1 stage when hit by a ${type}-type move`, () => {
      const move = makeMove({ name: `${type}-move`, type, power: 60, damageClass: 'physical' });
      const events: TurnEvent[] = [];
      const result = applyRattledByMove(rattled, move, 1, events);
      expect(result.statStages.speed).toBe(1);
      expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'rattled')).toBe(true);
    });
  }

  it('does not trigger on a normal-type move', () => {
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = applyRattledByMove(rattled, move, 1, ev());
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger on a fire-type move', () => {
    const move = makeMove({ name: 'ember', type: 'fire', power: 40, damageClass: 'special' });
    const result = applyRattledByMove(rattled, move, 1, ev());
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger when the bearer is already fainted', () => {
    const fainted = { ...rattled, currentHp: 0 };
    const move = makeMove({ name: 'bite', type: 'dark', power: 60, damageClass: 'physical' });
    const result = applyRattledByMove(fainted, move, 1, ev());
    expect(result.statStages.speed).toBe(0);
  });

  it('does not trigger on a plain pokemon without Rattled', () => {
    const move = makeMove({ name: 'shadow-ball', type: 'ghost', power: 80, damageClass: 'special' });
    const result = applyRattledByMove(plain, move, 1, ev());
    expect(result.statStages.speed).toBe(0);
  });
});

describe('Rattled — triggered in battle via resolveSingleAttack', () => {
  it('raises defender Speed by 1 when hit by a dark-type move', () => {
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', types: ['dark'], stats: { attack: 100 } });
    const bite = makeMove({ name: 'bite', type: 'dark', power: 60, damageClass: 'physical' });
    const result = resolveSingleAttack(attacker, rattled, bite, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.speed).toBe(1);
  });

  it('does not raise defender Speed when hit by a water-type move', () => {
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', types: ['water'], stats: { specialAttack: 100 } });
    const surf = makeMove({ name: 'surf', type: 'water', power: 90, damageClass: 'special' });
    const result = resolveSingleAttack(attacker, rattled, surf, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.speed).toBe(0);
  });
});

describe('Rattled — Intimidate trigger', () => {
  it('raises Speed by 1 stage when Intimidated (Attack drop still applies)', () => {
    const events: TurnEvent[] = [];
    const intimidator = makePokemon({ name: 'i', ability: 'intimidate' });
    const { opponent } = applySwitchInAbility(intimidator, rattled, makeInitialField(), 1, events);
    expect(opponent.statStages.attack).toBe(-1);
    expect(opponent.statStages.speed).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'rattled')).toBe(true);
  });

  it('raises Speed via applyStatChangeFromFoe directly on an Attack drop', () => {
    const events: TurnEvent[] = [];
    const result = applyStatChangeFromFoe(rattled, 'attack', -1, 1, events);
    expect(result.statStages.attack).toBe(-1);
    expect(result.statStages.speed).toBe(1);
  });

  it('does not raise Speed on a non-Attack stat drop', () => {
    const result = applyStatChangeFromFoe(rattled, 'defense', -1, 1, ev());
    expect(result.statStages.speed).toBe(0);
  });
});
