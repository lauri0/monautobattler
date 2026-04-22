import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { getDetailedDefensiveMatchups } from '../../utils/typeChart';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

function rollsNoCritMax() { stubRng([0, 0.99, 1.0]); }

describe('Thick Fat — battle damage reduction', () => {
  it('halves fire-type damage taken', () => {
    const thick = makePokemon({ name: 'thick', types: ['normal'], ability: 'thick-fat',
      stats: { specialDefense: 100 } });
    const plain = makePokemon({ name: 'plain', types: ['normal'],
      stats: { specialDefense: 100 } });
    const attacker = makePokemon({ name: 'fire', types: ['fire'],
      stats: { specialAttack: 100 } });
    const move = makeMove({ name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withThickFat = calcDamage(attacker, thick, move);
    rollsNoCritMax();
    const withoutThickFat = calcDamage(attacker, plain, move);

    expect(withThickFat.damage).toBe(Math.floor(withoutThickFat.damage * 0.5));
  });

  it('halves ice-type damage taken', () => {
    const thick = makePokemon({ name: 'thick', types: ['normal'], ability: 'thick-fat',
      stats: { specialDefense: 100 } });
    const plain = makePokemon({ name: 'plain', types: ['normal'],
      stats: { specialDefense: 100 } });
    const attacker = makePokemon({ name: 'ice', types: ['ice'],
      stats: { specialAttack: 100 } });
    const move = makeMove({ name: 'ice-beam', type: 'ice', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withThickFat = calcDamage(attacker, thick, move);
    rollsNoCritMax();
    const withoutThickFat = calcDamage(attacker, plain, move);

    expect(withThickFat.damage).toBe(Math.floor(withoutThickFat.damage * 0.5));
  });

  it('does not affect other type damage', () => {
    const thick = makePokemon({ name: 'thick', types: ['normal'], ability: 'thick-fat',
      stats: { specialDefense: 100 } });
    const plain = makePokemon({ name: 'plain', types: ['normal'],
      stats: { specialDefense: 100 } });
    const attacker = makePokemon({ name: 'water', types: ['water'],
      stats: { specialAttack: 100 } });
    const move = makeMove({ name: 'surf', type: 'water', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withThickFat = calcDamage(attacker, thick, move);
    rollsNoCritMax();
    const withoutThickFat = calcDamage(attacker, plain, move);

    expect(withThickFat.damage).toBe(withoutThickFat.damage);
  });

  it('stacks with type resistance: grass/fire base 0.5x becomes 0.25x', () => {
    // Grass resists fire (0.5x), Thick Fat halves again → 0.25x
    const thick = makePokemon({ name: 'thick', types: ['grass'], ability: 'thick-fat',
      stats: { specialDefense: 100 } });
    const plain = makePokemon({ name: 'plain', types: ['grass'],
      stats: { specialDefense: 100 } });
    const attacker = makePokemon({ name: 'fire', types: ['fire'],
      stats: { specialAttack: 100 } });
    const move = makeMove({ name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' });

    rollsNoCritMax();
    const withThickFat = calcDamage(attacker, thick, move);
    rollsNoCritMax();
    const withoutThickFat = calcDamage(attacker, plain, move);

    expect(withThickFat.damage).toBe(Math.floor(withoutThickFat.damage * 0.5));
  });
});

describe('Thick Fat — Pokedex type matchup display', () => {
  it('shows fire as resisted (0.5x) for a normal type with thick-fat', () => {
    const matchups = getDetailedDefensiveMatchups(['normal'], 'thick-fat');
    expect(matchups.resists).toContain('fire');
    expect(matchups.neutral).not.toContain('fire');
  });

  it('shows ice as resisted (0.5x) for a normal type with thick-fat', () => {
    const matchups = getDetailedDefensiveMatchups(['normal'], 'thick-fat');
    expect(matchups.resists).toContain('ice');
    expect(matchups.neutral).not.toContain('ice');
  });

  it('places fire into 0.25x bucket for a fire type with thick-fat (base 0.5x → 0.25x)', () => {
    // Fire resists fire (0.5x base), Thick Fat halves → 0.25x → stronglyResists
    const matchups = getDetailedDefensiveMatchups(['fire'], 'thick-fat');
    expect(matchups.stronglyResists).toContain('fire');
    expect(matchups.resists).not.toContain('fire');
  });

  it('places ice into 0.125x bucket for a fire/ice dual type with thick-fat (base 0.25x → 0.125x)', () => {
    // Fire resists ice (0.5x) × Ice resists ice (0.5x) = 0.25x base, Thick Fat halves → 0.125x
    const matchups = getDetailedDefensiveMatchups(['fire', 'ice'], 'thick-fat');
    expect(matchups.ultraResists).toContain('ice');
    expect(matchups.stronglyResists).not.toContain('ice');
  });

  it('does not change non-fire/ice matchups', () => {
    const withAbility = getDetailedDefensiveMatchups(['normal'], 'thick-fat');
    const withoutAbility = getDetailedDefensiveMatchups(['normal']);
    expect(withAbility.weakTo).toEqual(withoutAbility.weakTo);
    expect(withAbility.immune).toEqual(withoutAbility.immune);
    expect(withAbility.neutral.filter(t => t !== 'fire' && t !== 'ice'))
      .toEqual(withoutAbility.neutral.filter(t => t !== 'fire' && t !== 'ice'));
  });
});
