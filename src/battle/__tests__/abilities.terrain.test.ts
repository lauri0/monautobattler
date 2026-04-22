import { describe, it, expect } from 'vitest';
import { applyActions, applyInitialSwitchInsTeam } from '../teamBattleEngine';
import { applyEndOfTurnTerrain, effectivePriority, makeInitialField, resolveSingleAttack } from '../battleEngine';
import { calcDamage } from '../damageCalc';
import type { BattlePokemon, Team, TeamBattleState, TerrainKind, TurnEvent } from '../../models/types';
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

describe('Terrain-setting abilities', () => {
  const cases: [string, TerrainKind][] = [
    ['grassy-surge', 'grassy'],
    ['electric-surge', 'electric'],
    ['psychic-surge', 'psychic'],
    ['misty-surge', 'misty'],
  ];

  for (const [ability, terrain] of cases) {
    it(`${ability} sets ${terrain} terrain on initial switch-in`, () => {
      const move = makeMove({ power: 40 });
      const setter = makePokemon({ id: 1, name: 'setter', ability, moves: [move] });
      const a = makePokemon({ id: 2, name: 'a', moves: [move] });
      const b = makePokemon({ id: 3, name: 'b', moves: [move] });
      const foe = makePokemon({ id: 4, name: 'foe', moves: [move] });
      const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
      const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
      const state = freshState([setter, a, b], [foe, foe2, foe3]);
      const { state: next, events } = applyInitialSwitchInsTeam(state);
      expect(next.field.terrain).toBe(terrain);
      expect(next.field.terrainTurns).toBe(5);
      expect(events.some(e => e.kind === 'terrain_set' && e.terrain === terrain)).toBe(true);
    });
  }

  it('terrain expires after 5 turns', () => {
    const move = makeMove({ power: 0, damageClass: 'status' });
    const setter = makePokemon({ id: 1, name: 'setter', ability: 'grassy-surge', moves: [move] });
    const a = makePokemon({ id: 2, name: 'a', moves: [move] });
    const b = makePokemon({ id: 3, name: 'b', moves: [move] });
    const foe = makePokemon({ id: 4, name: 'foe', moves: [move] });
    const foe2 = makePokemon({ id: 5, name: 'foe2', moves: [move] });
    const foe3 = makePokemon({ id: 6, name: 'foe3', moves: [move] });
    let { state } = applyInitialSwitchInsTeam(freshState([setter, a, b], [foe, foe2, foe3]));
    expect(state.field.terrainTurns).toBe(5);
    let expired = false;
    for (let i = 0; i < 5; i++) {
      const r = applyActions(state, { kind: 'move', move }, { kind: 'move', move });
      state = r.next;
      if (r.events.some(e => e.kind === 'terrain_expired')) expired = true;
    }
    expect(expired).toBe(true);
    expect(state.field.terrain).toBeUndefined();
    expect(state.field.terrainTurns).toBe(0);
  });
});

