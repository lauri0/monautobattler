import { describe, it, expect } from 'vitest';
import { makeInitialField, resolveSingleAttack, resolveTurnWithMoves } from '../battleEngine';
import type { FieldState, TurnEvent } from '../../models/types';
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

// ── Field / side conditions ─────────────────────────────────────────────────

const trickRoom = () => makeMove({ name: 'trick-room', damageClass: 'status', power: 0,
  accuracy: null, priority: -7, effect: { fieldEffect: 'trickRoom' } });
const tailwind = () => makeMove({ name: 'tailwind', damageClass: 'status', power: 0,
  accuracy: null, priority: 0, effect: { fieldEffect: 'tailwind' } });
const lightScreen = () => makeMove({ name: 'light-screen', damageClass: 'status', power: 0,
  accuracy: null, priority: 0, effect: { fieldEffect: 'lightScreen' } });
const reflect = () => makeMove({ name: 'reflect', damageClass: 'status', power: 0,
  accuracy: null, priority: 0, effect: { fieldEffect: 'reflect' } });
const stealthRock = () => makeMove({ name: 'stealth-rock', damageClass: 'status', power: 0,
  accuracy: null, priority: 0, effect: { fieldEffect: 'stealthRock' } });

describe('Trick Room', () => {
  it('sets the field counter and emits field_set', () => {
    const r = runStatus(makePokemon(), makePokemon(), trickRoom());
    expect(r.field.trickRoomTurns).toBe(5);
    expect(r.events.find(e => e.kind === 'field_set')).toBeTruthy();
  });

  it('reverses move order within the same priority bracket', () => {
    stubRngConst(0.5); // priority/effect rolls use 0.5 consistently
    const fast = makePokemon({ name: 'fast', stats: { speed: 200 } });
    const slow = makePokemon({ name: 'slow', stats: { speed: 10 } });
    const tackleFast = makeMove({ id: 701, name: 'tackle', power: 40, damageClass: 'physical', accuracy: 100 });
    const tackleSlow = makeMove({ id: 702, name: 'tackle', power: 40, damageClass: 'physical', accuracy: 100 });
    const field: FieldState = { ...makeInitialField(), trickRoomTurns: 5 };
    const { events } = resolveTurnWithMoves(fast, slow, tackleFast, tackleSlow, 1, field);
    const attacks = events.filter(e => e.kind === 'attack') as Extract<TurnEvent, { kind: 'attack' }>[];
    expect(attacks[0].attackerName).toBe('slow');
    expect(attacks[1].attackerName).toBe('fast');
  });

  it('fails when already active', () => {
    const field: FieldState = { ...makeInitialField(), trickRoomTurns: 3 };
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(makePokemon(), makePokemon(), trickRoom(), 1,
      { ...CTX, field, attackerSide: 0 }, events);
    expect(events.find(e => e.kind === 'move_failed')).toBeTruthy();
    expect(r.field.trickRoomTurns).toBe(3); // unchanged
  });

  it('decrements each turn and expires', () => {
    stubRngConst(0.5);
    const p1 = makePokemon({ name: 'a' });
    const p2 = makePokemon({ name: 'b' });
    let field: FieldState = { ...makeInitialField(), trickRoomTurns: 1 };
    const { field: after, events } = resolveTurnWithMoves(p1, p2, null, null, 1, field);
    expect(after.trickRoomTurns).toBe(0);
    expect(events.find(e => e.kind === 'field_expired' && e.effect === 'trickRoom')).toBeTruthy();
  });
});

describe('Tailwind', () => {
  it('doubles acting side speed for the priority tie-break', () => {
    stubRngConst(0.5);
    // Side 0 is slower (80) but has tailwind → effective 160 > side 1's 100.
    const slow = makePokemon({ name: 'slowTail', stats: { speed: 80 } });
    const mid = makePokemon({ name: 'midBase', stats: { speed: 100 } });
    const m1 = makeMove({ id: 711, name: 'tackleA', power: 40, damageClass: 'physical', accuracy: 100 });
    const m2 = makeMove({ id: 712, name: 'tackleB', power: 40, damageClass: 'physical', accuracy: 100 });
    const field: FieldState = makeInitialField();
    field.sides[0].tailwindTurns = 4;
    const { events } = resolveTurnWithMoves(slow, mid, m1, m2, 1, field);
    const first = events.find(e => e.kind === 'attack') as Extract<TurnEvent, { kind: 'attack' }>;
    expect(first.attackerName).toBe('slowTail');
  });

  it('sets 4 turns and decrements', () => {
    const r = runStatus(makePokemon(), makePokemon(), tailwind());
    expect(r.field.sides[0].tailwindTurns).toBe(4);
    // Drive a turn forward with no moves to tick the counter.
    const { field: after } = resolveTurnWithMoves(makePokemon(), makePokemon(), null, null, 2, r.field);
    expect(after.sides[0].tailwindTurns).toBe(3);
  });
});

