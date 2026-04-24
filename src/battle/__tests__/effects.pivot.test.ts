import { describe, it, expect } from 'vitest';
import { applyActions } from '../teamBattleEngine';
import { makeInitialField } from '../battleEngine';
import type { BattlePokemon, Team, TeamBattleState } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

function mkTeam(mons: BattlePokemon[]): Team {
  const filler = makePokemon({ currentHp: 0 });
  while (mons.length < 4) mons = [...mons, filler];
  return { pokemon: mons, activeIdx: 0 };
}

function mkState(side0: Team, side1: Team): TeamBattleState {
  return { teams: [side0, side1], turn: 1, phase: 'choose', field: makeInitialField() };
}

describe('pivot switches (U-turn / Volt Switch)', () => {
  it('triggers pivot phase and stashes opponent move as pendingAttack', () => {
    const uturn = makeMove({ id: 77, name: 'uturn', power: 70, damageClass: 'physical', effect: { pivotSwitch: true } });
    const tackle = makeMove({ id: 33, name: 'tackle', power: 40, damageClass: 'physical' });

    const p0active = makePokemon({ name: 'pivot', moves: [uturn], stats: { speed: 200 } });
    const p0bench = makePokemon({ name: 'bench0', moves: [tackle] });
    const p0bench2 = makePokemon({ name: 'bench0b', moves: [tackle] });
    const p1active = makePokemon({ name: 'target', moves: [tackle] });
    const p1b = makePokemon({ name: 'p1b' });
    const p1c = makePokemon({ name: 'p1c' });

    const state = mkState(
      mkTeam([p0active, p0bench, p0bench2]),
      mkTeam([p1active, p1b, p1c]),
    );

    stubRng([
      0, 0.99, 1.0, // side0 attack: acc, no-crit, roll — pivot hits
    ]);
    const { next, events } = applyActions(
      state,
      { kind: 'move', move: uturn },
      { kind: 'move', move: tackle },
    );
    expect(next.phase).toBe('pivot0');
    expect(next.pendingAttack).toBeTruthy();
    expect(next.pendingAttack!.side).toBe(1);
    expect(next.pendingAttack!.move.id).toBe(tackle.id);
    // Opponent's tackle has NOT resolved yet
    expect(events.some(e => e.kind === 'attack' && e.attackerName === 'target')).toBe(false);
  });

  it('resolves pending opponent attack against the incoming pokemon', () => {
    const uturn = makeMove({ id: 77, name: 'uturn', power: 70, damageClass: 'physical', effect: { pivotSwitch: true } });
    const tackle = makeMove({ id: 33, name: 'tackle', power: 40, damageClass: 'physical' });

    const p0active = makePokemon({ name: 'pivot', moves: [uturn], stats: { speed: 200 } });
    const p0bench = makePokemon({ name: 'incoming', moves: [tackle] });
    const p0bench2 = makePokemon({ name: 'other' });
    const p1active = makePokemon({ name: 'target', moves: [tackle] });

    let state = mkState(
      mkTeam([p0active, p0bench, p0bench2]),
      mkTeam([p1active, makePokemon({ name: 'p1b' }), makePokemon({ name: 'p1c' })]),
    );

    // Turn 1: u-turn + tackle
    stubRng([0, 0.99, 1.0]); // u-turn hit
    let step = applyActions(state, { kind: 'move', move: uturn }, { kind: 'move', move: tackle });
    state = step.next;
    expect(state.phase).toBe('pivot0');

    // Resolve pivot: switch to bench slot 1
    stubRng([0, 0.99, 1.0]); // pending tackle: acc, no-crit, roll
    const incomingHpBefore = state.teams[0].pokemon[1].currentHp;
    step = applyActions(state, { kind: 'switch', targetIdx: 1 }, null);
    state = step.next;

    // Active on side 0 should now be the incoming pokemon
    expect(state.teams[0].activeIdx).toBe(1);
    const incomingAfter = state.teams[0].pokemon[1];
    expect(incomingAfter.data.name).toBe('incoming');
    expect(incomingAfter.currentHp).toBeLessThan(incomingHpBefore);
    expect(state.phase).toBe('choose');
  });

  it('does not trigger pivot when there are no alive benched pokemon', () => {
    const uturn = makeMove({ id: 77, name: 'uturn', power: 70, damageClass: 'physical', effect: { pivotSwitch: true } });
    const tackle = makeMove({ id: 33, name: 'tackle', power: 40, damageClass: 'physical' });

    const p0active = makePokemon({ name: 'pivot', moves: [uturn], stats: { speed: 200 } });
    const p0benchFainted = makePokemon({ name: 'f1', currentHp: 0 });
    const p0benchFainted2 = makePokemon({ name: 'f2', currentHp: 0 });
    const p1active = makePokemon({ name: 'target', moves: [tackle] });

    const state = mkState(
      mkTeam([p0active, p0benchFainted, p0benchFainted2]),
      mkTeam([p1active, makePokemon(), makePokemon()]),
    );

    stubRng([0, 0.99, 1.0, 0, 0.99, 1.0]); // both attacks resolve normally
    const { next } = applyActions(state, { kind: 'move', move: uturn }, { kind: 'move', move: tackle });
    expect(next.phase).toBe('choose');
    expect(next.pendingAttack).toBeUndefined();
    expect(next.teams[0].activeIdx).toBe(0);
  });

  it('missed pivot move does NOT trigger pivot phase', () => {
    const uturn = makeMove({ id: 77, name: 'uturn', power: 70, accuracy: 50, damageClass: 'physical', effect: { pivotSwitch: true } });
    const tackle = makeMove({ id: 33, name: 'tackle', power: 40, damageClass: 'physical' });

    const p0active = makePokemon({ name: 'pivot', moves: [uturn], stats: { speed: 200 } });
    const p0bench = makePokemon({ name: 'bench' });
    const p1active = makePokemon({ name: 'target', moves: [tackle] });

    const state = mkState(
      mkTeam([p0active, p0bench, makePokemon()]),
      mkTeam([p1active, makePokemon(), makePokemon()]),
    );

    // 0.99 > 0.5 → miss; then tackle: acc, no-crit, roll
    stubRng([0.99, 0, 0.99, 1.0]);
    const { next } = applyActions(state, { kind: 'move', move: uturn }, { kind: 'move', move: tackle });
    expect(next.phase).toBe('choose');
  });
});
