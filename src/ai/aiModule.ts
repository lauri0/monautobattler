import type { BattlePokemon, Move, AIStrategy } from '../models/types';
import { calcMinDamage, calcExpectedDamage, type DefenderScreens } from '../battle/damageCalc';

export type { AIStrategy };

/**
 * Default AI: uses real damage calculations to make decisions.
 * Priority: priority KO > guaranteed KO > best expected damage.
 */
export class DefaultAI implements AIStrategy {
  selectMove(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    _turnNumber?: number,
    opts?: { defenderScreens?: DefenderScreens },
  ): Move {
    const screens = opts?.defenderScreens;
    const moves = attacker.moves;
    const hpLeft = defender.currentHp;

    // 1. Priority KO check
    const priorityKOs = moves
      .filter(m => m.priority > 0 && calcMinDamage(attacker, defender, m, screens) >= hpLeft);
    if (priorityKOs.length > 0) {
      return bestByAccuracyThenPower(priorityKOs);
    }

    // 2. Guaranteed KO (any move)
    const koMoves = moves.filter(m => calcMinDamage(attacker, defender, m, screens) >= hpLeft);
    if (koMoves.length > 0) {
      return bestByAccuracyThenPower(koMoves);
    }

    // 3. Best expected damage (accuracy-weighted)
    return moves.reduce((best, m) => {
      const acc = m.accuracy ?? 100;
      const bestAcc = best.accuracy ?? 100;
      const score = calcExpectedDamage(attacker, defender, m, screens) * (acc / 100);
      const bestScore = calcExpectedDamage(attacker, defender, best, screens) * (bestAcc / 100);
      if (score > bestScore) return m;
      if (score === bestScore) {
        if (acc > bestAcc) return m;
        if (acc === bestAcc && m.power > best.power) return m;
      }
      return best;
    });
  }
}

function bestByAccuracyThenPower(moves: Move[]): Move {
  return moves.reduce((best, m) => {
    const acc = m.accuracy ?? 100;
    const bestAcc = best.accuracy ?? 100;
    if (acc > bestAcc) return m;
    if (acc === bestAcc && m.power > best.power) return m;
    return best;
  });
}

export const defaultAI: AIStrategy = new DefaultAI();
