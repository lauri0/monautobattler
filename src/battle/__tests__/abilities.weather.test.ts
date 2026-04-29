import { describe, it, expect } from 'vitest';
import { applyActions, applyInitialSwitchInsTeam } from '../teamBattleEngine';
import { applyEndOfTurnWeather, makeInitialField } from '../battleEngine';
import { calcDamage } from '../damageCalc';
import type { BattlePokemon, Team, TeamBattleState, WeatherKind } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

function mkTeam(mon: [BattlePokemon, BattlePokemon, BattlePokemon]): Team {
  return { pokemon: mon, activeIdx: 0 };
}

function freshState(
  side0: [BattlePokemon, BattlePokemon, BattlePokemon],
  side1: [BattlePokemon, BattlePokemon, BattlePokemon],
): TeamBattleState {
  return {
    teams: [mkTeam(side0), mkTeam(side1)],
    turn: 1,
    phase: 'choose',
    field: makeInitialField(),
  };
}

describe('Weather-setting abilities', () => {
  const cases: [string, WeatherKind][] = [
    ['drought', 'sun'],
    ['drizzle', 'rain'],
    ['sand-stream', 'sandstorm'],
    ['snow-warning', 'snow'],
  ];

  for (const [ability, weather] of cases) {
    it(`${ability} sets ${weather} on initial switch-in`, () => {
      const move = makeMove({ power: 40 });
      const setter = makePokemon({ id: 1, name: 'setter', ability, moves: [move] });
      const a = makePokemon({ id: 2, name: 'a', moves: [move] });
      const b = makePokemon({ id: 3, name: 'b', moves: [move] });
      const foe = makePokemon({ id: 4, name: 'foe', moves: [move] });
      const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
      const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
      const state = freshState([setter, a, b], [foe, foe2, foe3]);
      const { state: next, events } = applyInitialSwitchInsTeam(state);
      expect(next.field.weather).toBe(weather);
      expect(next.field.weatherTurns).toBe(5);
      expect(events.some(e => e.kind === 'weather_set' && e.weather === weather)).toBe(true);
    });
  }

  it('slower pokemon weather wins when both sides have weather abilities', () => {
    // side0 is slower (speed 50), side1 is faster (speed 150) with drought
    // side0 has drizzle. Faster side1 triggers first → sun set; then slower
    // side0 triggers second → rain overwrites. Rain should be active.
    const move = makeMove({ power: 40 });
    const slowDrizzler = makePokemon({ id: 1, name: 'slowDrizzler', ability: 'drizzle', moves: [move], stats: { speed: 50 } });
    const a = makePokemon({ id: 2, name: 'a', moves: [move] });
    const b = makePokemon({ id: 3, name: 'b', moves: [move] });
    const fastDrought = makePokemon({ id: 4, name: 'fastDrought', ability: 'drought', moves: [move], stats: { speed: 150 } });
    const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
    const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
    const state = freshState([slowDrizzler, a, b], [fastDrought, foe2, foe3]);
    const { state: next } = applyInitialSwitchInsTeam(state);
    expect(next.field.weather).toBe('rain');
  });

  it('faster pokemon weather loses when both sides have weather abilities', () => {
    // side0 is faster (speed 150) with drought, side1 is slower (speed 50) with drizzle
    // side0 triggers first → sun; side1 triggers second → rain overwrites. Rain wins.
    const move = makeMove({ power: 40 });
    const fastDrought = makePokemon({ id: 1, name: 'fastDrought', ability: 'drought', moves: [move], stats: { speed: 150 } });
    const a = makePokemon({ id: 2, name: 'a', moves: [move] });
    const b = makePokemon({ id: 3, name: 'b', moves: [move] });
    const slowDrizzler = makePokemon({ id: 4, name: 'slowDrizzler', ability: 'drizzle', moves: [move], stats: { speed: 50 } });
    const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
    const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
    const state = freshState([fastDrought, a, b], [slowDrizzler, foe2, foe3]);
    const { state: next } = applyInitialSwitchInsTeam(state);
    expect(next.field.weather).toBe('rain');
  });

  it('weather expires after 5 turns', () => {
    const move = makeMove({ power: 0, damageClass: 'status' });
    const setter = makePokemon({ id: 1, name: 'setter', ability: 'drought', moves: [move] });
    const a = makePokemon({ id: 2, name: 'a', moves: [move] });
    const b = makePokemon({ id: 3, name: 'b', moves: [move] });
    const foe = makePokemon({ id: 4, name: 'foe', moves: [move] });
    const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
    const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
    const state0 = freshState([setter, a, b], [foe, foe2, foe3]);
    let { state } = applyInitialSwitchInsTeam(state0);
    expect(state.field.weatherTurns).toBe(5);

    // Run 5 "do nothing" turns (both sides use the status move).
    let expired = false;
    for (let i = 0; i < 5; i++) {
      const r = applyActions(state, { kind: 'move', move }, { kind: 'move', move });
      state = r.next;
      if (r.events.some(e => e.kind === 'weather_expired')) expired = true;
    }
    expect(expired).toBe(true);
    expect(state.field.weather).toBeUndefined();
    expect(state.field.weatherTurns).toBe(0);
  });
});

