import type { BattlePokemon, Move, TurnEvent, BattleResult, StatStageName, StatStages, AIStrategy, FieldState, FieldEffectKind, SideIndex, SideFieldState } from '../models/types';
import { calcDamage, calcExpectedDamage, effectiveSpeed, type DefenderScreens } from './damageCalc';
import { defaultAI } from '../ai/aiModule';
import { getTypeEffectiveness } from '../utils/typeChart';

export const TRICK_ROOM_TURNS = 5;
export const TAILWIND_TURNS = 4;
export const SCREEN_TURNS = 5;
export const TAUNT_TURNS = 3;

function makeSide(): SideFieldState {
  return { tailwindTurns: 0, lightScreenTurns: 0, reflectTurns: 0, stealthRock: false };
}

export function makeInitialField(): FieldState {
  return { trickRoomTurns: 0, sides: [makeSide(), makeSide()] };
}

function opposite(side: SideIndex): SideIndex {
  return side === 0 ? 1 : 0;
}

function defenderScreensFor(field: FieldState, defenderSide: SideIndex): DefenderScreens {
  const s = field.sides[defenderSide];
  return { lightScreen: s.lightScreenTurns > 0, reflect: s.reflectTurns > 0 };
}

function sideEffectiveSpeed(p: BattlePokemon, field: FieldState, side: SideIndex): number {
  return effectiveSpeed(p, field.sides[side].tailwindTurns > 0);
}

/**
 * Apply Stealth Rock damage to a pokemon switching into `side`. Returns the
 * updated pokemon. Emits a `stealth_rock_damage` event when damage is dealt.
 * Damage scales with rock-type effectiveness vs. the incoming pokemon's types
 * (base 1/8 max HP, so 1/32 quarter-resisted up to 1/2 for Flying/Fire etc.).
 */
export function applyStealthRockOnEntry(
  p: BattlePokemon,
  field: FieldState,
  side: SideIndex,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (!field.sides[side].stealthRock) return p;
  if (p.currentHp <= 0) return p;
  const eff = getTypeEffectiveness('rock', p.data.types);
  if (eff === 0) return p;
  const damage = Math.max(1, Math.floor(p.level50Stats.hp * 0.125 * eff));
  const hpAfter = Math.max(0, p.currentHp - damage);
  events.push({ kind: 'stealth_rock_damage', turn, pokemonName: p.data.name, damage, hpAfter });
  return { ...p, currentHp: hpAfter };
}

// Decrement per-turn field counters and emit expiry events.
function tickField(field: FieldState, turn: number, events: TurnEvent[]): FieldState {
  const next: FieldState = {
    trickRoomTurns: field.trickRoomTurns,
    sides: [{ ...field.sides[0] }, { ...field.sides[1] }],
  };
  if (next.trickRoomTurns > 0) {
    next.trickRoomTurns--;
    if (next.trickRoomTurns === 0) {
      events.push({ kind: 'field_expired', turn, effect: 'trickRoom' });
    }
  }
  for (const s of [0, 1] as SideIndex[]) {
    const side = next.sides[s];
    if (side.tailwindTurns > 0) {
      side.tailwindTurns--;
      if (side.tailwindTurns === 0) events.push({ kind: 'field_expired', turn, effect: 'tailwind', side: s });
    }
    if (side.lightScreenTurns > 0) {
      side.lightScreenTurns--;
      if (side.lightScreenTurns === 0) events.push({ kind: 'field_expired', turn, effect: 'lightScreen', side: s });
    }
    if (side.reflectTurns > 0) {
      side.reflectTurns--;
      if (side.reflectTurns === 0) events.push({ kind: 'field_expired', turn, effect: 'reflect', side: s });
    }
  }
  return next;
}

export const STRUGGLE: Move = {
  id: -1,
  name: 'struggle',
  type: 'normal',
  power: 50,
  accuracy: 100,
  pp: 1,
  damageClass: 'physical',
  priority: 0,
  effect: { drain: -25 },
};

/**
 * Returns the moves the pokemon can actually use this turn. Filters out
 * firstTurnOnly moves (e.g. Fake Out) unless the pokemon just switched in.
 * Falls back to Struggle when no moves are available.
 */
export function usableMoves(p: BattlePokemon, _turnNumber?: number): Move[] {
  if (p.lockedMove) {
    const locked = p.moves.find(m => m.id === p.lockedMove!.moveId);
    return locked ? [locked] : [STRUGGLE];
  }
  const moves = p.justSwitchedIn ? p.moves : p.moves.filter(m => !m.effect?.firstTurnOnly);
  return moves.length > 0 ? moves : [STRUGGLE];
}

/**
 * Returns a possibly-modified copy of `move` whose base power reflects
 * context-dependent multipliers (Revenge, Hex, ...). The original object is
 * returned unchanged when no multiplier applies.
 */
function effectivePowerMove(
  move: Move,
  defender: BattlePokemon,
  foeHitUserThisTurn: boolean,
): Move {
  const eff = move.effect;
  if (!eff) return move;
  let multiplier = 1;
  if (eff.doublePowerIfHit && foeHitUserThisTurn) multiplier *= 2;
  if (eff.doublePowerIfTargetStatus && defender.statusCondition) multiplier *= 2;
  if (multiplier === 1) return move;
  return { ...move, power: move.power * multiplier };
}

// Protect gets a priority boost that supersedes other priority moves. The real
// games use +4; we use that too so Protect reliably resolves before the foe's
// attack regardless of speed.
export function effectivePriority(move: Move): number {
  return move.effect?.protect ? 4 : move.priority;
}

