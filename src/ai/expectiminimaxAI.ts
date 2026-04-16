import type { BattlePokemon, Move, AIStrategy } from '../models/types';
import { simulateTurnDeterministic, usableMoves } from '../battle/battleEngine';
import type { ChanceOutcome } from '../battle/battleEngine';

const DEPTH = 2;
const PRUNE_THRESHOLD = 0.01;

// ── Leaf heuristic ────────────────────────────────────────────────────────────

const STATUS_PENALTY: Record<string, number> = {
  burn: 0.05,
  poison: 0.05,
  paralysis: 0.08,
  sleep: 0.15,
  freeze: 0.15,
};

function sumStages(p: BattlePokemon): number {
  return Object.values(p.statStages).reduce((s, v) => s + v, 0);
}

function scoreLeaf(aiP: BattlePokemon, oppP: BattlePokemon, aiWasLastAttacker?: boolean): number {
  // Always return a smooth score that reflects HP differential, even at terminal
  // states. Using a hard ±1 for faint creates large "flat" regions where the AI
  // sees every move as an equivalent loss (e.g. when it's going to be KO'd in
  // all branches within the search horizon), forcing it to break ties on move
  // order rather than damage dealt. A smooth score lets the AI still prefer
  // "losing less badly" — i.e. dealing more damage before fainting.
  const aiHpFrac = Math.max(0, aiP.currentHp) / aiP.level50Stats.hp;
  const oppHpFrac = Math.max(0, oppP.currentHp) / oppP.level50Stats.hp;
  let faintTerm = (oppP.currentHp <= 0 ? 1 : 0) - (aiP.currentHp <= 0 ? 1 : 0);
  // Both fainted (recoil KO): the attacker wins
  if (aiP.currentHp <= 0 && oppP.currentHp <= 0 && aiWasLastAttacker !== undefined) {
    faintTerm = aiWasLastAttacker ? 1 : -1;
  }
  const hpScore = (aiHpFrac - oppHpFrac) * 0.5;
  const stageScore = (sumStages(aiP) - sumStages(oppP)) * 0.02;
  const statusScore =
    (STATUS_PENALTY[oppP.statusCondition ?? ''] ?? 0) -
    (STATUS_PENALTY[aiP.statusCondition ?? ''] ?? 0);
  return faintTerm + hpScore + stageScore + statusScore;
}

// ── Chance node enumeration ───────────────────────────────────────────────────

interface EffectFlags {
  statChange: boolean;
  ailment: boolean;
  flinch: boolean;
  confusion: boolean;
}

interface MoveBranch {
  hit: boolean;
  effects: EffectFlags;
  prob: number;
}

function branchesForMove(
  defender: BattlePokemon,
  move: Move,
): MoveBranch[] {
  const eff = move.effect;
  const accProb = move.accuracy !== null ? move.accuracy / 100 : 1;

  // If move misses: no effects
  const missBranch: MoveBranch = {
    hit: false,
    effects: { statChange: false, ailment: false, flinch: false, confusion: false },
    prob: 1 - accProb,
  };

  // Build hit branches as cartesian product of secondary effect outcomes
  const hasStatChange = !!(eff?.statChanges?.length && eff.statChance !== 0 /* 0 = always */);
  const alwaysStatChange = !!(eff?.statChanges?.length && (eff.statChance === 0 || eff.statChance === undefined));
  const hasAilment = !!(eff?.ailment && !defender.statusCondition && eff.ailmentChance !== 0);
  const alwaysAilment = !!(eff?.ailment && !defender.statusCondition && (eff.ailmentChance === 0 || eff.ailmentChance === undefined));
  const hasFlinch = !!(eff?.flinchChance && eff.flinchChance > 0);
  const hasConfusion = !!(eff?.confuses && !defender.confused && eff.confusionChance !== 0);
  const alwaysConfusion = !!(eff?.confuses && !defender.confused && (eff.confusionChance === 0 || eff.confusionChance === undefined));

  const statChangeProb = hasStatChange ? (eff!.statChance! / 100) : (alwaysStatChange ? 1 : 0);
  const ailmentProb = hasAilment ? (eff!.ailmentChance! / 100) : (alwaysAilment ? 1 : 0);
  const flinchProb = hasFlinch ? (eff!.flinchChance! / 100) : 0;
  const confusionProb = hasConfusion ? (eff!.confusionChance! / 100) : (alwaysConfusion ? 1 : 0);

  // Cartesian product of binary secondary-effect outcomes
  type Pair = [boolean, number]; // [triggered, probability]
  function boolBranches(prob: number): Pair[] {
    if (prob <= 0) return [[false, 1]];
    if (prob >= 1) return [[true, 1]];
    return [[true, prob], [false, 1 - prob]];
  }

  const hitBranches: MoveBranch[] = [];
  for (const [sc, sp] of boolBranches(statChangeProb)) {
    for (const [al, ap] of boolBranches(ailmentProb)) {
      for (const [fl, fp] of boolBranches(flinchProb)) {
        for (const [cf, cp] of boolBranches(confusionProb)) {
          hitBranches.push({
            hit: true,
            effects: { statChange: sc, ailment: al, flinch: fl, confusion: cf },
            prob: accProb * sp * ap * fp * cp,
          });
        }
      }
    }
  }

  const branches = accProb < 1 ? [...hitBranches, missBranch] : hitBranches;
  return branches.filter(b => b.prob >= PRUNE_THRESHOLD);
}