describe('Light Screen', () => {
  it('halves special damage on the defender side', () => {
    // Two fixed RNG sequences: first without screen, then with screen.
    // Each damaging move uses: accuracy (1), crit (1), roll (1) = 3 calls.
    const ember = makeMove({ name: 'ember', type: 'fire', power: 40,
      damageClass: 'special', accuracy: 100 });
    const attacker = makePokemon({ stats: { specialAttack: 100 } });
    const defender = makePokemon({ stats: { specialDefense: 100, hp: 400 }, currentHp: 400 });

    stubRng([0, 0.99, 1.0]);
    const r1 = resolveSingleAttack(attacker, defender, ember, 1,
      { preFlinched: false, foeHitUserThisTurn: false }, []);
    const damageNoScreen = defender.currentHp - r1.defender.currentHp;

    stubRng([0, 0.99, 1.0]);
    const field: FieldState = makeInitialField();
    field.sides[1].lightScreenTurns = 5;
    const r2 = resolveSingleAttack(attacker, defender, ember, 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, []);
    const damageWithScreen = defender.currentHp - r2.defender.currentHp;

    expect(damageWithScreen).toBeLessThan(damageNoScreen);
    expect(damageWithScreen).toBeGreaterThanOrEqual(Math.floor(damageNoScreen / 2) - 1);
  });

  it('fails to set when already active', () => {
    const field: FieldState = makeInitialField();
    field.sides[0].lightScreenTurns = 2;
    const events: TurnEvent[] = [];
    resolveSingleAttack(makePokemon(), makePokemon(), lightScreen(), 1,
      { ...CTX, field, attackerSide: 0 }, events);
    expect(events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });
});

describe('Reflect', () => {
  it('halves physical damage on the defender side', () => {
    const tackle = makeMove({ name: 'tackle', power: 60,
      damageClass: 'physical', accuracy: 100 });
    const attacker = makePokemon({ stats: { attack: 100 } });
    const defender = makePokemon({ stats: { defense: 100, hp: 400 }, currentHp: 400 });

    stubRng([0, 0.99, 1.0]);
    const noScreen = resolveSingleAttack(attacker, defender, tackle, 1,
      { preFlinched: false, foeHitUserThisTurn: false }, []);

    stubRng([0, 0.99, 1.0]);
    const field: FieldState = makeInitialField();
    field.sides[1].reflectTurns = 5;
    const withScreen = resolveSingleAttack(attacker, defender, tackle, 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, []);

    const dmgNo = defender.currentHp - noScreen.defender.currentHp;
    const dmgYes = defender.currentHp - withScreen.defender.currentHp;
    expect(dmgYes).toBeLessThan(dmgNo);
  });

  it('does not apply on a crit', () => {
    const tackle = makeMove({ name: 'tackle', power: 60,
      damageClass: 'physical', accuracy: 100 });
    const attacker = makePokemon({ stats: { attack: 100 } });
    const defender = makePokemon({ stats: { defense: 100, hp: 400 }, currentHp: 400 });

    // Force crit: accuracy 0 (pass), crit roll 0 (< 1/24 always crits), roll 1.0.
    stubRng([0, 0, 1.0]);
    const noScreen = resolveSingleAttack(attacker, defender, tackle, 1,
      { preFlinched: false, foeHitUserThisTurn: false }, []);

    stubRng([0, 0, 1.0]);
    const field: FieldState = makeInitialField();
    field.sides[1].reflectTurns = 5;
    const withScreen = resolveSingleAttack(attacker, defender, tackle, 1,
      { preFlinched: false, foeHitUserThisTurn: false, field, attackerSide: 0 }, []);

    expect(noScreen.defender.currentHp).toBe(withScreen.defender.currentHp);
  });
});

describe('Stealth Rock', () => {
  it('marks the opposing side and emits field_set', () => {
    const r = runStatus(makePokemon(), makePokemon(), stealthRock());
    // Caster is side 0; rocks should lay on side 1.
    expect(r.field.sides[1].stealthRock).toBe(true);
    expect(r.field.sides[0].stealthRock).toBe(false);
    const ev = r.events.find(e => e.kind === 'field_set');
    expect(ev).toBeTruthy();
  });

  it('fails when already set on that side', () => {
    const field: FieldState = makeInitialField();
    field.sides[1].stealthRock = true;
    const events: TurnEvent[] = [];
    resolveSingleAttack(makePokemon(), makePokemon(), stealthRock(), 1,
      { ...CTX, field, attackerSide: 0 }, events);
    expect(events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });
});

// ── Taunt & misc new status moves ───────────────────────────────────────────
describe('Taunt', () => {
  const taunt = () => makeMove({ name: 'taunt', damageClass: 'status', power: 0, accuracy: 100, effect: { taunt: true } });

  it('applies taunt to the foe for 3 turns', () => {
    stubRng([0]); // accuracy pass
    const r = runStatus(makePokemon(), makePokemon(), taunt());
    expect(r.defender.tauntTurns).toBe(3);
    expect(r.events.some(e => e.kind === 'taunted')).toBe(true);
  });

  it('fails if the foe is already taunted', () => {
    stubRng([0]);
    const foe = { ...makePokemon(), tauntTurns: 2 };
    const r = runStatus(makePokemon(), foe, taunt());
    expect(r.events.some(e => e.kind === 'move_failed')).toBe(true);
  });

  it('blocks the taunted pokemon from using a status move', () => {
    const swordsDance = makeMove({ name: 'swords-dance', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'attack', change: 2, target: 'user' }], statChance: 0 } });
    const attacker = { ...makePokemon(), tauntTurns: 3 };
    const r = runStatus(attacker, makePokemon(), swordsDance);
    expect(r.events.some(e => e.kind === 'move_failed')).toBe(true);
    expect(r.attacker.statStages.attack).toBe(0);
  });

  it('decrements and expires after 3 turns via resolveTurnWithMoves', () => {
    stubRngConst(0);
    const tackle = makeMove({ name: 'tackle', power: 1, damageClass: 'physical' });
    let p1 = { ...makePokemon({ name: 'a' }), tauntTurns: 3 };
    let p2 = makePokemon({ name: 'b' });
    let field = makeInitialField();
    for (let t = 1; t <= 3; t++) {
      const r = resolveTurnWithMoves(p1, p2, tackle, tackle, t, field);
      p1 = r.p1After; p2 = r.p2After; field = r.field;
    }
    expect(p1.tauntTurns).toBeUndefined();
  });
});

