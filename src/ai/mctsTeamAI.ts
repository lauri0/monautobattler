import type {
  TeamBattleState,
  TeamAction,
  TeamAIStrategy,
  TeamEvaluator,
  SideIndex,
} from '../models/types';
import { legalActions, applyActions, battleWinner } from '../battle/teamBattleEngine';
import { heuristicTeamEvaluator } from './heuristicTeamEvaluator';

// Decoupled-UCT MCTS for simultaneous-move stochastic games.
// Each node tracks independent UCT statistics for each side's action set.
// Children are keyed by the joint action string; the resulting state is sampled
// once (via applyActions, which calls RNG inside) and cached. Leaves are scored
// by a pluggable TeamEvaluator — swap in a neural net without touching MCTS.

const C_UCB = 1.0;
const MAX_ROLLOUT_DEPTH = 40;
const DEFAULT_ITERATIONS = 5000;

interface ActionStat {
  visits: number;
  totalValue: number; // from side 0's perspective
}

interface MctsChild {
  node: MctsNode;
}

interface MctsNode {
  state: TeamBattleState;
  legal0: TeamAction[];
  legal1: TeamAction[];
  keys0: string[];
  keys1: string[];
  stats0: Map<string, ActionStat>;
  stats1: Map<string, ActionStat>;
  children: Map<string, MctsChild>;
  visits: number;
  terminalValue: number | null;
}

function actionKey(a: TeamAction): string {
  return a.kind === 'move' ? `m${a.move.id}` : `s${a.targetIdx}`;
}

// Signature that splits children by the major, RNG-flippable aspects of the
// resulting state: which pokemon is active, coarse HP bucket, status, and
// stat-stage sum per side. Damage-roll noise within the same HP bucket still
// averages (desirable), but KOs, status procs, and stat-boost procs fork the
// tree into separate subtrees.
function outcomeSignature(state: TeamBattleState): string {
  const parts: string[] = [state.phase];
  for (let s = 0; s < 2; s++) {
    const t = state.teams[s];
    const p = t.pokemon[t.activeIdx];
    const maxHp = p.level50Stats.hp;
    const hpBucket = maxHp > 0
      ? Math.max(0, Math.min(8, Math.floor((p.currentHp / maxHp) * 8)))
      : 0;
    let sb = 0;
    for (const v of Object.values(p.statStages)) sb += v;
    sb = Math.max(-12, Math.min(12, sb));
    parts.push(`${t.activeIdx}:${hpBucket}:${p.statusCondition ?? 'n'}:${sb}`);
  }
  parts.push(state.pendingAttack ? `p${state.pendingAttack.side}` : '-');
  return parts.join('|');
}

function makeNode(state: TeamBattleState): MctsNode {
  const winner = battleWinner(state);
  const terminalValue = winner === null ? null : winner === 0 ? 1 : -1;
  const legal0 = winner !== null ? [] : legalActions(state, 0);
  const legal1 = winner !== null ? [] : legalActions(state, 1);
  const keys0 = legal0.map(actionKey);
  const keys1 = legal1.map(actionKey);
  const stats0 = new Map<string, ActionStat>();
  const stats1 = new Map<string, ActionStat>();
  for (const k of keys0) stats0.set(k, { visits: 0, totalValue: 0 });
  for (const k of keys1) stats1.set(k, { visits: 0, totalValue: 0 });
  return {
    state, legal0, legal1, keys0, keys1,
    stats0, stats1,
    children: new Map(),
    visits: 0,
    terminalValue,
  };
}

function pickByUCB(
  stats: Map<string, ActionStat>,
  keys: string[],
  parentVisits: number,
  maximize: boolean,
): string | null {
  if (keys.length === 0) return null;
  const unvisited: string[] = [];
  let bestKey = keys[0];
  let bestVal = -Infinity;
  const logP = Math.log(parentVisits + 1);
  for (const k of keys) {
    const s = stats.get(k)!;
    if (s.visits === 0) { unvisited.push(k); continue; }
    const mean = s.totalValue / s.visits;
    const val = (maximize ? mean : -mean) + C_UCB * Math.sqrt(logP / s.visits);
    if (val > bestVal) { bestVal = val; bestKey = k; }
  }
  if (unvisited.length > 0) {
    return unvisited[Math.floor(Math.random() * unvisited.length)];
  }
  return bestKey;
}