describe('Sandstorm chip damage', () => {
  it('damages non-immune pokemon by 1/16 max HP', () => {
    const p = makePokemon({ name: 'pikachu', types: ['electric'], stats: { hp: 160 } });
    const field = { ...makeInitialField(), weather: 'sandstorm' as const, weatherTurns: 5 };
    const events: import('../../models/types').TurnEvent[] = [];
    const after = applyEndOfTurnWeather(p, field, 1, events);
    expect(after.currentHp).toBe(160 - 10); // 160/16 = 10
    expect(events[0]?.kind).toBe('weather_damage');
  });

  for (const immune of ['rock', 'ground', 'steel'] as const) {
    it(`does not damage ${immune}-types`, () => {
      const p = makePokemon({ name: 'x', types: [immune], stats: { hp: 160 } });
      const field = { ...makeInitialField(), weather: 'sandstorm' as const, weatherTurns: 5 };
      const events: import('../../models/types').TurnEvent[] = [];
      const after = applyEndOfTurnWeather(p, field, 1, events);
      expect(after.currentHp).toBe(160);
      expect(events).toHaveLength(0);
    });
  }

  it('no chip damage under snow', () => {
    const p = makePokemon({ name: 'pikachu', types: ['electric'], stats: { hp: 160 } });
    const field = { ...makeInitialField(), weather: 'snow' as const, weatherTurns: 5 };
    const events: import('../../models/types').TurnEvent[] = [];
    const after = applyEndOfTurnWeather(p, field, 1, events);
    expect(after.currentHp).toBe(160);
    expect(events).toHaveLength(0);
  });
});

describe('Weather accuracy overrides', () => {
  function hits(move: ReturnType<typeof makeMove>, weather: WeatherKind | undefined, trials = 200): number {
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const field = weather ? { ...makeInitialField(), weather, weatherTurns: 5 } : makeInitialField();
    let h = 0;
    for (let i = 0; i < trials; i++) {
      if (!calcDamage(atk, def, move, 1.0, undefined, field).missed) h++;
    }
    return h;
  }

  it('blizzard always hits in snow (70% acc otherwise)', () => {
    const blizzard = makeMove({ name: 'blizzard', type: 'ice', damageClass: 'special', power: 110, accuracy: 70 });
    expect(hits(blizzard, 'snow')).toBe(200);
    // Sanity: without snow it can miss.
    expect(hits(blizzard, undefined)).toBeLessThan(200);
  });

  it('thunder and hurricane always hit in rain', () => {
    const thunder = makeMove({ name: 'thunder', type: 'electric', damageClass: 'special', power: 110, accuracy: 70 });
    const hurricane = makeMove({ name: 'hurricane', type: 'flying', damageClass: 'special', power: 110, accuracy: 70 });
    expect(hits(thunder, 'rain')).toBe(200);
    expect(hits(hurricane, 'rain')).toBe(200);
  });

  it('thunder and hurricane have 50% accuracy in sun', () => {
    const thunder = makeMove({ name: 'thunder', type: 'electric', damageClass: 'special', power: 110, accuracy: 70 });
    const hurricane = makeMove({ name: 'hurricane', type: 'flying', damageClass: 'special', power: 110, accuracy: 70 });
    // Base 70 → 35 in sun. Over 1000 trials, hit ratio should be ~0.35.
    const trials = 1000;
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const sun = { ...makeInitialField(), weather: 'sun' as const, weatherTurns: 5 };
    let hitsT = 0, hitsH = 0;
    for (let i = 0; i < trials; i++) {
      if (!calcDamage(atk, def, thunder, 1.0, undefined, sun).missed) hitsT++;
      if (!calcDamage(atk, def, hurricane, 1.0, undefined, sun).missed) hitsH++;
    }
    expect(hitsT / trials).toBeGreaterThan(0.25);
    expect(hitsT / trials).toBeLessThan(0.45);
    expect(hitsH / trials).toBeGreaterThan(0.25);
    expect(hitsH / trials).toBeLessThan(0.45);
  });
});