describe('Will-O-Wisp', () => {
  const wow = () => makeMove({ name: 'will-o-wisp', damageClass: 'status', power: 0, accuracy: 85,
    type: 'fire', effect: { ailment: 'burn', ailmentChance: 0 } });

  it('burns the foe on hit', () => {
    stubRng([0]); // accuracy pass
    const r = runStatus(makePokemon(), makePokemon(), wow());
    expect(r.defender.statusCondition).toBe('burn');
  });

  it('fails against a fire-type', () => {
    stubRng([0]);
    const fireFoe = makePokemon({ types: ['fire'] });
    const r = runStatus(makePokemon(), fireFoe, wow());
    expect(r.defender.statusCondition).toBeUndefined();
    expect(r.events.some(e => e.kind === 'move_failed')).toBe(true);
  });
});

describe('Stat-boosting status moves', () => {
  it('Nasty Plot raises user SpA by 2', () => {
    const move = makeMove({ name: 'nasty-plot', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'special-attack', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages['special-attack']).toBe(2);
  });

  it('Dragon Dance raises user Atk and Speed by 1', () => {
    const move = makeMove({ name: 'dragon-dance', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [
        { stat: 'attack', change: 1, target: 'user' },
        { stat: 'speed', change: 1, target: 'user' },
      ], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.attack).toBe(1);
    expect(r.attacker.statStages.speed).toBe(1);
  });

  it('Calm Mind raises SpA and SpD by 1', () => {
    const move = makeMove({ name: 'calm-mind', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [
        { stat: 'special-attack', change: 1, target: 'user' },
        { stat: 'special-defense', change: 1, target: 'user' },
      ], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages['special-attack']).toBe(1);
    expect(r.attacker.statStages['special-defense']).toBe(1);
  });

  it('Bulk Up raises Atk and Def by 1', () => {
    const move = makeMove({ name: 'bulk-up', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [
        { stat: 'attack', change: 1, target: 'user' },
        { stat: 'defense', change: 1, target: 'user' },
      ], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.attack).toBe(1);
    expect(r.attacker.statStages.defense).toBe(1);
  });

  it('Iron Defense raises Def by 2', () => {
    const move = makeMove({ name: 'iron-defense', damageClass: 'status', power: 0, accuracy: null,
      effect: { statChanges: [{ stat: 'defense', change: 2, target: 'user' }], statChance: 0 } });
    const r = runStatus(makePokemon(), makePokemon(), move);
    expect(r.attacker.statStages.defense).toBe(2);
  });
});
