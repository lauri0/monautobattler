import { describe, it, expect } from 'vitest';
import { applyActions } from '../teamBattleEngine';
import type { BattlePokemon, Team, TeamBattleState } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

function mkTeam(mons: [BattlePokemon, BattlePokemon, BattlePokemon]): Team {
  return { pokemon: mons, activeIdx: 0 };
}

function mkState(side0: Team, side1: Team): TeamBattleState {
  return { teams: [side0, side1], turn: 1, phase: 'choose' } as TeamBattleState;
}

const tackle = makeMove({ id: 1, name: 'tackle', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' });

describe('Regenerator', () => {
  it('restores floor(maxHP / 3) when switching out voluntarily', () => {
    const regen = makePokemon({
      name: 'regen', types: ['normal'], ability: 'regenerator',
      stats: { hp: 300, speed: 50 },
      currentHp: 100,  // injured: 100 of 300
      moves: [tackle],
    });
    const bench = makePokemon({ name: 'bench', moves: [tackle] });
    const bench2 = makePokemon({ name: 'bench2', moves: [tackle] });
    const foe = makePokemon({ name: 'foe', stats: { speed: 100 }, moves: [tackle] });

    const state = mkState(
      mkTeam([regen, bench, bench2]),
      mkTeam([foe, makePokemon({ name: 'fb' }), makePokemon({ name: 'fc' })]),
    );

    // acc, crit, roll for foe tackle; side0 switches (no rng needed)
    stubRng([0, 0.99, 0.85]);

    const { next } = applyActions(
      state,
      { kind: 'switch', targetIdx: 1 },
      { kind: 'move', move: tackle },
    );

    const switched = next.teams[0].pokemon[0]; // regen is now on bench
    // floor(300 / 3) = 100 → 100 + 100 = 200
    expect(switched.currentHp).toBe(200);
  });

  it('emits ability_triggered and heal events on switch-out', () => {
    const regen = makePokemon({
      name: 'regen', types: ['normal'], ability: 'regenerator',
      stats: { hp: 300, speed: 50 },
      currentHp: 150,
      moves: [tackle],
    });
    const bench = makePokemon({ name: 'bench', moves: [tackle] });
    const bench2 = makePokemon({ name: 'bench2', moves: [tackle] });
    const foe = makePokemon({ name: 'foe', stats: { speed: 100 }, moves: [tackle] });

    const state = mkState(
      mkTeam([regen, bench, bench2]),
      mkTeam([foe, makePokemon({ name: 'fb' }), makePokemon({ name: 'fc' })]),
    );

    stubRng([0, 0.99, 0.85]);

    const { events } = applyActions(
      state,
      { kind: 'switch', targetIdx: 1 },
      { kind: 'move', move: tackle },
    );

    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'regenerator')).toBe(true);
    const healEv = events.find(e => e.kind === 'heal' && e.pokemonName === 'regen');
    expect(healEv).toBeDefined();
    if (healEv && healEv.kind === 'heal') {
      expect(healEv.healed).toBe(100); // floor(300/3)
    }
  });

  it('does not overheal beyond max HP', () => {
    const regen = makePokemon({
      name: 'regen', types: ['normal'], ability: 'regenerator',
      stats: { hp: 300, speed: 50 },
      currentHp: 250,  // only 50 HP missing, but heal would be 100
      moves: [tackle],
    });
    const bench = makePokemon({ name: 'bench', moves: [tackle] });
    const bench2 = makePokemon({ name: 'bench2', moves: [tackle] });
    const foe = makePokemon({ name: 'foe', stats: { speed: 100 }, moves: [tackle] });

    const state = mkState(
      mkTeam([regen, bench, bench2]),
      mkTeam([foe, makePokemon({ name: 'fb' }), makePokemon({ name: 'fc' })]),
    );

    stubRng([0, 0.99, 0.85]);

    const { next } = applyActions(
      state,
      { kind: 'switch', targetIdx: 1 },
      { kind: 'move', move: tackle },
    );

    const switched = next.teams[0].pokemon[0];
    expect(switched.currentHp).toBe(300); // capped at max
  });

  it('does not trigger when at full HP', () => {
    const regen = makePokemon({
      name: 'regen', types: ['normal'], ability: 'regenerator',
      stats: { hp: 300, speed: 50 },
      currentHp: 300,
      moves: [tackle],
    });
    const bench = makePokemon({ name: 'bench', moves: [tackle] });
    const bench2 = makePokemon({ name: 'bench2', moves: [tackle] });
    const foe = makePokemon({ name: 'foe', stats: { speed: 100 }, moves: [tackle] });

    const state = mkState(
      mkTeam([regen, bench, bench2]),
      mkTeam([foe, makePokemon({ name: 'fb' }), makePokemon({ name: 'fc' })]),
    );

    stubRng([0, 0.99, 0.85]);

    const { events } = applyActions(
      state,
      { kind: 'switch', targetIdx: 1 },
      { kind: 'move', move: tackle },
    );

    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'regenerator')).toBe(false);
  });

  it('does not trigger when fainting (replace phase)', () => {
    // regen foe KOs the active; replace phase should not heal the fainted mon
    const regenMon = makePokemon({
      name: 'regen', types: ['normal'], ability: 'regenerator',
      stats: { hp: 100, defense: 1, speed: 50 },
      currentHp: 1,
      moves: [tackle],
    });
    const bench = makePokemon({ name: 'bench', moves: [tackle] });
    const bench2 = makePokemon({ name: 'bench2', moves: [tackle] });
    const attacker = makePokemon({
      name: 'attacker', types: ['normal'],
      stats: { hp: 300, attack: 300, speed: 100 },
      moves: [makeMove({ id: 2, name: 'nuke', type: 'normal', power: 200, accuracy: 100, damageClass: 'physical' })],
    });

    const state = mkState(
      mkTeam([regenMon, bench, bench2]),
      mkTeam([attacker, makePokemon({ name: 'fb' }), makePokemon({ name: 'fc' })]),
    );

    stubRng([0, 0.99, 1.0, 0.5]);  // nuke hits, no crit, max roll, contact ability miss

    const { next, events } = applyActions(
      state,
      { kind: 'move', move: tackle },
      { kind: 'move', move: makeMove({ id: 2, name: 'nuke', type: 'normal', power: 200, accuracy: 100, damageClass: 'physical' }) },
    );

    expect(next.phase).toMatch(/replace/);
    expect(next.teams[0].pokemon[0].currentHp).toBe(0);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'regenerator')).toBe(false);
  });
});