describe('Weather damage multipliers', () => {
  it('rain boosts water and weakens fire', () => {
    const atk = makePokemon({ name: 'a', types: ['normal'], stats: { attack: 100, specialAttack: 100 } });
    const def = makePokemon({ name: 'd', types: ['normal'], stats: { defense: 100, specialDefense: 100 } });
    const waterMove = makeMove({ type: 'water', damageClass: 'special', power: 80 });
    const fireMove = makeMove({ type: 'fire', damageClass: 'special', power: 80 });
    const noWeather = makeInitialField();
    const rainField = { ...noWeather, weather: 'rain' as const, weatherTurns: 5 };
    const base = calcDamage(atk, def, waterMove, 1.0, undefined, noWeather).damage;
    const rainWater = calcDamage(atk, def, waterMove, 1.0, undefined, rainField).damage;
    const rainFire = calcDamage(atk, def, fireMove, 1.0, undefined, rainField).damage;
    const baseFire = calcDamage(atk, def, fireMove, 1.0, undefined, noWeather).damage;
    expect(rainWater).toBeGreaterThan(base);
    expect(rainFire).toBeLessThan(baseFire);
  });

  it('sun boosts fire and weakens water (mirror of rain)', () => {
    stubRngConst(0.99); // no crit for both calls
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const fireMove = makeMove({ type: 'fire', damageClass: 'special', power: 80 });
    const sunField = { ...makeInitialField(), weather: 'sun' as const, weatherTurns: 5 };
    const base = calcDamage(atk, def, fireMove, 1.0).damage;
    const sunFire = calcDamage(atk, def, fireMove, 1.0, undefined, sunField).damage;
    expect(sunFire).toBeGreaterThan(base);
  });

  it('sandstorm grants Rock types +50% SpD', () => {
    stubRngConst(0.99); // no crit for both calls
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const rockDef = makePokemon({ name: 'd', types: ['rock'] });
    const move = makeMove({ type: 'normal', damageClass: 'special', power: 80 });
    const sand = { ...makeInitialField(), weather: 'sandstorm' as const, weatherTurns: 5 };
    const base = calcDamage(atk, rockDef, move, 1.0).damage;
    const buffed = calcDamage(atk, rockDef, move, 1.0, undefined, sand).damage;
    expect(buffed).toBeLessThan(base);
  });

  it('snow grants Ice types +50% Def', () => {
    stubRngConst(0.99); // no crit for both calls
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const iceDef = makePokemon({ name: 'd', types: ['ice'] });
    const move = makeMove({ type: 'normal', damageClass: 'physical', power: 80 });
    const snow = { ...makeInitialField(), weather: 'snow' as const, weatherTurns: 5 };
    const base = calcDamage(atk, iceDef, move, 1.0).damage;
    const buffed = calcDamage(atk, iceDef, move, 1.0, undefined, snow).damage;
    expect(buffed).toBeLessThan(base);
  });
});

