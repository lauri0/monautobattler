import type { BattlePokemon, TurnEvent, BattleResult } from '../models/types';
import { calcDamage } from './damageCalc';
import { defaultAI } from '../ai/aiModule';

export function resolveTurn(
  pokemon1: BattlePokemon,
  pokemon2: BattlePokemon,
  turnNumber: number
): { events: TurnEvent[]; p1After: BattlePokemon; p2After: BattlePokemon; battleOver: boolean } {
  const move1 = defaultAI.selectMove(pokemon1, pokemon2);
  const move2 = defaultAI.selectMove(pokemon2, pokemon1);

  // Determine order
  let first: BattlePokemon;
  let second: BattlePokemon;
  let firstMove: typeof move1;
  let secondMove: typeof move2;

  if (move1.priority !== move2.priority) {
    if (move1.priority > move2.priority) {
      [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
    } else {
      [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
    }
  } else if (pokemon1.level50Stats.speed !== pokemon2.level50Stats.speed) {
    if (pokemon1.level50Stats.speed > pokemon2.level50Stats.speed) {
      [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
    } else {
      [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
    }
  } else {
    // Speed tie: random
    if (Math.random() < 0.5) {
      [first, second, firstMove, secondMove] = [pokemon1, pokemon2, move1, move2];
    } else {
      [first, second, firstMove, secondMove] = [pokemon2, pokemon1, move2, move1];
    }
  }

  const events: TurnEvent[] = [];
  let p1 = { ...pokemon1 };
  let p2 = { ...pokemon2 };
  let battleOver = false;

  // First attacker attacks
  const firstIsP1 = first.data.id === pokemon1.data.id;
  {
    const attacker = firstIsP1 ? p1 : p2;
    const defender = firstIsP1 ? p2 : p1;
    const result = calcDamage(attacker, defender, firstMove);
    const newDefHp = Math.max(0, defender.currentHp - result.damage);

    if (firstIsP1) {
      p2 = { ...p2, currentHp: newDefHp };
    } else {
      p1 = { ...p1, currentHp: newDefHp };
    }

    events.push({
      turn: turnNumber,
      attackerName: attacker.data.name,
      defenderName: defender.data.name,
      moveName: firstMove.name,
      moveType: firstMove.type,
      damage: result.damage,
      isCrit: result.isCrit,
      missed: result.missed,
      effectiveness: result.effectiveness,
      attackerHpAfter: attacker.currentHp,
      defenderHpAfter: newDefHp,
    });

    if (newDefHp <= 0) {
      battleOver = true;
    }
  }

  // Second attacker attacks (if still alive)
  if (!battleOver) {
    const secondIsP1 = second.data.id === pokemon1.data.id;
    const attacker = secondIsP1 ? p1 : p2;
    const defender = secondIsP1 ? p2 : p1;
    const result = calcDamage(attacker, defender, secondMove);
    const newDefHp = Math.max(0, defender.currentHp - result.damage);

    if (secondIsP1) {
      p2 = { ...p2, currentHp: newDefHp };
    } else {
      p1 = { ...p1, currentHp: newDefHp };
    }

    events.push({
      turn: turnNumber,
      attackerName: attacker.data.name,
      defenderName: defender.data.name,
      moveName: secondMove.name,
      moveType: secondMove.type,
      damage: result.damage,
      isCrit: result.isCrit,
      missed: result.missed,
      effectiveness: result.effectiveness,
      attackerHpAfter: attacker.currentHp,
      defenderHpAfter: newDefHp,
    });

    if (newDefHp <= 0) battleOver = true;
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
