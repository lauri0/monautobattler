import type { BattlePokemon, TurnEvent, BattleResult, StatStageName, StatStages } from '../models/types';
import { calcDamage, effectiveSpeed } from './damageCalc';
import { defaultAI } from '../ai/aiModule';

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

function applySecondaryEffects(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: { effect?: import('../models/types').MoveEffect },
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
  if (eff.ailment && !defender.statusCondition) {
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

  // Confusion
  if (eff.confuses && !defender.confused) {
    const chance = eff.confusionChance ?? 0;
    if (chance === 0 || Math.random() * 100 < chance) {
      const turns = 2 + Math.floor(Math.random() * 4); // 2–5 turns
      events.push({ kind: 'confused', turn, pokemonName: defender.data.name });
      defender = { ...defender, confused: true, confusionTurnsLeft: turns };
    }
  }

  return { attacker, defender, defenderFlinched };
}

function applyEndOfTurnStatus(
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

export function resolveTurn(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  turnNumber: number
): { events: TurnEvent[]; p1After: BattlePokemon; p2After: BattlePokemon; battleOver: boolean } {
  // Filter firstTurnOnly moves on turns > 1
  const movesFor = (p: BattlePokemon) =>
    turnNumber > 1 ? p.moves.filter(m => !m.effect?.firstTurnOnly) : p.moves;

  const move1 = defaultAI.selectMove({ ...pokemon1, moves: movesFor(pokemon1) }, pokemon2);
  const move2 = defaultAI.selectMove({ ...pokemon2, moves: movesFor(pokemon2) }, pokemon1);

  // Determine order
  let first: BattlePokemon, second: BattlePokemon;
  let firstMove: typeof move1, secondMove: typeof move2;

  if (move1.priority !== move2.priority) {
    if (move1.priority > move2.priority) {
      [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
    } else {
      [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
    }
  } else {
    const spd1 = effectiveSpeed(pokemon1);
    const spd2 = effectiveSpeed(pokemon2);
    if (spd1 !== spd2) {
      if (spd1 > spd2) {
        [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
      } else {
        [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
      }
    } else {
      if (Math.random() < 0.5) {
        [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
      } else {
        [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
      }
    }
  }

  const events: TurnEvent[] = [];
  let p1 = { ...pokemon1 };
  let p2 = { ...pokemon2 };
  let battleOver = false;
  let secondFlinched = false;

  // ── First attacker ──────────────────────────────────────────────
  {
    const firstIsP1 = first.data.id === pokemon1.data.id;
    let attacker = firstIsP1 ? p1 : p2;
    let defender = firstIsP1 ? p2 : p1;

    // Fake Out / firstTurnOnly fail on turn > 1
    if (firstMove.effect?.firstTurnOnly && turnNumber > 1) {
      events.push({ kind: 'move_failed', turn: turnNumber, pokemonName: attacker.data.name, moveName: firstMove.name });
    } else {
      const { canAct: acts, updated: attackerChecked } = canAct(attacker, turnNumber, events);
      attacker = attackerChecked;

      if (acts) {
        const result = calcDamage(attacker, defender, firstMove);
        const newDefHp = Math.max(0, defender.currentHp - result.damage);
        defender = { ...defender, currentHp: newDefHp };

        events.push({
          kind: 'attack', turn: turnNumber,
          attackerName: attacker.data.name, defenderName: defender.data.name,
          moveName: firstMove.name, moveType: firstMove.type,
          damage: result.damage, isCrit: result.isCrit,
          missed: result.missed, effectiveness: result.effectiveness,
          attackerHpAfter: attacker.currentHp, defenderHpAfter: newDefHp,
        });

        if (!result.missed && result.effectiveness !== 0) {
          const eff = applySecondaryEffects(attacker, defender, firstMove, result.damage, turnNumber, events);
          attacker = eff.attacker;
          defender = eff.defender;
          secondFlinched = eff.defenderFlinched;
        }
      }
    }

    if (firstIsP1) { p1 = attacker; p2 = defender; }
    else            { p2 = attacker; p1 = defender; }

    if (p1.currentHp <= 0 || p2.currentHp <= 0) battleOver = true;
  }

  // ── Second attacker ─────────────────────────────────────────────
  if (!battleOver) {
    const secondIsP1 = second.data.id === pokemon1.data.id;
    let attacker = secondIsP1 ? p1 : p2;
    let defender = secondIsP1 ? p2 : p1;

    if (secondFlinched) {
      events.push({ kind: 'cant_move', turn: turnNumber, pokemonName: attacker.data.name, reason: 'flinch' });
    } else if (secondMove.effect?.firstTurnOnly && turnNumber > 1) {
      events.push({ kind: 'move_failed', turn: turnNumber, pokemonName: attacker.data.name, moveName: secondMove.name });
    } else {
      const { canAct: acts, updated: attackerChecked } = canAct(attacker, turnNumber, events);
      attacker = attackerChecked;

      if (acts) {
        const result = calcDamage(attacker, defender, secondMove);
        const newDefHp = Math.max(0, defender.currentHp - result.damage);
        defender = { ...defender, currentHp: newDefHp };

        events.push({
          kind: 'attack', turn: turnNumber,
          attackerName: attacker.data.name, defenderName: defender.data.name,
          moveName: secondMove.name, moveType: secondMove.type,
          damage: result.damage, isCrit: result.isCrit,
          missed: result.missed, effectiveness: result.effectiveness,
          attackerHpAfter: attacker.currentHp, defenderHpAfter: newDefHp,
        });

        if (!result.missed && result.effectiveness !== 0) {
          const eff = applySecondaryEffects(attacker, defender, secondMove, result.damage, turnNumber, events);
          attacker = eff.attacker;
          defender = eff.defender;
          // flinch on second attacker has no effect this turn
        }
      }
    }

    if (secondIsP1) { p1 = attacker; p2 = defender; }
    else             { p2 = attacker; p1 = defender; }

    if (p1.currentHp <= 0 || p2.currentHp <= 0) battleOver = true;
  }

  // ── End-of-turn: burn / poison ticks ────────────────────────────
  if (!battleOver) {
    p1 = applyEndOfTurnStatus(p1, turnNumber, events);
    p2 = applyEndOfTurnStatus(p2, turnNumber, events);
    if (p1.currentHp <= 0 || p2.currentHp <= 0) battleOver = true;
  }

  return { events, p1After: p1, p2After: p2, battleOver };
}

export function runFullBattle(pokemon1: BattlePokemon, pokemon2: BattlePokemon): BattleResult {
  let p1 = { ...pokemon1 };
  let p2 = { ...pokemon2 };
  const allEvents: TurnEvent[] = [];
  let turn = 1;
  const MAX_TURNS = 500;

  while (p1.currentHp > 0 && p2.currentHp > 0 && turn <= MAX_TURNS) {
    const { events, p1After, p2After, battleOver } = resolveTurn(p1, p2, turn);
    allEvents.push(...events);
    p1 = p1After;
    p2 = p2After;
    if (battleOver) break;
    turn++;
  }

  const winner = p1.currentHp > 0 ? p1 : p2;
  const loser = p1.currentHp > 0 ? p2 : p1;
  return { winner, loser, log: allEvents };
}