function targetsFoe(move: Move): boolean {
  const eff = move.effect;
  if (!eff) return false;
  if (eff.ailment) return true;
  if (eff.confuses) return true;
  if (eff.flinchChance) return true;
  if (eff.statChanges?.some(s => s.target === 'foe')) return true;
  return false;
}

function clampStage(v: number): number {
  return Math.max(-6, Math.min(6, v));
}

function applyStatChange(
  p: BattlePokemon,
  stat: StatStageName,
  change: number,
  turn: number,
  events: TurnEvent[]
): BattlePokemon {
  const oldStage = p.statStages[stat];
  const newStage = clampStage(oldStage + change);
  if (newStage === oldStage) return p;
  const updated: BattlePokemon = {
    ...p,
    statStages: { ...p.statStages, [stat]: newStage } as StatStages,
  };
  events.push({ kind: 'stat_change', turn, pokemonName: p.data.name, stat, change: newStage - oldStage, newStage });
  return updated;
}

// Confusion self-hit: typeless physical damage (power 40) vs user's own Attack/Defense
function confusionSelfDamage(p: BattlePokemon): number {
  const A = p.level50Stats.attack;
  const D = p.level50Stats.defense;
  const roll = 0.85 + Math.random() * 0.15;
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * 40 * A / D) / 50 + 2);
  return Math.max(1, Math.floor(base * roll));
}

// Check if the pokemon can act. Handles paralysis, sleep, freeze, confusion.
function canAct(
  p: BattlePokemon,
  turn: number,
  events: TurnEvent[]
): { canAct: boolean; updated: BattlePokemon } {
  // Paralysis skip check
  if (p.statusCondition === 'paralysis') {
    if (Math.random() < 1 / 8) {
      events.push({ kind: 'cant_move', turn, pokemonName: p.data.name, reason: 'paralysis' });
      return { canAct: false, updated: p };
    }
  }

  // Sleep
  if (p.statusCondition === 'sleep') {
    const turnsUsed = (p.sleepTurnsUsed ?? 0) + 1;
    const updated = { ...p, sleepTurnsUsed: turnsUsed };
    if (turnsUsed === 1) {
      events.push({ kind: 'cant_move', turn, pokemonName: p.data.name, reason: 'sleep' });
      return { canAct: false, updated };
    } else if (turnsUsed === 2) {
      if (Math.random() < 1 / 3) {
        const cured = { ...updated, statusCondition: undefined, sleepTurnsUsed: undefined };
        events.push({ kind: 'status_cured', turn, pokemonName: p.data.name, condition: 'sleep' });
        return { canAct: true, updated: cured };
      }
      events.push({ kind: 'cant_move', turn, pokemonName: p.data.name, reason: 'sleep' });
      return { canAct: false, updated };
    } else {
      const cured = { ...updated, statusCondition: undefined, sleepTurnsUsed: undefined };
      events.push({ kind: 'status_cured', turn, pokemonName: p.data.name, condition: 'sleep' });
      return { canAct: true, updated: cured };
    }
  }

  // Freeze
  if (p.statusCondition === 'freeze') {
    const turnsUsed = (p.frozenTurnsUsed ?? 0) + 1;
    const updated = { ...p, frozenTurnsUsed: turnsUsed };
    if (turnsUsed >= 3 || Math.random() < 0.25) {
      const cured = { ...updated, statusCondition: undefined, frozenTurnsUsed: undefined };
      events.push({ kind: 'status_cured', turn, pokemonName: p.data.name, condition: 'freeze' });
      return { canAct: true, updated: cured };
    }
    events.push({ kind: 'cant_move', turn, pokemonName: p.data.name, reason: 'freeze' });
    return { canAct: false, updated };
  }

  // Confusion: 33% chance to hit self
  if (p.confused) {
    const turnsLeft = (p.confusionTurnsLeft ?? 1) - 1;
    if (turnsLeft <= 0) {
      // Confusion wore off
      const cured = { ...p, confused: false, confusionTurnsLeft: undefined };
      events.push({ kind: 'confusion_end', turn, pokemonName: p.data.name });
      return { canAct: true, updated: cured };
    }
    const updated = { ...p, confusionTurnsLeft: turnsLeft };
    if (Math.random() < 1 / 3) {
      const dmg = confusionSelfDamage(updated);
      const newHp = Math.max(0, updated.currentHp - dmg);
      events.push({ kind: 'confusion_hit', turn, pokemonName: p.data.name, damage: dmg, hpAfter: newHp });
      return { canAct: false, updated: { ...updated, currentHp: newHp } };
    }
    return { canAct: true, updated };
  }

  return { canAct: true, updated: p };
}

// Type-based immunity to major ailments (approximates real Pokemon rules).
// Sleep has no type immunity; confusion also has none.
function isImmuneToAilment(defender: BattlePokemon, ailment: import('../models/types').StatusCondition): boolean {
  const types = defender.data.types;
  switch (ailment) {
    case 'burn':      return types.includes('fire');
    case 'poison':    return types.includes('poison') || types.includes('steel');
    case 'paralysis': return types.includes('electric');
    case 'freeze':    return types.includes('ice');
    default:          return false;
  }
}

