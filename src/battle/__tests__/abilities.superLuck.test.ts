import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// RNG order inside calcDamage: [acc roll, crit roll, damage roll]
// Crit thresholds: stage 0 → 1/24 ≈ 0.0417, stage 1 → 1/8 = 0.125, stage 2+ → 1/2
// A roll of 0.05 sits between the two thresholds:
//   without super-luck (1/24): 0.05 < 0.0417? No → no crit
//   with super-luck   (1/8):  0.05 < 0.125?  Yes → crit
const BETWEEN_STAGES = 0.05;

const superLuck = makePokemon({ name: 'sl', ability: 'super-luck', stats: { attack: 100 } });
const plain     = makePokemon({ name: 'p',                          stats: { attack: 100 } });
const target    = makePokemon({ name: 't', stats: { defense: 100 } });
const move      = makeMove({ name: 'slash', type: 'normal', power: 70, accuracy: 100, damageClass: 'physical' });

describe('Super Luck', () => {
  it('crits when the roll is between stage-0 and stage-1 thresholds', () => {
    stubRng([0, BETWEEN_STAGES, 1.0]);
    const { isCrit } = calcDamage(superLuck, target, move);
    expect(isCrit).toBe(true);
  });

  it('does not crit at the same roll without the ability', () => {
    stubRng([0, BETWEEN_STAGES, 1.0]);
    const { isCrit } = calcDamage(plain, target, move);
    expect(isCrit).toBe(false);
  });

  it('still crits on a roll below the base threshold', () => {
    stubRng([0, 0.01, 1.0]);
    const { isCrit } = calcDamage(superLuck, target, move);
    expect(isCrit).toBe(true);
  });

  it('does not crit on a roll above the boosted threshold', () => {
    stubRng([0, 0.2, 1.0]);
    const { isCrit } = calcDamage(superLuck, target, move);
    expect(isCrit).toBe(false);
  });

  it('with a high-crit move (critRate=1) the crit probability reaches 1/2', () => {
    const highCritMove = makeMove({
      name: 'slash', type: 'normal', power: 70, accuracy: 100, damageClass: 'physical',
      effect: { critRate: 1 },
    });
    // stage 1 + 1 = 2 → 1/2; a roll of 0.4 should crit
    stubRng([0, 0.4, 1.0]);
    const { isCrit } = calcDamage(superLuck, target, highCritMove);
    expect(isCrit).toBe(true);
  });

  it('with a high-crit move without super-luck, a roll of 0.4 does not crit (stage 1 → 1/8)', () => {
    const highCritMove = makeMove({
      name: 'slash', type: 'normal', power: 70, accuracy: 100, damageClass: 'physical',
      effect: { critRate: 1 },
    });
    stubRng([0, 0.4, 1.0]);
    const { isCrit } = calcDamage(plain, target, highCritMove);
    expect(isCrit).toBe(false);
  });

  it('applies normal 1.5x crit damage (not sniper)', () => {
    const noCritMove = makeMove({ name: 'tackle', type: 'normal', power: 70, accuracy: 100, damageClass: 'physical' });

    stubRng([0, 0, 1.0]); // force crit
    const withCrit = calcDamage(superLuck, target, noCritMove);

    stubRng([0, 0.99, 1.0]); // no crit
    const withoutCrit = calcDamage(superLuck, target, noCritMove);

    expect(withCrit.isCrit).toBe(true);
    expect(withoutCrit.isCrit).toBe(false);
    expect(withCrit.damage / withoutCrit.damage).toBeCloseTo(1.5, 5);
  });

  it('shell armor still blocks crits from super-luck', () => {
    const shellArmor = makePokemon({ name: 'sa', ability: 'shell-armor', stats: { defense: 100 } });
    stubRng([0, BETWEEN_STAGES, 1.0]);
    const { isCrit } = calcDamage(superLuck, shellArmor, move);
    expect(isCrit).toBe(false);
  });
});
