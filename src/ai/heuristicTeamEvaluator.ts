import type { BattlePokemon, Team, TeamBattleState, TeamEvaluator, SideIndex } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';

const STATUS_PENALTY: Record<string, number> = {
  burn: 0.05,
  poison: 0.05,
  paralysis: 0.08,
  sleep: 0.15,
  freeze: 0.15,
};

function hpTotal(t: Team): number {
  return t.pokemon.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
}
function hpMax(t: Team): number {
  return t.pokemon.reduce((s, p) => s + p.level50Stats.hp, 0);
}
function aliveCount(t: Team): number {
  return t.pokemon.filter(p => p.currentHp > 0).length;
}
function stageSum(p: BattlePokemon): number {
  let s = 0;
  for (const v of Object.values(p.statStages)) s += v;
  return s;
}

// Best attacking multiplier this pokemon has against the given defender.
// Looks at damaging moves only; status moves ignored.
function bestOffensiveMult(attacker: BattlePokemon, defender: BattlePokemon): number {
  let best = 1;
  let anyDamaging = false;
  for (const m of attacker.moves) {
    if (m.damageClass === 'status') continue;
    anyDamaging = true;
    const mult = getTypeEffectiveness(m.type, defender.data.types, m.effect?.superEffectiveAgainst);
    if (mult > best) best = mult;
  }
  return anyDamaging ? best : 1;
}

// Averaged log2 effectiveness of each alive pokemon on `side` vs the opposing active.
// log2 puts immunity at a floor (we treat 0 as 0.25 ≈ -2), 0.5x at -1, 1x at 0, 2x at +1, 4x at +2.
function offensiveScore(side: Team, opponentActive: BattlePokemon): number {
  const alive = side.pokemon.filter(p => p.currentHp > 0);
  if (alive.length === 0 || opponentActive.currentHp <= 0) return 0;
  let sum = 0;
  for (const p of alive) {
    const mult = bestOffensiveMult(p, opponentActive);
    const lg = mult <= 0 ? -2 : Math.log2(mult);
    sum += Math.max(-2, Math.min(2, lg));
  }
  return sum / alive.length;
}

function avgSpeed(t: Team): number {
  const alive = t.pokemon.filter(p => p.currentHp > 0);
  if (alive.length === 0) return 0;
  return alive.reduce((s, p) => s + p.level50Stats.speed, 0) / alive.length;
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

function sideScreenScore(state: TeamBattleState, side: SideIndex): number {
  const s = state.field.sides[side];
  return (s.reflectTurns > 0 ? 1 : 0) + (s.lightScreenTurns > 0 ? 1 : 0);
}

/**
 * Heuristic leaf evaluator. Returns a value in [-1, +1] from `side`'s perspective.
 * Blends HP, alive count, stat-stages, status, type matchup, hazards, and field
 * conditions. Designed to be swappable for a neural net evaluator without any
 * MCTS code changes.
 */
export const heuristicTeamEvaluator: TeamEvaluator = {
  evaluate(state, side) {
    const flip: SideIndex = side === 0 ? 1 : 0;
    const ours = state.teams[side];
    const theirs = state.teams[flip];

    const ourHpFrac = hpMax(ours) > 0 ? hpTotal(ours) / hpMax(ours) : 0;
    const theirHpFrac = hpMax(theirs) > 0 ? hpTotal(theirs) / hpMax(theirs) : 0;
    const aliveDiff = aliveCount(ours) - aliveCount(theirs);

    const ourActive = ours.pokemon[ours.activeIdx];
    const theirActive = theirs.pokemon[theirs.activeIdx];
    const stageDiff =
      (ourActive.currentHp > 0 ? stageSum(ourActive) : 0) -
      (theirActive.currentHp > 0 ? stageSum(theirActive) : 0);

    const statusDiff =
      (STATUS_PENALTY[theirActive.statusCondition ?? ''] ?? 0) -
      (STATUS_PENALTY[ourActive.statusCondition ?? ''] ?? 0);

    const offensiveDiff = offensiveScore(ours, theirActive) - offensiveScore(theirs, ourActive);

    const hazardDiff =
      (state.field.sides[flip].stealthRock ? 1 : 0) -
      (state.field.sides[side].stealthRock ? 1 : 0);

    const screenDiff = sideScreenScore(state, side) - sideScreenScore(state, flip);

    const tailwindDiff =
      sign(state.field.sides[side].tailwindTurns) -
      sign(state.field.sides[flip].tailwindTurns);

    const trickRoomActive = state.field.trickRoomTurns > 0 ? 1 : 0;
    const trickRoomTerm = trickRoomActive * sign(avgSpeed(theirs) - avgSpeed(ours));

    const raw =
      0.6 * (ourHpFrac - theirHpFrac) +
      0.4 * (aliveDiff / 3) +
      0.05 * stageDiff +
      statusDiff +
      0.15 * offensiveDiff +
      0.08 * hazardDiff +
      0.04 * screenDiff +
      0.05 * tailwindDiff +
      0.03 * trickRoomTerm;

    return { value: Math.tanh(raw * 2.5) };
  },
};