export function enumerateOutcomes(
  p1: BattlePokemon,
  p2: BattlePokemon,
  m1: Move,
  m2: Move,
): ChanceOutcome[] {
  const branches1 = branchesForMove(p2, m1);
  const branches2 = branchesForMove(p1, m2);
  const outcomes: ChanceOutcome[] = [];
  for (const b1 of branches1) {
    for (const b2 of branches2) {
      const prob = b1.prob * b2.prob;
      if (prob < PRUNE_THRESHOLD) continue;
      outcomes.push({
        probability: prob,
        hitM1: b1.hit,
        hitM2: b2.hit,
        effectsM1: b1.effects,
        effectsM2: b2.effects,
      });
    }
  }
  // Normalize probabilities to account for pruning
  const total = outcomes.reduce((s, o) => s + o.probability, 0);
  if (total > 0 && total < 1) {
    for (const o of outcomes) o.probability /= total;
  }
  return outcomes;
}

// ── Expectiminimax ────────────────────────────────────────────────────────────

/**
 * Simultaneous-move maximin expectiminimax.
 * p1 = the AI's pokemon (maximizer), p2 = opponent (minimizer).
 * Returns the expected score from p1's perspective.
 */
function expectiminimax(
  p1: BattlePokemon,
  p2: BattlePokemon,
  depth: number,
  turnNumber: number,
): number {
  if (p1.currentHp <= 0 || p2.currentHp <= 0) return scoreLeaf(p1, p2);
  if (depth === 0) return scoreLeaf(p1, p2);

  // Prune moves that can't be used this turn (e.g. Fake Out after turn 1) so
  // the tree doesn't waste branches on guaranteed-no-op actions.
  const p1Moves = usableMoves(p1, turnNumber);
  const p2Moves = usableMoves(p2, turnNumber);

  let bestVal = -Infinity;

  for (const aiMove of p1Moves) {
    let worstVal = Infinity;

    for (const oppMove of p2Moves) {
      const outcomes = enumerateOutcomes(p1, p2, aiMove, oppMove);
      let expectedVal = 0;

      for (const outcome of outcomes) {
        const { p1After, p2After, battleOver, lastAttackerIsP1 } = simulateTurnDeterministic(
          p1, p2, aiMove, oppMove, turnNumber, outcome,
        );
        const childVal = battleOver
          ? scoreLeaf(p1After, p2After, lastAttackerIsP1)
          : expectiminimax(p1After, p2After, depth - 1, turnNumber + 1);
        expectedVal += outcome.probability * childVal;
      }

      if (expectedVal < worstVal) worstVal = expectedVal;
    }

    if (worstVal > bestVal) bestVal = worstVal;
  }

  return bestVal;
}

// ── AIStrategy implementation ─────────────────────────────────────────────────

export class ExpectiminimaxAI implements AIStrategy {
  selectMove(attacker: BattlePokemon, defender: BattlePokemon, turnNumber = 1): Move {
    // Root-level move list: already filtered by resolveTurn, but re-apply for
    // safety in case a caller hands us unfiltered moves.
    const aiMoves = usableMoves(attacker, turnNumber);
    const oppMoves = usableMoves(defender, turnNumber);

    let bestMove = aiMoves[0] ?? attacker.moves[0];
    let bestVal = -Infinity;

    for (const aiMove of aiMoves) {
      let worstVal = Infinity;

      for (const oppMove of oppMoves) {
        const outcomes = enumerateOutcomes(attacker, defender, aiMove, oppMove);
        let expectedVal = 0;

        for (const outcome of outcomes) {
          const { p1After, p2After, battleOver, lastAttackerIsP1 } = simulateTurnDeterministic(
            attacker, defender, aiMove, oppMove, turnNumber, outcome,
          );
          const childVal = battleOver
            ? scoreLeaf(p1After, p2After, lastAttackerIsP1)
            : expectiminimax(p1After, p2After, DEPTH - 1, turnNumber + 1);
          expectedVal += outcome.probability * childVal;
        }

        if (expectedVal < worstVal) worstVal = expectedVal;
      }

      if (worstVal > bestVal) {
        bestVal = worstVal;
        bestMove = aiMove;
      }
    }

    return bestMove;
  }
}

export const expectiminimaxAI: AIStrategy = new ExpectiminimaxAI();
