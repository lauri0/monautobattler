import { describe, it, expect } from 'vitest';
import { resolveSingleAttack, resolveTurnWithMoves } from '../battleEngine';
import type { TurnEvent } from '../../models/types';
import { makePokemon, makeMove } from './fixtures';
import { stubRng, stubRngConst } from './rng';

// Shared context for a healthy attacker with no confusion / major status.
const CTX = { preFlinched: false, foeHitUserThisTurn: false };

function runStatus(attacker = makePokemon(), defender = makePokemon(), move = makeMove()) {
  const events: TurnEvent[] = [];
  const r = resolveSingleAttack(attacker, defender, move, 1, CTX, events);
  return { ...r, events };
}

// ── Self-boost moves ────────────────────────────────────────────────────────
describe('Swords Dance', () => {
  it('raises user attack by 2 stages', () => {
    const move = makeMove({ name: 'swords-dance', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'attack', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.attack).toBe(2);
    expect(r.events.find(e => e.kind === 'stat_change')).toBeTruthy();
  });
});

describe('Agility', () => {
  it('raises user speed by 2 stages', () => {
    const move = makeMove({ name: 'agility', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'speed', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.speed).toBe(2);
  });
});

describe('Amnesia', () => {
  it('raises user special-defense by 2 stages', () => {
    const move = makeMove({ name: 'amnesia', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'special-defense', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages['special-defense']).toBe(2);
  });
});

describe('Barrier', () => {
  it('raises user defense by 2 stages', () => {
    const move = makeMove({ name: 'barrier', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'defense', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.defense).toBe(2);
  });
});

// ── Foe-debuff moves ────────────────────────────────────────────────────────
describe('Growl', () => {
  it('lowers foe attack by 1 stage', () => {
    stubRng([0]); // accuracy pass (100)
    const move = makeMove({ name: 'growl', damageClass: 'status', power: 0, accuracy: 100,
      effect: { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statStages.attack).toBe(-1);
  });
});

describe('Leer', () => {
  it('lowers foe defense by 1 stage', () => {
    stubRng([0]);
    const move = makeMove({ name: 'leer', damageClass: 'status', power: 0, accuracy: 100,
      effect: { statChanges: [{ stat: 'defense', change: -1, target: 'foe' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statStages.defense).toBe(-1);
  });
});

// ── Ailment moves ───────────────────────────────────────────────────────────
describe('Thunder Wave', () => {
  it('paralyzes the foe on hit', () => {
    stubRng([0]); // accuracy pass
    const move = makeMove({ name: 'thunder-wave', damageClass: 'status', power: 0, accuracy: 90,
      type: 'electric', effect: { ailment: 'paralysis', ailmentChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statusCondition).toBe('paralysis');
    expect(r.events.find(e => e.kind === 'status_applied')).toBeTruthy();
  });

  it('fails against an Electric-type', () => {
    stubRng([0]); // accuracy pass
    const move = makeMove({ name: 'thunder-wave', damageClass: 'status', power: 0, accuracy: 90,
      type: 'electric', effect: { ailment: 'paralysis', ailmentChance: 0 } });
    const electric = makePokemon({ types: ['electric'] });
    const r = runStatus(makePokemon(), electric, move);
    expect(r.defender.statusCondition).toBeUndefined();
    expect(r.events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });
});

describe('Sleep Powder', () => {
  it('puts the foe to sleep', () => {
    stubRng([0]);
    const move = makeMove({ name: 'sleep-powder', damageClass: 'status', power: 0, accuracy: 75,
      type: 'grass', effect: { ailment: 'sleep', ailmentChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statusCondition).toBe('sleep');
  });

  it('can miss', () => {
    stubRng([0.99]); // > 0.75 → miss
    const move = makeMove({ name: 'sleep-powder', damageClass: 'status', power: 0, accuracy: 75,
      type: 'grass', effect: { ailment: 'sleep', ailmentChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statusCondition).toBeUndefined();
    const attack = r.events.find(e => e.kind === 'attack');
    expect(attack && attack.kind === 'attack' && attack.missed).toBe(true);
  });
});

describe('Poison Powder', () => {
  it('poisons the foe', () => {
    stubRng([0]);
    const move = makeMove({ name: 'poison-powder', damageClass: 'status', power: 0, accuracy: 75,
      type: 'poison', effect: { ailment: 'poison', ailmentChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.defender.statusCondition).toBe('poison');
  });

  it('fails against a Steel-type', () => {
    stubRng([0]);
    const move = makeMove({ name: 'poison-powder', damageClass: 'status', power: 0, accuracy: 75,
      type: 'poison', effect: { ailment: 'poison', ailmentChance: 0 } });
    const steel = makePokemon({ types: ['steel'] });
    const r = runStatus(makePokemon(), steel, move);
    expect(r.defender.statusCondition).toBeUndefined();
  });
});

// ── Healing ─────────────────────────────────────────────────────────────────
describe('Recover', () => {
  it('heals the user by 50% of max HP', () => {
    const move = makeMove({ name: 'recover', damageClass: 'status', power: 0, accuracy: null,
      effect: { heal: 50 } });
    const attacker = makePokemon({ stats: { hp: 200 }, currentHp: 80 });
    const r = runStatus(attacker, makePokemon(), move);
    expect(r.attacker.currentHp).toBe(180); // 80 + 100
    expect(r.events.find(e => e.kind === 'heal')).toBeTruthy();
  });

  it('fails at full HP', () => {
    const move = makeMove({ name: 'recover', damageClass: 'status', power: 0, accuracy: null,
      effect: { heal: 50 } });
    const attacker = makePokemon({ stats: { hp: 200 }, currentHp: 200 });
    const r = runStatus(attacker, makePokemon(), move);
    expect(r.attacker.currentHp).toBe(200);
    expect(r.events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });

  it('does not overheal past max', () => {
    const move = makeMove({ name: 'recover', damageClass: 'status', power: 0, accuracy: null,
      effect: { heal: 50 } });
    const attacker = makePokemon({ stats: { hp: 200 }, currentHp: 180 });
    const r = runStatus(attacker, makePokemon(), move);
    expect(r.attacker.currentHp).toBe(200);
  });
});

// ── Protect ─────────────────────────────────────────────────────────────────
describe('Protect', () => {
  const protect = () => makeMove({ id: 500, name: 'protect', damageClass: 'status', power: 0,
    accuracy: null, priority: 0, effect: { protect: true } });

  it('sets protectedThisTurn on successful use', () => {
    const r = runStatus(makePokemon(), makePokemon(), protect());
    expect(r.attacker.protectedThisTurn).toBe(true);
    expect(r.attacker.lastMoveProtected).toBe(true);
    expect(r.events.find(e => e.kind === 'protected')).toBeTruthy();
  });

  it('blocks a damaging foe attack in the same turn', () => {
    stubRngConst(0.5); // speed tie; every random → 0.5 (fine for priority override)
    const slowMon = makePokemon({ name: 'slow', stats: { speed: 10 }, moves: [] });
    const fastMon = makePokemon({ name: 'fast', stats: { speed: 200 }, moves: [] });
    const prot = protect();
    const tackle = makeMove({ name: 'tackle', power: 60, damageClass: 'physical', accuracy: 100 });
    // slowMon uses Protect (priority +4 override), fastMon uses Tackle (priority 0)
    const { events, p1After, p2After } = resolveTurnWithMoves(slowMon, fastMon, prot, tackle, 1);
    expect(p1After.currentHp).toBe(slowMon.currentHp); // undamaged
    expect(events.find(e => e.kind === 'protect_blocked')).toBeTruthy();
    expect(p2After.currentHp).toBe(fastMon.currentHp); // Tackle hit nothing
  });

  it('consecutive use fails 50% of the time (RNG >= 0.5)', () => {
    stubRng([0.7]); // >= 0.5 → fail
    const attacker = makePokemon({ lastMoveProtected: true });
    const r = runStatus(attacker, makePokemon(), protect());
    expect(r.attacker.protectedThisTurn).toBeFalsy();
    expect(r.attacker.lastMoveProtected).toBe(false);
    expect(r.events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });

  it('consecutive use succeeds when RNG < 0.5', () => {
    stubRng([0.1]);
    const attacker = makePokemon({ lastMoveProtected: true });
    const r = runStatus(attacker, makePokemon(), protect());
    expect(r.attacker.protectedThisTurn).toBe(true);
    expect(r.attacker.lastMoveProtected).toBe(true);
  });

  it('protectedThisTurn clears at end of turn', () => {
    stubRngConst(0.5);
    const p1 = makePokemon({ name: 'one' });
    const p2 = makePokemon({ name: 'two' });
    const prot = protect();
    const tackle = makeMove({ name: 'tackle', power: 40, damageClass: 'physical', accuracy: 100 });
    const { p1After } = resolveTurnWithMoves(p1, p2, prot, tackle, 1);
    expect(p1After.protectedThisTurn).toBe(false);
    // lastMoveProtected persists so the next Protect faces the 50% failure.
    expect(p1After.lastMoveProtected).toBe(true);
  });

  it('using a non-Protect move clears lastMoveProtected', () => {
    stubRng([0, 0.99, 1.0]); // accuracy, no-crit, roll
    const tackle = makeMove({ name: 'tackle', power: 40, damageClass: 'physical', accuracy: 100 });
    const attacker = makePokemon({ lastMoveProtected: true });
    const r = runStatus(attacker, makePokemon(), tackle);
    expect(r.attacker.lastMoveProtected).toBe(false);
  });
});
