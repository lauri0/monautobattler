import { describe, it, expect } from 'vitest';
import { applyEventToState, applyTeamEventToState } from '../applyEventToState';
import { makePokemon } from './fixtures';
import type { FieldState, Team, TeamBattleState } from '../../models/types';

function makeField(overrides: Partial<FieldState> = {}): FieldState {
  return {
    trickRoomTurns: 0,
    weatherTurns: 0,
    terrainTurns: 0,
    sides: [
      { tailwindTurns: 0, lightScreenTurns: 0, reflectTurns: 0, stealthRock: false, spikes: 0, toxicSpikes: false },
      { tailwindTurns: 0, lightScreenTurns: 0, reflectTurns: 0, stealthRock: false, spikes: 0, toxicSpikes: false },
    ],
    ...overrides,
  };
}

function makeTeamState(name0: string, name1: string): TeamBattleState {
  const bench = (prefix: string) => [1, 2, 3].map(i => makePokemon({ name: `${prefix}bench${i}` }));
  const team0: Team = { pokemon: [makePokemon({ name: name0, currentHp: 100 }), ...bench('a')], activeIdx: 0 };
  const team1: Team = { pokemon: [makePokemon({ name: name1, currentHp: 100 }), ...bench('b')], activeIdx: 0 };
  return { teams: [team0, team1], turn: 1, phase: 'choose', field: makeField() };
}

describe('applyEventToState (1v1)', () => {
  it('attack: updates defender and attacker HP', () => {
    const p1 = makePokemon({ name: 'pika', currentHp: 100 });
    const p2 = makePokemon({ name: 'char', currentHp: 100 });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'attack', turn: 1,
      attackerName: 'pika', defenderName: 'char',
      moveName: 'Thunderbolt', moveType: 'electric', damageClass: 'special',
      damage: 40, isCrit: false, missed: false, effectiveness: 1,
      attackerHpAfter: 100, defenderHpAfter: 60,
    });
    expect(result.p1.currentHp).toBe(100);
    expect(result.p2.currentHp).toBe(60);
  });

  it('recoil: updates the named pokemon HP', () => {
    const p1 = makePokemon({ name: 'pika', currentHp: 100 });
    const p2 = makePokemon({ name: 'char', currentHp: 80 });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'recoil', turn: 1, pokemonName: 'pika', damage: 20, hpAfter: 80,
    });
    expect(result.p1.currentHp).toBe(80);
    expect(result.p2.currentHp).toBe(80);
  });

  it('status_applied: sets the condition on the named pokemon', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'status_applied', turn: 1, pokemonName: 'char', condition: 'burn',
    });
    expect(result.p2.statusCondition).toBe('burn');
    expect(result.p1.statusCondition).toBeUndefined();
  });

  it('status_cured: clears the condition', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char', statusCondition: 'paralysis' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'status_cured', turn: 1, pokemonName: 'char', condition: 'paralysis',
    });
    expect(result.p2.statusCondition).toBeUndefined();
  });

  it('stat_change: updates the correct stat stage', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'stat_change', turn: 1, pokemonName: 'char', stat: 'attack', change: -1, newStage: -1,
    });
    expect(result.p2.statStages.attack).toBe(-1);
    expect(result.p2.statStages.defense).toBe(0);
  });

  it('weather_set: updates field weather and turns', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField(), {
      kind: 'weather_set', turn: 1, weather: 'rain', turns: 5, pokemonName: 'pika',
    });
    expect(result.field.weather).toBe('rain');
    expect(result.field.weatherTurns).toBe(5);
  });

  it('weather_expired: clears field weather', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const result = applyEventToState(p1, p2, makeField({ weather: 'rain', weatherTurns: 1 }), {
      kind: 'weather_expired', turn: 2, weather: 'rain',
    });
    expect(result.field.weather).toBeUndefined();
    expect(result.field.weatherTurns).toBe(0);
  });

  it('log-only events return the same object references', () => {
    const p1 = makePokemon({ name: 'pika' });
    const p2 = makePokemon({ name: 'char' });
    const field = makeField();
    const result = applyEventToState(p1, p2, field, {
      kind: 'cant_move', turn: 1, pokemonName: 'pika', reason: 'paralysis',
    });
    expect(result.p1).toBe(p1);
    expect(result.p2).toBe(p2);
    expect(result.field).toBe(field);
  });
});

describe('applyTeamEventToState (4v4)', () => {
  it('attack: updates HP across teams by name', () => {
    const state = makeTeamState('pika', 'char');
    const result = applyTeamEventToState(state, {
      side: 0,
      kind: 'attack', turn: 1,
      attackerName: 'pika', defenderName: 'char',
      moveName: 'Thunderbolt', moveType: 'electric', damageClass: 'special',
      damage: 40, isCrit: false, missed: false, effectiveness: 1,
      attackerHpAfter: 100, defenderHpAfter: 60,
    });
    expect(result.teams[0].pokemon[0].currentHp).toBe(100);
    expect(result.teams[1].pokemon[0].currentHp).toBe(60);
  });

  it('switch: updates activeIdx for the switching side only', () => {
    const state = makeTeamState('pika', 'char');
    // abench1 is at index 1 in team 0
    const result = applyTeamEventToState(state, {
      kind: 'switch', turn: 1, side: 0, outName: 'pika', inName: 'abench1',
    });
    expect(result.teams[0].activeIdx).toBe(1);
    expect(result.teams[1].activeIdx).toBe(0);
  });

  it('status_applied: sets condition on the named pokemon in whichever team', () => {
    const state = makeTeamState('pika', 'char');
    const result = applyTeamEventToState(state, {
      side: 1,
      kind: 'status_applied', turn: 1, pokemonName: 'char', condition: 'poison',
    });
    expect(result.teams[1].pokemon[0].statusCondition).toBe('poison');
    expect(result.teams[0].pokemon[0].statusCondition).toBeUndefined();
  });
});
