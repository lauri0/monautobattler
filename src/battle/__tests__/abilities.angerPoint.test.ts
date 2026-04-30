import { describe, it, expect } from 'vitest';
import { applyAngerPoint } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const angerPoint = makePokemon({ name: 'ap', ability: 'anger-point' });
const plain      = makePokemon({ name: 'p' });

describe('Anger Point — unit', () => {
  it('sets Attack to +6 when hit by a critical hit', () => {
    const events: TurnEvent[] = [];
    const result = applyAngerPoint(angerPoint, true, 1, events);
    expect(result.statStages.attack).toBe(6);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'anger-point')).toBe(true);
    expect(events.some(e => e.kind === 'stat_change' && e.stat === 'attack' && e.newStage === 6)).toBe(true);
  });

  it('does not trigger on a non-critical hit', () => {
    const result = applyAngerPoint(angerPoint, false, 1, ev());
    expect(result.statStages.attack).toBe(0);
  });

  it('does not trigger when the bearer is fainted', () => {
    const fainted = { ...angerPoint, currentHp: 0 };
    const result = applyAngerPoint(fainted, true, 1, ev());
    expect(result.statStages.attack).toBe(0);
  });

  it('does not trigger on a Pokemon without Anger Point', () => {
    const result = applyAngerPoint(plain, true, 1, ev());
    expect(result.statStages.attack).toBe(0);
  });

  it('does not boost if Attack is already at +6', () => {
    const maxed = { ...angerPoint, statStages: { ...angerPoint.statStages, attack: 6 } };
    const result = applyAngerPoint(maxed, true, 1, ev());
    expect(result.statStages.attack).toBe(6);
  });

  it('sets Attack to exactly +6 even if currently at a positive stage', () => {
    const boosted = { ...angerPoint, statStages: { ...angerPoint.statStages, attack: 3 } };
    const result = applyAngerPoint(boosted, true, 1, ev());
    expect(result.statStages.attack).toBe(6);
  });

  it('sets Attack to +6 even from a negative stage', () => {
    const lowered = { ...angerPoint, statStages: { ...angerPoint.statStages, attack: -2 } };
    const result = applyAngerPoint(lowered, true, 1, ev());
    expect(result.statStages.attack).toBe(6);
  });
});

describe('Anger Point — integration via resolveSingleAttack', () => {
  it('maxes Attack when hit by a critical hit', () => {
    // stubRngConst(0): crit check 0 < 1/24 → crit; damage roll = 0 (low damage, fine)
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const events: TurnEvent[] = [];
    const result = resolveSingleAttack(attacker, angerPoint, tackle, 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(result.defender.statStages.attack).toBe(6);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'anger-point')).toBe(true);
  });

  it('does not trigger when no critical hit occurs', () => {
    // stubRngConst(0.99): crit check 0.99 >= 1/24 → no crit
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const tackle = makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' });
    const result = resolveSingleAttack(attacker, angerPoint, tackle, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.attack).toBe(0);
  });
});
