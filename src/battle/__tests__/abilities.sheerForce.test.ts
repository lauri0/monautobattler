import { describe, it, expect } from 'vitest';
import { calcDamage } from '../damageCalc';
import { sheerForceApplies, sheerForceSuppresses } from '../abilities';
import { runFullBattle } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';

function rollsNoCritMax() { stubRng([0, 0.99, 1.0]); }

describe('sheerForceApplies', () => {
  it('is true for moves with foe-ailment secondary (Thunderbolt)', () => {
    const m = makeMove({ name: 't', type: 'electric', power: 90, damageClass: 'special',
      effect: { ailment: 'paralysis', ailmentChance: 10 } });
    expect(sheerForceApplies(m)).toBe(true);
  });

  it('is true for moves that lower a foe stat (Crunch)', () => {
    const m = makeMove({ name: 'c', type: 'dark', power: 80, damageClass: 'physical',
      effect: { statChance: 20, statChanges: [{ stat: 'defense', change: -1, target: 'foe' }] } });
    expect(sheerForceApplies(m)).toBe(true);
  });

  it('is true for moves that raise a user stat (AncientPower)', () => {
    const m = makeMove({ name: 'ap', type: 'rock', power: 60, damageClass: 'special',
      effect: { statChance: 10, statChanges: [{ stat: 'attack', change: 1, target: 'user' }] } });
    expect(sheerForceApplies(m)).toBe(true);
  });

  it('is true for flinch and confusion secondaries', () => {
    const flinch = makeMove({ power: 70, effect: { flinchChance: 30 } });
    const conf = makeMove({ power: 50, damageClass: 'special',
      effect: { confuses: true, confusionChance: 10 } });
    expect(sheerForceApplies(flinch)).toBe(true);
    expect(sheerForceApplies(conf)).toBe(true);
  });

  it('is false for recoil moves (Double-Edge)', () => {
    const m = makeMove({ power: 120, effect: { drain: -33 } });
    expect(sheerForceApplies(m)).toBe(false);
  });

  it('is false for user self-debuff moves (Superpower)', () => {
    const m = makeMove({ power: 120, effect: { statChance: 100,
      statChanges: [{ stat: 'attack', change: -1, target: 'user' }, { stat: 'defense', change: -1, target: 'user' }] } });
    expect(sheerForceApplies(m)).toBe(false);
  });

  it('is false for pure status moves', () => {
    const m = makeMove({ power: 0, damageClass: 'status', effect: { ailment: 'paralysis' } });
    expect(sheerForceApplies(m)).toBe(false);
  });

  it('is false for moves with no effect at all', () => {
    expect(sheerForceApplies(makeMove({ power: 80 }))).toBe(false);
  });
});

describe('Sheer Force damage boost', () => {
  it('multiplies qualifying move damage by 1.3x', () => {
    const withSF = makePokemon({ name: 'user', types: ['electric'], ability: 'sheer-force',
      stats: { specialAttack: 120 } });
    const noSF   = makePokemon({ name: 'user', types: ['electric'],
      stats: { specialAttack: 120 } });
    const target = makePokemon({ name: 'target', types: ['water'] });
    const move = makeMove({ name: 'bolt', type: 'electric', power: 90, damageClass: 'special',
      effect: { ailment: 'paralysis', ailmentChance: 10 } });

    rollsNoCritMax();
    const sf = calcDamage(withSF, target, move);
    rollsNoCritMax();
    const base = calcDamage(noSF, target, move);

    expect(sf.damage).toBe(Math.floor(base.damage * 1.3));
  });

  it('does not boost non-qualifying moves (Superpower)', () => {
    const withSF = makePokemon({ name: 'user', types: ['fighting'], ability: 'sheer-force',
      stats: { attack: 120 } });
    const noSF   = makePokemon({ name: 'user', types: ['fighting'], stats: { attack: 120 } });
    const target = makePokemon({ name: 'target', types: ['normal'] });
    const move = makeMove({ name: 'super', type: 'fighting', power: 120, damageClass: 'physical',
      effect: { statChance: 100,
        statChanges: [{ stat: 'attack', change: -1, target: 'user' }] } });

    rollsNoCritMax();
    const sf = calcDamage(withSF, target, move);
    rollsNoCritMax();
    const base = calcDamage(noSF, target, move);

    expect(sf.damage).toBe(base.damage);
  });
});

describe('Sheer Force secondary-effect suppression', () => {
  it('suppresses foe ailment on a qualifying move', () => {
    // Force every RNG roll to 0 so the 10% paralysis would normally apply.
    stubRngConst(0);
    const attacker = makePokemon({ name: 'zap', types: ['electric'], ability: 'sheer-force',
      stats: { hp: 400, specialAttack: 150 },
      moves: [makeMove({ name: 'bolt', type: 'electric', power: 90, accuracy: 100, damageClass: 'special',
        effect: { ailment: 'paralysis', ailmentChance: 10 } })] });
    const target = makePokemon({ name: 'target', types: ['normal'],
      stats: { hp: 400, specialDefense: 100 },
      moves: [makeMove({ name: 'tackle', type: 'normal', power: 1, accuracy: 100, damageClass: 'physical' })] });

    const result = runFullBattle(attacker, target);
    const paralyzed = result.log.some(e => e.kind === 'status_applied' && e.condition === 'paralysis');
    expect(paralyzed).toBe(false);
  });

  it('does not suppress recoil on qualifying moves', () => {
    // Contrived move: beneficial secondary + recoil. Sheer Force skips the
    // secondary but recoil still applies.
    stubRngConst(0);
    const attacker = makePokemon({ name: 'x', types: ['normal'], ability: 'sheer-force',
      stats: { hp: 400, attack: 150 },
      moves: [makeMove({ name: 'mix', type: 'normal', power: 80, accuracy: 100, damageClass: 'physical',
        effect: { drain: -33, ailment: 'paralysis', ailmentChance: 100 } })] });
    const target = makePokemon({ name: 'target', types: ['normal'],
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })] });

    const result = runFullBattle(attacker, target);
    expect(result.log.some(e => e.kind === 'recoil')).toBe(true);
    expect(result.log.some(e => e.kind === 'status_applied')).toBe(false);
  });
});

describe('sheerForceSuppresses', () => {
  it('returns false without the ability even on qualifying moves', () => {
    const attacker = makePokemon({ name: 'x' });
    const move = makeMove({ power: 80, effect: { ailment: 'burn', ailmentChance: 10 } });
    expect(sheerForceSuppresses(attacker, move)).toBe(false);
  });
  it('returns true with the ability on qualifying moves', () => {
    const attacker = makePokemon({ name: 'x', ability: 'sheer-force' });
    const move = makeMove({ power: 80, effect: { ailment: 'burn', ailmentChance: 10 } });
    expect(sheerForceSuppresses(attacker, move)).toBe(true);
  });
});