function applySecondaryEffects(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  damage: number,
  turn: number,
  events: TurnEvent[]
): { attacker: BattlePokemon; defender: BattlePokemon; defenderFlinched: boolean } {
  if (!move.effect) return { attacker, defender, defenderFlinched: false };
  const eff = move.effect;
  let defenderFlinched = false;

  // Drain / recoil
  if (eff.drain !== undefined && eff.drain !== 0 && damage > 0) {
    if (eff.drain > 0) {
      const healed = Math.max(1, Math.floor(damage * eff.drain / 100));
      const newHp = Math.min(attacker.level50Stats.hp, attacker.currentHp + healed);
      events.push({ kind: 'drain', turn, pokemonName: attacker.data.name, healed: newHp - attacker.currentHp, hpAfter: newHp });
      attacker = { ...attacker, currentHp: newHp };
    } else {
      const recoil = Math.max(1, Math.floor(damage * Math.abs(eff.drain) / 100));
      const newHp = Math.max(0, attacker.currentHp - recoil);
      events.push({ kind: 'recoil', turn, pokemonName: attacker.data.name, damage: recoil, hpAfter: newHp });
      attacker = { ...attacker, currentHp: newHp };
    }
  }

  // Stat changes
  if (eff.statChanges && eff.statChanges.length > 0) {
    const chance = eff.statChance ?? 0;
    if (chance === 0 || Math.random() * 100 < chance) {
      for (const sc of eff.statChanges) {
        if (sc.target === 'user') {
          attacker = applyStatChange(attacker, sc.stat, sc.change, turn, events);
        } else {
          defender = applyStatChange(defender, sc.stat, sc.change, turn, events);
        }
      }
    }
  }

  // Primary ailment
  if (eff.ailment && !defender.statusCondition && !isImmuneToAilment(defender, eff.ailment)) {
    const chance = eff.ailmentChance ?? 0;
    if (chance === 0 || Math.random() * 100 < chance) {
      events.push({ kind: 'status_applied', turn, pokemonName: defender.data.name, condition: eff.ailment });
      defender = { ...defender, statusCondition: eff.ailment };
    }
  }

  // Flinch
  if (eff.flinchChance && Math.random() * 100 < eff.flinchChance) {
    defenderFlinched = true;
  }

  // Confusion on defender
  if (eff.confuses && !defender.confused) {
    const chance = eff.confusionChance ?? 0;
    if (chance === 0 || Math.random() * 100 < chance) {
      const turns = 2 + Math.floor(Math.random() * 4); // 2–5 turns
      events.push({ kind: 'confused', turn, pokemonName: defender.data.name });
      defender = { ...defender, confused: true, confusionTurnsLeft: turns };
    }
  }

  // Self-lock (Outrage, Petal Dance, Thrash): on first successful use, lock
  // the user into this move for 1-2 additional turns (2-3 total). Confusion is
  // applied only when the lock expires — see the tick in resolveTurnWithMoves.
  if (eff.confusesUser && !attacker.lockedMove && !attacker.confused) {
    const turnsLeft = 1 + Math.floor(Math.random() * 2);
    attacker = { ...attacker, lockedMove: { moveId: move.id, turnsLeft } };
  }

  return { attacker, defender, defenderFlinched };
}

export function applyEndOfTurnStatus(
  p: BattlePokemon,
  turn: number,
  events: TurnEvent[]
): BattlePokemon {
  if (p.statusCondition !== 'burn' && p.statusCondition !== 'poison') return p;
  if (p.currentHp <= 0) return p;
  const divisor = p.statusCondition === 'burn' ? 16 : 8;
  const tick = Math.max(1, Math.floor(p.level50Stats.hp / divisor));
  const newHp = Math.max(0, p.currentHp - tick);
  events.push({ kind: 'status_damage', turn, pokemonName: p.data.name, condition: p.statusCondition, damage: tick, hpAfter: newHp });
  return { ...p, currentHp: newHp };
}

// Decrements a pokemon's taunt counter. Emits taunt_end if it expires this turn.
export function tickTaunt(p: BattlePokemon, turn: number, events: TurnEvent[]): BattlePokemon {
  if (!p.tauntTurns) return p;
  const next = p.tauntTurns - 1;
  if (next <= 0) {
    events.push({ kind: 'taunt_end', turn, pokemonName: p.data.name });
    const { tauntTurns: _drop, ...rest } = p;
    return { ...rest };
  }
  return { ...p, tauntTurns: next };
}

// ── Deterministic simulation for expectiminimax tree search ─────────────────

export interface ChanceOutcome {
  probability: number;
  hitM1: boolean;
  hitM2: boolean;
  effectsM1: { statChange: boolean; ailment: boolean; flinch: boolean; confusion: boolean };
  effectsM2: { statChange: boolean; ailment: boolean; flinch: boolean; confusion: boolean };
}

function critProb(move: Move): number {
  const rate = move.effect?.critRate ?? 0;
  return rate === 0 ? 1 / 24 : rate === 1 ? 1 / 8 : 1 / 2;
}

// Expected damage including crit contribution, using 0.925 average roll
function expectedDamageWithCrit(attacker: BattlePokemon, defender: BattlePokemon, move: Move): number {
  if (!move.power) return 0;
  const base = calcExpectedDamage(attacker, defender, move); // uses 0.925 roll, no crit
  const cp = critProb(move);
  return base * (1 + cp * 0.5); // crit adds 50% on top, weighted by probability
}

