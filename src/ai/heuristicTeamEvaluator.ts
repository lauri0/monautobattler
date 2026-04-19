import type { BattlePokemon, Team, TeamEvaluator, SideIndex } from '../models/types';

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

/**
 * Heuristic leaf evaluator. Returns a value in [-1, +1] from `side`'s perspective.
 * Weighted blend of HP-remaining, alive-count, active stat-stage edge, and status
 * penalties, squashed through tanh. Designed to be swappable for a neural net
 * evaluator without any MCTS code changes.
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

    const raw =
      0.6 * (ourHpFrac - theirHpFrac) +
      0.4 * (aliveDiff / 3) +
      0.05 * stageDiff +
      statusDiff;

    return { value: Math.tanh(raw * 3) };
  },
};