export class MctsTeamAI implements TeamAIStrategy {
  constructor(
    private iterations: number = DEFAULT_ITERATIONS,
    private evaluator: TeamEvaluator = heuristicTeamEvaluator,
    // 0 = argmax over visits (deterministic). Higher = softer sampling.
    // 1 = sample proportional to visits. Small positive values keep play
    // strong while avoiding full determinism in simultaneous-move turns.
    private temperature: number = 0.5,
  ) {}

  selectAction(state: TeamBattleState, side: SideIndex): TeamAction {
    const myLegal = legalActions(state, side);
    if (myLegal.length === 0) {
      throw new Error(`selectAction called on side ${side} with no legal actions`);
    }
    if (myLegal.length === 1) return myLegal[0];

    const root = makeNode(state);
    for (let i = 0; i < this.iterations; i++) {
      this.iterate(root);
    }

    const keys = side === 0 ? root.keys0 : root.keys1;
    const legal = side === 0 ? root.legal0 : root.legal1;
    const stats = side === 0 ? root.stats0 : root.stats1;
    const visits = keys.map(k => stats.get(k)!.visits);

    if (this.temperature <= 0) {
      let bestIdx = 0;
      let bestVisits = -1;
      for (let i = 0; i < visits.length; i++) {
        if (visits[i] > bestVisits) { bestVisits = visits[i]; bestIdx = i; }
      }
      return legal[bestIdx];
    }

    const invT = 1 / this.temperature;
    const weights = visits.map(v => Math.pow(Math.max(v, 0), invT));
    let total = 0;
    for (const w of weights) total += w;
    if (!(total > 0)) return legal[0];
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return legal[i];
    }
    return legal[legal.length - 1];
  }

  private iterate(root: MctsNode): void {
    const path: { node: MctsNode; key0: string | null; key1: string | null }[] = [];
    let node = root;
    let state: TeamBattleState = root.state;
    let depth = 0;
    let value: number | null = null;

    while (depth < MAX_ROLLOUT_DEPTH) {
      const winner = battleWinner(state);
      if (winner !== null) {
        value = winner === 0 ? 1 : -1;
        break;
      }
      if (node.keys0.length === 0 && node.keys1.length === 0) break;

      const key0 = pickByUCB(node.stats0, node.keys0, node.visits, true);
      const key1 = pickByUCB(node.stats1, node.keys1, node.visits, false);
      if (key0 === null && key1 === null) break;

      const a0 = key0 !== null ? node.legal0[node.keys0.indexOf(key0)] : null;
      const a1 = key1 !== null ? node.legal1[node.keys1.indexOf(key1)] : null;
      // Re-sample the transition on every iteration. Major chance forks
      // (fainting triggering a replace phase) are kept as separate children
      // by including the resulting phase in the child key.
      const { next } = applyActions(state, a0, a1);

      path.push({ node, key0, key1 });
      const childKey = `${key0 ?? '-'}|${key1 ?? '-'}|${outcomeSignature(next)}`;
      let child = node.children.get(childKey);
      if (!child) {
        child = { node: makeNode(next) };
        node.children.set(childKey, child);
        node = child.node;
        state = next;
        break; // expand-then-evaluate
      }

      node = child.node;
      state = next;
      depth++;
    }

    if (value === null) {
      const winner = battleWinner(state);
      value = winner !== null
        ? (winner === 0 ? 1 : -1)
        : this.evaluator.evaluate(state, 0).value;
    }

    node.visits++;
    for (let i = path.length - 1; i >= 0; i--) {
      const { node: n, key0, key1 } = path[i];
      n.visits++;
      if (key0 !== null) {
        const s = n.stats0.get(key0)!;
        s.visits++; s.totalValue += value;
      }
      if (key1 !== null) {
        const s = n.stats1.get(key1)!;
        s.visits++; s.totalValue += value;
      }
    }
  }
}

export const mctsTeamAI: TeamAIStrategy = new MctsTeamAI();
