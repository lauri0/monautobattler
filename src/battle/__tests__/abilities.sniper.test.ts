import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// acc=pass, crit=forced, roll=max
function rollsCritMax() { stubRng([0, 0, 1.0]); }
// acc=pass, no-crit, roll=max
function rollsNoCritMax() { stubRng([0, 0.99, 1.0]); }

describe('Sniper', () => {
  it('applies 2.25x multiplier on a critical hit instead of 1.5x', () => {
    const sniper = makePokemon({ name: 'sniper', types: ['normal'], ability: 'sniper',
      stats: { attack: 100 } });
    const base = makePokemon({ name: 'base', types: ['normal'],
      stats: { attack: 100 } });
    const target = makePokemon({ name: 'target', types: ['normal'],
      stats: { defense: 100 } });
    const move = makeMove({ name: 'slash', type: 'normal', power: 70, accuracy: 100, damageClass: 'physical' });

    rollsCritMax();
    const withSniper = calcDamage(sniper, target, move);
    rollsCritMax();
    const withoutSniper = calcDamage(base, target, move);

    expect(withSniper.isCrit).toBe(true);
    expect(withoutSniper.isCrit).toBe(true);
    // Sniper crit is 2.25x vs normal 1.5x → ratio should be 2.25/1.5 = 1.5
    expect(withSniper.damage / withoutSniper.damage).toBeCloseTo(1.5, 5);
  });

  it('does not change damage on non-critical hits', () => {
    const sniper = makePokemon({ name: 'sniper', types: ['normal'], ability: 'sniper',
      stats: { attack: 100 } });
    const base = makePokemon({ name: 'base', types: ['normal'],
      stats: { attack: 100 } });
    const target = makePokemon({ name: 'target', types: ['normal'],
      stats: { defense: 100 } });
    const move = makeMove({ name: 'tackle', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' });

    rollsNoCritMax();
    const withSniper = calcDamage(sniper, target, move);
    rollsNoCritMax();
    const withoutSniper = calcDamage(base, target, move);

    expect(withSniper.isCrit).toBe(false);
    expect(withSniper.damage).toBe(withoutSniper.damage);
  });
});
