import { describe, it, expect } from 'vitest';
import { calcDamage, calcMinDamage, calcExpectedDamage } from '../damageCalc';
import { applyStatChangeFromFoe } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const ghost   = makePokemon({ name: 'ghost',   types: ['ghost'],          stats: { defense: 100 } });
const ghostSteel = makePokemon({ name: 'ghost-steel', types: ['ghost', 'steel'], stats: { defense: 100 } });
const normal  = makePokemon({ name: 'normal',  types: ['normal'],         stats: { defense: 100 } });

const scrappy = makePokemon({ name: 'scrappy', types: ['normal'], ability: 'scrappy', stats: { attack: 100 } });
const plain   = makePokemon({ name: 'plain',   types: ['normal'],                     stats: { attack: 100 } });

const normalMove   = makeMove({ name: 'tackle',     type: 'normal',   power: 80, damageClass: 'physical' });
const fightingMove = makeMove({ name: 'close-combat', type: 'fighting', power: 120, damageClass: 'physical' });
const shadowBall   = makeMove({ name: 'shadow-ball', type: 'ghost',    power: 80, damageClass: 'special' });

describe('Scrappy — hits Ghost types with Normal/Fighting', () => {
  it('Normal move hits a Ghost-type defender (no longer immune)', () => {
    stubRngConst(0.99);
    const result = calcDamage(scrappy, ghost, normalMove);
    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('Fighting move hits a Ghost-type defender (no longer immune)', () => {
    stubRngConst(0.99);
    const result = calcDamage(scrappy, ghost, fightingMove);
    expect(result.effectiveness).toBe(1);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('Fighting move vs Ghost/Steel: ghost immunity bypassed, steel super-effective applies', () => {
    stubRngConst(0.99);
    const result = calcDamage(scrappy, ghostSteel, fightingMove);
    expect(result.effectiveness).toBe(2);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('without Scrappy, Normal move is still immune to Ghost', () => {
    stubRngConst(0.99);
    const result = calcDamage(plain, ghost, normalMove);
    expect(result.effectiveness).toBe(0);
    expect(result.damage).toBe(0);
  });

  it('Scrappy does not affect other move types hitting Ghost', () => {
    stubRngConst(0.99);
    const result = calcDamage(scrappy, ghost, shadowBall);
    expect(result.effectiveness).toBe(2);
  });

  it('Scrappy does not affect Normal moves against non-Ghost targets', () => {
    stubRngConst(0.99);
    const withAbility = calcDamage(scrappy, normal, normalMove);
    stubRngConst(0.99);
    const withoutAbility = calcDamage(plain, normal, normalMove);
    expect(withAbility.damage).toBe(withoutAbility.damage);
  });

  it('calcMinDamage respects Scrappy (normal vs ghost > 0)', () => {
    expect(calcMinDamage(scrappy, ghost, normalMove)).toBeGreaterThan(0);
    expect(calcMinDamage(plain,   ghost, normalMove)).toBe(0);
  });

  it('calcExpectedDamage respects Scrappy (normal vs ghost > 0)', () => {
    expect(calcExpectedDamage(scrappy, ghost, normalMove)).toBeGreaterThan(0);
    expect(calcExpectedDamage(plain,   ghost, normalMove)).toBe(0);
  });
});

describe('Scrappy — Intimidate immunity', () => {
  it('blocks foe-initiated Attack drops', () => {
    const events: Parameters<typeof applyStatChangeFromFoe>[4] = [];
    const result = applyStatChangeFromFoe(scrappy, 'attack', -1, 1, events);
    expect(result.statStages.attack).toBe(0);
    expect(events.some(e => e.kind === 'ability_triggered')).toBe(true);
  });

  it('a plain pokemon without Scrappy takes the Intimidate drop', () => {
    const events: Parameters<typeof applyStatChangeFromFoe>[4] = [];
    const result = applyStatChangeFromFoe(plain, 'attack', -1, 1, events);
    expect(result.statStages.attack).toBe(-1);
  });
});
