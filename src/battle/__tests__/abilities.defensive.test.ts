import { describe, it, expect } from 'vitest';
import { runFullBattle } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import { absorbsWater, absorbsElectric, absorbsStormDrain, sturdyActive, ignoresRecoil } from '../abilities';

describe('Rock Head', () => {
  it('prevents recoil from recoil moves', () => {
    stubRngConst(0);
    const attacker = makePokemon({
      name: 'rhydon', types: ['ground'], ability: 'rock-head',
      stats: { hp: 300, attack: 150 },
      moves: [makeMove({ name: 'double-edge', type: 'normal', power: 120, accuracy: 100,
        damageClass: 'physical', effect: { drain: -33 } })],
    });
    const target = makePokemon({
      name: 'foe', types: ['normal'],
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const result = runFullBattle(attacker, target);
    expect(result.log.some(e => e.kind === 'recoil')).toBe(false);
  });

  it('ignoresRecoil predicate', () => {
    expect(ignoresRecoil(makePokemon({ name: 'a' }))).toBe(false);
    expect(ignoresRecoil(makePokemon({ name: 'a', ability: 'rock-head' }))).toBe(true);
  });

  it('still lets drain (positive drain) heal normally', () => {
    stubRngConst(0);
    const attacker = makePokemon({
      name: 'leechy', types: ['grass'], ability: 'rock-head',
      stats: { hp: 400, attack: 100, specialAttack: 100 },
      currentHp: 100,
      moves: [makeMove({ name: 'giga-drain', type: 'grass', power: 75, accuracy: 100,
        damageClass: 'special', effect: { drain: 50 } })],
    });
    const target = makePokemon({
      name: 'foe', types: ['water'],
      stats: { hp: 500, specialDefense: 100 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const result = runFullBattle(attacker, target);
    expect(result.log.some(e => e.kind === 'drain')).toBe(true);
  });
});

describe('Water Absorb', () => {
  it('heals 1/4 max HP when hit by a water-type attack', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'vaporeon', types: ['water'], ability: 'water-absorb',
      stats: { hp: 400, specialDefense: 100 },
      currentHp: 100,
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'blast', types: ['water'],
      stats: { hp: 300, specialAttack: 120 },
      moves: [makeMove({ name: 'surf', type: 'water', power: 90, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const triggered = result.log.find(e => e.kind === 'ability_triggered' && e.ability === 'water-absorb');
    expect(triggered).toBeDefined();
    const heal = result.log.find(e => e.kind === 'heal' && e.pokemonName === 'vaporeon');
    expect(heal).toBeDefined();
    if (heal && heal.kind === 'heal') {
      expect(heal.healed).toBe(100); // 400 / 4
    }
  });

  it('absorbs damage: attack event shows 0 damage', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'vap', types: ['water'], ability: 'water-absorb',
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'x', types: ['water'],
      stats: { specialAttack: 200 },
      moves: [makeMove({ name: 'hydro', type: 'water', power: 110, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const firstHydro = result.log.find(e => e.kind === 'attack' && e.moveName === 'hydro');
    expect(firstHydro).toBeDefined();
    if (firstHydro && firstHydro.kind === 'attack') {
      expect(firstHydro.damage).toBe(0);
      expect(firstHydro.missed).toBe(false);
    }
  });

  it('does not trigger on non-water attacks', () => {
    expect(absorbsWater(
      makePokemon({ name: 'x', ability: 'water-absorb' }),
      makeMove({ type: 'fire', damageClass: 'special', power: 90 }),
    )).toBe(false);
  });

  it('does not trigger on status water moves', () => {
    expect(absorbsWater(
      makePokemon({ name: 'x', ability: 'water-absorb' }),
      makeMove({ type: 'water', damageClass: 'status', power: 0 }),
    )).toBe(false);
  });
});

describe('Lightning Rod', () => {
  it('nullifies electric damage and raises Sp. Atk by 1', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'rhydon', types: ['ground', 'rock'], ability: 'lightning-rod',
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'zap', types: ['electric'],
      stats: { specialAttack: 200 },
      moves: [makeMove({ name: 'bolt', type: 'electric', power: 90, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const triggered = result.log.find(e => e.kind === 'ability_triggered' && e.ability === 'lightning-rod');
    expect(triggered).toBeDefined();
    const spaRaise = result.log.find(e => e.kind === 'stat_change' && e.pokemonName === 'rhydon' && e.stat === 'special-attack');
    expect(spaRaise).toBeDefined();
    if (spaRaise && spaRaise.kind === 'stat_change') expect(spaRaise.change).toBe(1);
    const firstBolt = result.log.find(e => e.kind === 'attack' && e.moveName === 'bolt');
    if (firstBolt && firstBolt.kind === 'attack') expect(firstBolt.damage).toBe(0);
  });

  it('does not trigger on non-electric attacks', () => {
    expect(absorbsElectric(
      makePokemon({ name: 'x', ability: 'lightning-rod' }),
      makeMove({ type: 'fire', damageClass: 'special', power: 90 }),
    )).toBe(false);
  });

  it('does not trigger on status electric moves (Thunder Wave)', () => {
    expect(absorbsElectric(
      makePokemon({ name: 'x', ability: 'lightning-rod' }),
      makeMove({ type: 'electric', damageClass: 'status', power: 0 }),
    )).toBe(false);
  });
});

describe('Storm Drain', () => {
  it('nullifies water damage and raises Sp. Atk by 1', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'gastrodon', types: ['water', 'ground'], ability: 'storm-drain',
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'vaporeon', types: ['water'],
      stats: { specialAttack: 200 },
      moves: [makeMove({ name: 'surf', type: 'water', power: 90, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const triggered = result.log.find(e => e.kind === 'ability_triggered' && e.ability === 'storm-drain');
    expect(triggered).toBeDefined();
    const spaRaise = result.log.find(e => e.kind === 'stat_change' && e.pokemonName === 'gastrodon' && e.stat === 'special-attack');
    expect(spaRaise).toBeDefined();
    if (spaRaise && spaRaise.kind === 'stat_change') expect(spaRaise.change).toBe(1);
    const firstSurf = result.log.find(e => e.kind === 'attack' && e.moveName === 'surf');
    if (firstSurf && firstSurf.kind === 'attack') expect(firstSurf.damage).toBe(0);
  });

  it('does not trigger on non-water attacks', () => {
    expect(absorbsStormDrain(
      makePokemon({ name: 'x', ability: 'storm-drain' }),
      makeMove({ type: 'fire', damageClass: 'special', power: 90 }),
    )).toBe(false);
  });

  it('does not trigger on status water moves', () => {
    expect(absorbsStormDrain(
      makePokemon({ name: 'x', ability: 'storm-drain' }),
      makeMove({ type: 'water', damageClass: 'status', power: 0 }),
    )).toBe(false);
  });
});

describe('Sturdy', () => {
  it('leaves the defender at 1 HP when a full-HP KO would occur', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'geodude', types: ['rock', 'ground'], ability: 'sturdy',
      stats: { hp: 100, defense: 50 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'big', types: ['water'],
      stats: { hp: 500, specialAttack: 300 },
      moves: [makeMove({ name: 'nuke', type: 'water', power: 200, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const sturdyEvent = result.log.find(e => e.kind === 'ability_triggered' && e.ability === 'sturdy');
    expect(sturdyEvent).toBeDefined();
  });

  it('does NOT trigger when the defender is below full HP', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'geodude', types: ['rock', 'ground'], ability: 'sturdy',
      stats: { hp: 100, defense: 50 },
      currentHp: 99,
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'big', types: ['water'],
      stats: { hp: 500, specialAttack: 300 },
      moves: [makeMove({ name: 'nuke', type: 'water', power: 200, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    expect(result.log.some(e => e.kind === 'ability_triggered' && e.ability === 'sturdy')).toBe(false);
  });

  it('sturdyActive predicate', () => {
    const full = makePokemon({ name: 'x', ability: 'sturdy', stats: { hp: 100 }, currentHp: 100 });
    const hurt = makePokemon({ name: 'x', ability: 'sturdy', stats: { hp: 100 }, currentHp: 99 });
    const noAbility = makePokemon({ name: 'x', stats: { hp: 100 }, currentHp: 100 });
    expect(sturdyActive(full)).toBe(true);
    expect(sturdyActive(hurt)).toBe(false);
    expect(sturdyActive(noAbility)).toBe(false);
  });
});