// Apply a single stat-change list without emitting events
function applyStatChangesSilent(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
): { attacker: BattlePokemon; defender: BattlePokemon } {
  const sc = move.effect?.statChanges;
  if (!sc) return { attacker, defender };
  for (const change of sc) {
    if (change.target === 'user') {
      attacker = { ...attacker, statStages: { ...attacker.statStages, [change.stat]: clampStage(attacker.statStages[change.stat] + change.change) } as StatStages };
    } else {
      defender = { ...defender, statStages: { ...defender.statStages, [change.stat]: clampStage(defender.statStages[change.stat] + change.change) } as StatStages };
    }
  }
  return { attacker, defender };
}

/**
 * Deterministic, RNG-free turn simulation for use in the expectiminimax tree.
 * All chance events are pre-resolved via the `outcome` parameter.
 * Status blocking (paralysis/sleep/freeze) is handled as expected-value fractions.
 */
export function simulateTurnDeterministic(
  p1: BattlePokemon,
  p2: BattlePokemon,
  move1: Move,
  move2: Move,
  turnNumber: number,
  outcome: ChanceOutcome,
): { p1After: BattlePokemon; p2After: BattlePokemon; battleOver: boolean; lastAttackerIsP1?: boolean } {
  // Filter firstTurnOnly moves for pokemon that are not fresh on the field.
  const m1 = !p1.justSwitchedIn && move1.effect?.firstTurnOnly ? null : move1;
  const m2 = !p2.justSwitchedIn && move2.effect?.firstTurnOnly ? null : move2;

  // Determine attack order by priority then speed
  let first: BattlePokemon, second: BattlePokemon;
  let firstMove: Move | null, secondMove: Move | null;
  let firstHit: boolean, secondHit: boolean;
  let firstEffects: ChanceOutcome['effectsM1'], secondEffects: ChanceOutcome['effectsM2'];
  const isP1First = (() => {
    const pri1 = m1 ? effectivePriority(m1) : 0;
    const pri2 = m2 ? effectivePriority(m2) : 0;
    if (pri1 !== pri2) return pri1 > pri2;
    return effectiveSpeed(p1) >= effectiveSpeed(p2); // ties go to p1 (deterministic)
  })();

  if (isP1First) {
    [first, second] = [p1, p2];
    [firstMove, secondMove] = [m1, m2];
    firstHit = outcome.hitM1; secondHit = outcome.hitM2;
    firstEffects = outcome.effectsM1; secondEffects = outcome.effectsM2;
  } else {
    [first, second] = [p2, p1];
    [firstMove, secondMove] = [m2, m1];
    firstHit = outcome.hitM2; secondHit = outcome.hitM1;
    firstEffects = outcome.effectsM2; secondEffects = outcome.effectsM1;
  }

  let a = { ...first };
  let d = { ...second };
  let battleOver = false;
  let secondFlinched = false;

  // Status action probability (expected fraction of damage to apply)
  function actionFraction(p: BattlePokemon): number {
    if (p.statusCondition === 'paralysis') return 7 / 8;
    if (p.statusCondition === 'sleep') return (p.sleepTurnsUsed ?? 0) === 0 ? 0 : 1;
    if (p.statusCondition === 'freeze') return (p.frozenTurnsUsed ?? 0) >= 2 ? 1 : 0;
    return 1;
  }

  // Apply one attacker's move
  function applyMove(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    move: Move | null,
    hit: boolean,
    effects: { statChange: boolean; ailment: boolean; flinch: boolean; confusion: boolean },
    foeHitUserThisTurn: boolean,
  ): { attacker: BattlePokemon; defender: BattlePokemon; flinched: boolean; dealtDamage: boolean } {
    if (!move || !move.power) return { attacker, defender, flinched: false, dealtDamage: false };
    const fraction = actionFraction(attacker);
    if (fraction === 0) return { attacker, defender, flinched: false, dealtDamage: false };

    let flinched = false;
    let dealtDamage = false;

    if (hit) {
      const effectiveMove = effectivePowerMove(move, defender, foeHitUserThisTurn);
      const rawDmg = expectedDamageWithCrit(attacker, defender, effectiveMove);
      const dmg = rawDmg > 0 ? Math.max(1, Math.floor(rawDmg * fraction)) : 0;
      dealtDamage = dmg > 0;

      // Drain / recoil (deterministic)
      const actualDmg = Math.min(dmg, defender.currentHp);
      let defHp = defender.currentHp - actualDmg;
      defender = { ...defender, currentHp: defHp };
      if (move.effect?.drain) {
        if (move.effect.drain > 0) {
          const healed = Math.max(1, Math.floor(actualDmg * move.effect.drain / 100));
          attacker = { ...attacker, currentHp: Math.min(attacker.level50Stats.hp, attacker.currentHp + healed) };
        } else {
          const recoil = Math.max(1, Math.floor(actualDmg * Math.abs(move.effect.drain) / 100));
          attacker = { ...attacker, currentHp: Math.max(0, attacker.currentHp - recoil) };
        }
      }

      // Secondary effects (pre-resolved)
      if (effects.statChange && move.effect?.statChanges) {
        const result = applyStatChangesSilent(attacker, defender, move);
        attacker = result.attacker;
        // Only apply foe-targeting stat changes if the defender is still alive
        if (defender.currentHp > 0) defender = result.defender;
      }
      if (defender.currentHp > 0) {
        if (effects.ailment && move.effect?.ailment && !defender.statusCondition && !isImmuneToAilment(defender, move.effect.ailment)) {
          defender = { ...defender, statusCondition: move.effect.ailment };
        }
        if (effects.flinch && move.effect?.flinchChance) {
          flinched = true;
        }
        if (effects.confusion && move.effect?.confuses && !defender.confused) {
          defender = { ...defender, confused: true, confusionTurnsLeft: 3 };
        }
      }
      // Self-lock tick: mirror the runtime behavior so the search tree sees
      // Outrage-users correctly forced in subsequent turns and eventually
      // confused. Uses deterministic turnsLeft = 1 after first use (2 total).
      const wasLockedBefore = !!attacker.lockedMove && attacker.lockedMove.moveId === move.id;
      if (wasLockedBefore && attacker.lockedMove) {
        const turnsLeft = attacker.lockedMove.turnsLeft - 1;
        if (turnsLeft <= 0) {
          attacker = { ...attacker, lockedMove: undefined, confused: true, confusionTurnsLeft: 3 };
        } else {
          attacker = { ...attacker, lockedMove: { ...attacker.lockedMove, turnsLeft } };
        }
      } else if (move.effect?.confusesUser && !attacker.lockedMove && !attacker.confused) {
        attacker = { ...attacker, lockedMove: { moveId: move.id, turnsLeft: 1 } };
      }
    }

    return { attacker, defender, flinched, dealtDamage };
  }

  // Track who last attacked (needed when both faint from recoil)
  let lastAttackerIsP1: boolean | undefined;

  // First attacker
  let firstDealtDamage = false;
  {
    // First attacker never has a "hit earlier this turn" bonus available.
    const r = applyMove(a, d, firstMove, firstHit, firstEffects, false);
    a = r.attacker; d = r.defender; secondFlinched = r.flinched;
    firstDealtDamage = r.dealtDamage;
    if (isP1First) { p1 = a; p2 = d; } else { p2 = a; p1 = d; }
    if (p1.currentHp <= 0 || p2.currentHp <= 0) {
      battleOver = true;
      lastAttackerIsP1 = isP1First;
    }
  }

  // Second attacker
  if (!battleOver && !secondFlinched) {
    let a2 = isP1First ? p2 : p1;
    let d2 = isP1First ? p1 : p2;
    const r = applyMove(a2, d2, secondMove, secondHit, secondEffects, firstDealtDamage);
    a2 = r.attacker; d2 = r.defender;
    if (isP1First) { p1 = d2; p2 = a2; } else { p2 = d2; p1 = a2; }
    if (p1.currentHp <= 0 || p2.currentHp <= 0) {
      battleOver = true;
      lastAttackerIsP1 = !isP1First;
    }
  }

  // End-of-turn burn/poison ticks (deterministic)
  if (!battleOver) {
    function tickStatus(p: BattlePokemon): BattlePokemon {
      if (p.statusCondition !== 'burn' && p.statusCondition !== 'poison') return p;
      const divisor = p.statusCondition === 'burn' ? 16 : 8;
      const tick = Math.max(1, Math.floor(p.level50Stats.hp / divisor));
      return { ...p, currentHp: Math.max(0, p.currentHp - tick) };
    }
    p1 = tickStatus(p1);
    p2 = tickStatus(p2);
    if (p1.currentHp <= 0 || p2.currentHp <= 0) battleOver = true;
  }

  return { p1After: p1, p2After: p2, battleOver, lastAttackerIsP1 };
}