describe('Terrain damage multipliers', () => {
  it('electric terrain boosts electric-type moves from grounded attackers by 1.3x', () => {
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const move = makeMove({ type: 'electric', damageClass: 'special', power: 80 });
    const base = calcDamage(atk, def, move, 1.0, undefined, makeInitialField()).damage;
    const terrainField = { ...makeInitialField(), terrain: 'electric' as const, terrainTurns: 5 };
    const boosted = calcDamage(atk, def, move, 1.0, undefined, terrainField).damage;
    expect(boosted).toBeGreaterThan(base);
    // 1.3x ratio within rounding tolerance.
    expect(boosted / base).toBeCloseTo(1.3, 1);
  });

  it('grassy terrain does not boost flying (non-grounded) attackers', () => {
    stubRngConst(0.99); // pin crit roll off
    const atk = makePokemon({ name: 'a', types: ['flying'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const move = makeMove({ type: 'grass', damageClass: 'special', power: 80 });
    const base = calcDamage(atk, def, move, 1.0, undefined, makeInitialField()).damage;
    const terrainField = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    const underTerrain = calcDamage(atk, def, move, 1.0, undefined, terrainField).damage;
    expect(underTerrain).toBe(base);
  });

  it('misty terrain halves dragon damage to grounded defenders', () => {
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const move = makeMove({ type: 'dragon', damageClass: 'special', power: 80 });
    const base = calcDamage(atk, def, move, 1.0, undefined, makeInitialField()).damage;
    const mist = { ...makeInitialField(), terrain: 'misty' as const, terrainTurns: 5 };
    const halved = calcDamage(atk, def, move, 1.0, undefined, mist).damage;
    expect(halved).toBeLessThan(base);
    expect(halved / base).toBeCloseTo(0.5, 1);
  });

  it('grassy terrain halves earthquake and bulldoze power against grounded defenders', () => {
    stubRngConst(0.99);
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const grassy = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    for (const name of ['earthquake', 'bulldoze']) {
      const move = makeMove({ name, type: 'ground', damageClass: 'physical', power: 80 });
      const base = calcDamage(atk, def, move, 1.0, undefined, makeInitialField()).damage;
      const halved = calcDamage(atk, def, move, 1.0, undefined, grassy).damage;
      expect(halved / base).toBeCloseTo(0.5, 1);
    }
  });

  it('grassy terrain does not halve earthquake against flying (ungrounded) defenders', () => {
    stubRngConst(0.99);
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['flying'] });
    const move = makeMove({ name: 'earthquake', type: 'ground', damageClass: 'physical', power: 100 });
    // Ground vs Flying is immune anyway — flip defender to a grounded-but-still-flying scenario? Use a non-immune type instead.
    const def2 = makePokemon({ name: 'd2', types: ['flying', 'normal'] });
    const grassy = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    // vs flying (pure) is ground-immune — sanity: effectiveness 0.
    const immune = calcDamage(atk, def, move, 1.0, undefined, grassy);
    expect(immune.effectiveness).toBe(0);
    // vs flying/normal the pokemon is still ungrounded → no halving.
    const base = calcDamage(atk, def2, move, 1.0, undefined, makeInitialField()).damage;
    const underGrassy = calcDamage(atk, def2, move, 1.0, undefined, grassy).damage;
    expect(underGrassy).toBe(base);
  });

  it('misty terrain does not halve dragon damage to flying defenders (ungrounded)', () => {
    stubRngConst(0.99);
    const atk = makePokemon({ name: 'a', types: ['normal'] });
    const def = makePokemon({ name: 'd', types: ['flying'] });
    const move = makeMove({ type: 'dragon', damageClass: 'special', power: 80 });
    const base = calcDamage(atk, def, move, 1.0, undefined, makeInitialField()).damage;
    const mist = { ...makeInitialField(), terrain: 'misty' as const, terrainTurns: 5 };
    const underMist = calcDamage(atk, def, move, 1.0, undefined, mist).damage;
    expect(underMist).toBe(base);
  });
});

describe('Grassy terrain end-of-turn heal', () => {
  it('heals grounded pokemon for 1/16 max HP', () => {
    const p = makePokemon({ name: 'g', types: ['grass'], stats: { hp: 160 }, currentHp: 100 });
    const field = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnTerrain(p, field, 1, events);
    expect(after.currentHp).toBe(110);
    expect(events[0]?.kind).toBe('terrain_heal');
  });

  it('does not heal flying (ungrounded) pokemon', () => {
    const p = makePokemon({ name: 'f', types: ['flying'], stats: { hp: 160 }, currentHp: 100 });
    const field = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnTerrain(p, field, 1, events);
    expect(after.currentHp).toBe(100);
    expect(events).toHaveLength(0);
  });

  it('does not heal under non-grassy terrain', () => {
    const p = makePokemon({ name: 'g', types: ['grass'], stats: { hp: 160 }, currentHp: 100 });
    const field = { ...makeInitialField(), terrain: 'electric' as const, terrainTurns: 5 };
    const events: TurnEvent[] = [];
    const after = applyEndOfTurnTerrain(p, field, 1, events);
    expect(after.currentHp).toBe(100);
  });
});

describe('Electric terrain sleep block', () => {
  it('blocks sleep-inducing moves on grounded defenders', () => {
    const sleepMove = makeMove({ type: 'grass', damageClass: 'status', power: 0, effect: { ailment: 'sleep' } });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [sleepMove] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'electric' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, sleepMove, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.defender.statusCondition).toBeUndefined();
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
  });

  it('allows sleep on flying (ungrounded) defenders', () => {
    const sleepMove = makeMove({ type: 'grass', damageClass: 'status', power: 0, effect: { ailment: 'sleep' } });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [sleepMove] });
    const def = makePokemon({ name: 'd', types: ['flying'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'electric' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, sleepMove, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.defender.statusCondition).toBe('sleep');
  });
});

describe('Misty terrain status block', () => {
  it('blocks paralysis on grounded defenders', () => {
    const twave = makeMove({ type: 'electric', damageClass: 'status', power: 0, effect: { ailment: 'paralysis' } });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [twave] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'misty' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, twave, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.defender.statusCondition).toBeUndefined();
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
  });
});

describe('Grassy Glide priority', () => {
  it('gains +1 priority on grassy terrain when user is grounded', () => {
    const glide = makeMove({ name: 'grassy-glide', type: 'grass', damageClass: 'physical', power: 55, priority: 0 });
    const user = makePokemon({ name: 'u', types: ['grass'] });
    const grassy = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    expect(effectivePriority(glide, user, grassy)).toBe(1);
    expect(effectivePriority(glide, user, makeInitialField())).toBe(0);
  });

  it('does not gain priority for flying (ungrounded) users', () => {
    const glide = makeMove({ name: 'grassy-glide', type: 'grass', damageClass: 'physical', power: 55, priority: 0 });
    const user = makePokemon({ name: 'u', types: ['flying'] });
    const grassy = { ...makeInitialField(), terrain: 'grassy' as const, terrainTurns: 5 };
    expect(effectivePriority(glide, user, grassy)).toBe(0);
  });
});

describe('Psychic terrain priority block', () => {
  it('blocks priority moves against grounded defenders', () => {
    const quickAttack = makeMove({ type: 'normal', damageClass: 'physical', power: 40, priority: 1 });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [quickAttack] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'psychic' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, quickAttack, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.dealtDamage).toBe(false);
    expect(events.some(e => e.kind === 'move_failed')).toBe(true);
    expect(r.defender.currentHp).toBe(def.currentHp);
  });

  it('allows priority moves against flying (ungrounded) defenders', () => {
    const quickAttack = makeMove({ type: 'normal', damageClass: 'physical', power: 40, priority: 1 });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [quickAttack] });
    const def = makePokemon({ name: 'd', types: ['flying'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'psychic' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, quickAttack, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.dealtDamage).toBe(true);
  });

  it('does not block non-priority moves', () => {
    const tackle = makeMove({ type: 'normal', damageClass: 'physical', power: 40, priority: 0 });
    const atk = makePokemon({ name: 'a', types: ['normal'], moves: [tackle] });
    const def = makePokemon({ name: 'd', types: ['normal'] });
    const events: TurnEvent[] = [];
    const field = { ...makeInitialField(), terrain: 'psychic' as const, terrainTurns: 5 };
    const r = resolveSingleAttack(atk, def, tackle, 1, { preFlinched: false, foeHitUserThisTurn: false, field }, events);
    expect(r.dealtDamage).toBe(true);
  });
});
