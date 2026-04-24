import { describe, it, expect } from 'vitest';
import { runFullBattle } from '../battleEngine';
import { applyActions, getActive } from '../teamBattleEngine';
import type { BattlePokemon, Team, TeamBattleState } from '../../models/types';
import { makeInitialField } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';

function mkTeam(mons: BattlePokemon[]): Team {
  const filler = makePokemon({ currentHp: 0 });
  while (mons.length < 4) mons = [...mons, filler];
  return { pokemon: mons, activeIdx: 0 };
}

describe('Intimidate', () => {
  it('drops opponent Attack by 1 at 1v1 battle start', () => {
    const attacker = makePokemon({ name: 'gyarados', ability: 'intimidate', moves: [makeMove({ power: 40 })] });
    const defender = makePokemon({ name: 'snorlax', moves: [makeMove({ power: 40 })] });
    const result = runFullBattle(attacker, defender);
    const intimidateDrop = result.log.find(
      e => e.kind === 'stat_change' && e.pokemonName === 'snorlax' && e.stat === 'attack',
    );
    expect(intimidateDrop).toBeDefined();
    if (intimidateDrop && intimidateDrop.kind === 'stat_change') {
      expect(intimidateDrop.change).toBe(-1);
      expect(intimidateDrop.newStage).toBe(-1);
    }
  });

  it('drops foe Attack on mid-battle switch-in (4v4)', () => {
    const move = makeMove({ power: 40 });
    const leader = makePokemon({ id: 2, name: 'leader', moves: [move] });
    const gyarados = makePokemon({ id: 1, name: 'gyarados', ability: 'intimidate', moves: [move] });
    const benchB = makePokemon({ id: 3, name: 'b', moves: [move] });

    const foeActive = makePokemon({ id: 4, name: 'foe', moves: [move] });
    const foeB = makePokemon({ id: 5, name: 'foeB', moves: [move] });
    const foeC = makePokemon({ id: 6, name: 'foeC', moves: [move] });

    const state0: TeamBattleState = {
      teams: [mkTeam([leader, gyarados, benchB]), mkTeam([foeActive, foeB, foeC])],
      turn: 1,
      phase: 'choose',
      field: makeInitialField(),
    };

    // Side 0 switches in Gyarados; side 1 attacks.
    const { next: state1 } = applyActions(
      state0,
      { kind: 'switch', targetIdx: 1 },
      { kind: 'move', move },
    );
    expect(getActive(state1, 0).data.name).toBe('gyarados');
    expect(getActive(state1, 1).statStages.attack).toBe(-1);
  });
});