export interface SingleAttackResult {
  attacker: BattlePokemon;
  defender: BattlePokemon;
  dealtDamage: boolean;
  defenderFlinched: boolean;
  // True when the attacker used a successful pivot-switch move (U-turn etc.)
  // and is still alive. The caller (team engine) should prompt the attacker
  // to choose a replacement.
  pivotTriggered: boolean;
  field: FieldState;
}

export interface AttackCtx {
  preFlinched: boolean;
  foeHitUserThisTurn: boolean;
  field?: FieldState;
  attackerSide?: SideIndex;
}

/**
 * Resolve a non-damaging (status-class) move. Accuracy is rolled here since
 * there's no damage calc to delegate it to. Returns the same shape as the
 * damaging path but without a pivot trigger or flinch.
 */
function resolveStatusMove(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  turn: number,
  attackerSide: SideIndex,
  field: FieldState,
  events: TurnEvent[],
): { attacker: BattlePokemon; defender: BattlePokemon; dealtDamage: boolean; defenderFlinched: boolean; pivotTriggered: boolean; field: FieldState } {
  const eff = move.effect;

  // Protect: consecutive-use failure roll, otherwise set the flags.
  if (eff?.protect) {
    if (attacker.lastMoveProtected && Math.random() >= 0.5) {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
      attacker = { ...attacker, lastMoveProtected: false };
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
    }
    events.push({ kind: 'protected', turn, pokemonName: attacker.data.name });
    attacker = { ...attacker, protectedThisTurn: true, lastMoveProtected: true };
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  const foeTargeting = targetsFoe(move);

  // Status moves that target the foe are blocked by Protect.
  if (foeTargeting && defender.protectedThisTurn) {
    events.push({
      kind: 'protect_blocked', turn,
      attackerName: attacker.data.name, defenderName: defender.data.name,
      moveName: move.name,
    });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  // Accuracy roll (Sleep Powder 75, Thunder Wave 90, Poison Powder 75, etc.)
  if (move.accuracy !== null && Math.random() > move.accuracy / 100) {
    events.push({
      kind: 'attack', turn,
      attackerName: attacker.data.name, defenderName: defender.data.name,
      moveName: move.name, moveType: move.type,
      damage: 0, isCrit: false, missed: true, effectiveness: 1,
      attackerHpAfter: attacker.currentHp, defenderHpAfter: defender.currentHp,
    });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  // Field / side conditions (Trick Room, Tailwind, screens, Stealth Rock).
  // Setting an already-active effect fails; Stealth Rock lays on the opposing
  // side so switch-ins there take damage.
  if (eff?.fieldEffect) {
    const fx: FieldEffectKind = eff.fieldEffect;
    const failed = (): { attacker: BattlePokemon; defender: BattlePokemon; dealtDamage: boolean; defenderFlinched: boolean; pivotTriggered: boolean; field: FieldState } => {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
    };
    if (fx === 'trickRoom') {
      if (field.trickRoomTurns > 0) return failed();
      const nextField: FieldState = { ...field, trickRoomTurns: TRICK_ROOM_TURNS };
      events.push({ kind: 'field_set', turn, effect: fx, turns: TRICK_ROOM_TURNS, pokemonName: attacker.data.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field: nextField };
    }
    if (fx === 'tailwind' || fx === 'lightScreen' || fx === 'reflect') {
      const userSide = field.sides[attackerSide];
      const currentTurns =
        fx === 'tailwind' ? userSide.tailwindTurns :
        fx === 'lightScreen' ? userSide.lightScreenTurns :
        userSide.reflectTurns;
      if (currentTurns > 0) return failed();
      const duration = fx === 'tailwind' ? TAILWIND_TURNS : SCREEN_TURNS;
      const updatedSide: SideFieldState = { ...userSide };
      if (fx === 'tailwind') updatedSide.tailwindTurns = duration;
      else if (fx === 'lightScreen') updatedSide.lightScreenTurns = duration;
      else updatedSide.reflectTurns = duration;
      const sides: [SideFieldState, SideFieldState] = [field.sides[0], field.sides[1]];
      sides[attackerSide] = updatedSide;
      const nextField: FieldState = { ...field, sides };
      events.push({ kind: 'field_set', turn, effect: fx, side: attackerSide, turns: duration, pokemonName: attacker.data.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field: nextField };
    }
    if (fx === 'stealthRock') {
      const foeSide = opposite(attackerSide);
      if (field.sides[foeSide].stealthRock) return failed();
      const sides: [SideFieldState, SideFieldState] = [field.sides[0], field.sides[1]];
      sides[foeSide] = { ...sides[foeSide], stealthRock: true };
      const nextField: FieldState = { ...field, sides };
      events.push({ kind: 'field_set', turn, effect: fx, side: foeSide, turns: 0, pokemonName: attacker.data.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field: nextField };
    }
  }

  // Taunt (applies to foe)
  if (eff?.taunt) {
    if ((defender.tauntTurns ?? 0) > 0) {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
    }
    defender = { ...defender, tauntTurns: TAUNT_TURNS };
    events.push({ kind: 'taunted', turn, pokemonName: defender.data.name, turns: TAUNT_TURNS });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  // Heal (Recover)
  if (eff?.heal) {
    const maxHp = attacker.level50Stats.hp;
    if (attacker.currentHp >= maxHp) {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
      return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
    }
    const healed = Math.min(maxHp - attacker.currentHp, Math.max(1, Math.floor(maxHp * eff.heal / 100)));
    const hpAfter = attacker.currentHp + healed;
    attacker = { ...attacker, currentHp: hpAfter };
    events.push({ kind: 'heal', turn, pokemonName: attacker.data.name, healed, hpAfter });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  // Stat changes (always apply for status moves — statChance: 0)
  if (eff?.statChanges) {
    for (const sc of eff.statChanges) {
      if (sc.target === 'user') {
        attacker = applyStatChange(attacker, sc.stat, sc.change, turn, events);
      } else {
        defender = applyStatChange(defender, sc.stat, sc.change, turn, events);
      }
    }
  }

  // Primary ailment (Thunder Wave, Sleep Powder, Poison Powder)
  if (eff?.ailment) {
    if (defender.statusCondition) {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
    } else if (isImmuneToAilment(defender, eff.ailment)) {
      events.push({ kind: 'move_failed', turn, pokemonName: attacker.data.name, moveName: move.name });
    } else {
      defender = { ...defender, statusCondition: eff.ailment };
      events.push({ kind: 'status_applied', turn, pokemonName: defender.data.name, condition: eff.ailment });
    }
  }

  const pivotTriggered = !!(eff?.pivotSwitch && attacker.currentHp > 0);
  return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered, field };
}

/**
 * Resolve one attacker's action for a turn, mutating the passed event array.
 * Shared between the 1v1 engine (which calls it twice per turn) and the team
 * engine (which drives attacks one-by-one so it can interleave pivot switches).
 */
export function resolveSingleAttack(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  turnNumber: number,
  ctx: AttackCtx,
  events: TurnEvent[],
): SingleAttackResult {
  const field: FieldState = ctx.field ?? makeInitialField();
  const attackerSide: SideIndex = ctx.attackerSide ?? 0;
  const defenderSide: SideIndex = opposite(attackerSide);

  if (ctx.preFlinched) {
    events.push({ kind: 'cant_move', turn: turnNumber, pokemonName: attacker.data.name, reason: 'flinch' });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }
  if (move.effect?.firstTurnOnly && !attacker.justSwitchedIn) {
    events.push({ kind: 'move_failed', turn: turnNumber, pokemonName: attacker.data.name, moveName: move.name });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  const { canAct: acts, updated: attackerChecked } = canAct(attacker, turnNumber, events);
  attacker = attackerChecked;
  if (!acts) {
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  // Any non-Protect action ends the Protect consecutive-use streak.
  if (!move.effect?.protect && attacker.lastMoveProtected) {
    attacker = { ...attacker, lastMoveProtected: false };
  }

  // Taunt blocks all status moves.
  if (move.damageClass === 'status' && (attacker.tauntTurns ?? 0) > 0) {
    events.push({ kind: 'move_failed', turn: turnNumber, pokemonName: attacker.data.name, moveName: move.name });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  if (move.damageClass === 'status') {
    return resolveStatusMove(attacker, defender, move, turnNumber, attackerSide, field, events);
  }

  // Protect blocks damaging moves from the foe.
  if (defender.protectedThisTurn) {
    events.push({
      kind: 'protect_blocked', turn: turnNumber,
      attackerName: attacker.data.name, defenderName: defender.data.name,
      moveName: move.name,
    });
    return { attacker, defender, dealtDamage: false, defenderFlinched: false, pivotTriggered: false, field };
  }

  const wasLockedBefore = !!attacker.lockedMove && attacker.lockedMove.moveId === move.id;
  const effMove = effectivePowerMove(move, defender, ctx.foeHitUserThisTurn);

  // Brick Break: strip Reflect / Light Screen on the defender's side before
  // damage is calculated, so this attack (and any follow-up) ignores them.
  if (move.effect?.removesScreens) {
    const defSide = field.sides[defenderSide];
    if (defSide.reflectTurns > 0 || defSide.lightScreenTurns > 0) {
      const updatedSide: SideFieldState = { ...defSide };
      const hadReflect = updatedSide.reflectTurns > 0;
      const hadLightScreen = updatedSide.lightScreenTurns > 0;
      updatedSide.reflectTurns = 0;
      updatedSide.lightScreenTurns = 0;
      const sides: [SideFieldState, SideFieldState] = [field.sides[0], field.sides[1]];
      sides[defenderSide] = updatedSide;
      field = { ...field, sides };
      if (hadReflect) events.push({ kind: 'field_expired', turn: turnNumber, effect: 'reflect', side: defenderSide });
      if (hadLightScreen) events.push({ kind: 'field_expired', turn: turnNumber, effect: 'lightScreen', side: defenderSide });
    }
  }

  const result = calcDamage(attacker, defender, effMove, undefined, defenderScreensFor(field, defenderSide));
  const actualDamage = Math.min(result.damage, defender.currentHp);
  const newDefHp = defender.currentHp - actualDamage;
  defender = { ...defender, currentHp: newDefHp };

  events.push({
    kind: 'attack', turn: turnNumber,
    attackerName: attacker.data.name, defenderName: defender.data.name,
    moveName: move.name, moveType: move.type,
    damage: result.damage, isCrit: result.isCrit,
    missed: result.missed, effectiveness: result.effectiveness,
    attackerHpAfter: attacker.currentHp, defenderHpAfter: newDefHp,
  });

  let dealtDamage = false;
  let defenderFlinched = false;
  const connected = !result.missed && result.effectiveness !== 0;
  if (connected) {
    if (result.damage > 0) dealtDamage = true;
    const eff = applySecondaryEffects(attacker, defender, move, actualDamage, turnNumber, events);
    attacker = eff.attacker;
    defender = eff.defender;
    defenderFlinched = eff.defenderFlinched;
  }

  // Tick an existing forced-move lock. Skip on the turn the lock is first set.
  if (wasLockedBefore && attacker.lockedMove) {
    const turnsLeft = attacker.lockedMove.turnsLeft - 1;
    if (turnsLeft <= 0) {
      const turns = 2 + Math.floor(Math.random() * 4);
      events.push({ kind: 'confused', turn: turnNumber, pokemonName: attacker.data.name });
      attacker = { ...attacker, lockedMove: undefined, confused: true, confusionTurnsLeft: turns };
    } else {
      attacker = { ...attacker, lockedMove: { ...attacker.lockedMove, turnsLeft } };
    }
  }

  const pivotTriggered = !!(
    move.effect?.pivotSwitch && connected && attacker.currentHp > 0
  );

  return { attacker, defender, dealtDamage, defenderFlinched, pivotTriggered, field };
}

export function resolveTurn(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  turnNumber: number,
  ai1: AIStrategy = defaultAI,
  ai2: AIStrategy = defaultAI,
  field: FieldState = makeInitialField(),
): { events: TurnEvent[]; p1After: BattlePokemon; p2After: BattlePokemon; battleOver: boolean; lastAttackerIsP1?: boolean; field: FieldState } {
  const move1 = ai1.selectMove(
    { ...pokemon1, moves: usableMoves(pokemon1, turnNumber) },
    pokemon2,
    turnNumber,
    { defenderScreens: defenderScreensFor(field, 1) },
  );
  const move2 = ai2.selectMove(
    { ...pokemon2, moves: usableMoves(pokemon2, turnNumber) },
    pokemon1,
    turnNumber,
    { defenderScreens: defenderScreensFor(field, 0) },
  );
  return resolveTurnWithMoves(pokemon1, pokemon2, move1, move2, turnNumber, field);
}

/**
 * Resolves a single 1v1 turn with pre-selected moves. A `null` move means that
 * side skips its attack this turn (used by the 3v3 engine when a side switches
 * while the other attacks). End-of-turn status ticks still apply to both sides.
 */
export function resolveTurnWithMoves(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  move1: Move | null,
  move2: Move | null,
  turnNumber: number,
  initialField: FieldState = makeInitialField(),
): { events: TurnEvent[]; p1After: BattlePokemon; p2After: BattlePokemon; battleOver: boolean; lastAttackerIsP1?: boolean; field: FieldState } {
  let field: FieldState = initialField;
  // Build the ordered list of attackers. Zero, one, or two entries.
  type Attacker = { isP1: boolean; move: Move };
  const attackers: Attacker[] = [];
  if (move1 && move2) {
    let p1First: boolean;
    const pri1 = effectivePriority(move1);
    const pri2 = effectivePriority(move2);
    if (pri1 !== pri2) {
      p1First = pri1 > pri2;
    } else {
      const spd1 = sideEffectiveSpeed(pokemon1, field, 0);
      const spd2 = sideEffectiveSpeed(pokemon2, field, 1);
      if (spd1 !== spd2) {
        // Trick Room reverses the speed comparison within the same priority bracket.
        p1First = field.trickRoomTurns > 0 ? spd1 < spd2 : spd1 > spd2;
      } else {
        p1First = Math.random() < 0.5;
      }
    }
    if (p1First) {
      attackers.push({ isP1: true, move: move1 });
      attackers.push({ isP1: false, move: move2 });
    } else {
      attackers.push({ isP1: false, move: move2 });
      attackers.push({ isP1: true, move: move1 });
    }
  } else if (move1) {
    attackers.push({ isP1: true, move: move1 });
  } else if (move2) {
    attackers.push({ isP1: false, move: move2 });
  }

  const events: TurnEvent[] = [];
  let p1 = { ...pokemon1 };
  let p2 = { ...pokemon2 };
  let battleOver = false;
  let lastAttackerIsP1: boolean | undefined;
  let secondFlinched = false;
  let firstDealtDamage = false; // for Revenge on second attacker

  for (let i = 0; i < attackers.length; i++) {
    if (battleOver) break;
    const { isP1, move } = attackers[i];
    const isFirst = i === 0;
    let attacker = isP1 ? p1 : p2;
    let defender = isP1 ? p2 : p1;

    const r = resolveSingleAttack(attacker, defender, move, turnNumber, {
      preFlinched: !isFirst && secondFlinched,
      foeHitUserThisTurn: !isFirst && firstDealtDamage,
      field,
      attackerSide: isP1 ? 0 : 1,
    }, events);
    attacker = r.attacker;
    defender = r.defender;
    field = r.field;
    if (isFirst) {
      firstDealtDamage = r.dealtDamage;
      secondFlinched = r.defenderFlinched;
    }

    if (isP1) { p1 = attacker; p2 = defender; }
    else      { p2 = attacker; p1 = defender; }

    if (p1.currentHp <= 0 || p2.currentHp <= 0) {
      battleOver = true;
      lastAttackerIsP1 = isP1;
    }
  }

  // End-of-turn burn / poison ticks
  if (!battleOver) {
    p1 = applyEndOfTurnStatus(p1, turnNumber, events);
    p2 = applyEndOfTurnStatus(p2, turnNumber, events);
    if (p1.currentHp <= 0 || p2.currentHp <= 0) battleOver = true;
  }

  // Taunt countdown (runs regardless of KO).
  p1 = tickTaunt(p1, turnNumber, events);
  p2 = tickTaunt(p2, turnNumber, events);

  // Decrement any active field / side counters. Runs regardless of KO so that
  // Trick Room etc. still expires when one side faints.
  field = tickField(field, turnNumber, events);

  // Clear per-turn Protect flag. lastMoveProtected persists between turns so
  // that consecutive Protect uses can fail — it's cleared when the user takes
  // any non-Protect action (handled in resolveSingleAttack).
  if (p1.protectedThisTurn) p1 = { ...p1, protectedThisTurn: false };
  if (p2.protectedThisTurn) p2 = { ...p2, protectedThisTurn: false };
  if (p1.justSwitchedIn) p1 = { ...p1, justSwitchedIn: false };
  if (p2.justSwitchedIn) p2 = { ...p2, justSwitchedIn: false };

  return { events, p1After: p1, p2After: p2, battleOver, lastAttackerIsP1, field };
}

export function runFullBattle(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  ai1: AIStrategy = defaultAI,
  ai2: AIStrategy = defaultAI,
): BattleResult {
  let p1 = { ...pokemon1 };
  let p2 = { ...pokemon2 };
  const allEvents: TurnEvent[] = [];
  let turn = 1;
  const MAX_TURNS = 500;
  let field = makeInitialField();

  let lastAttackerIsP1: boolean | undefined;
  while (p1.currentHp > 0 && p2.currentHp > 0 && turn <= MAX_TURNS) {
    const result = resolveTurn(p1, p2, turn, ai1, ai2, field);
    allEvents.push(...result.events);
    p1 = result.p1After;
    p2 = result.p2After;
    field = result.field;
    lastAttackerIsP1 = result.lastAttackerIsP1;
    if (result.battleOver) break;
    turn++;
  }

  let winner: BattlePokemon, loser: BattlePokemon;
  if (p1.currentHp > 0) {
    winner = p1; loser = p2;
  } else if (p2.currentHp > 0) {
    winner = p2; loser = p1;
  } else {
    // Both fainted (recoil KO) — the attacker wins
    const attackerIsP1 = lastAttackerIsP1 === true;
    winner = attackerIsP1 ? p1 : p2;
    loser = attackerIsP1 ? p2 : p1;
  }
  return { winner, loser, log: allEvents };
}
