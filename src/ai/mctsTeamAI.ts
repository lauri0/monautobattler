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
const DEFAULT_ITERATIONS = 2000;

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
  let bestKey = keys[0];
  let bestVal = -Infinity;
  const logP = Math.log(parentVisits + 1);
  for (const k of keys) {
    const s = stats.get(k)!;
    let val: number;
    if (s.visits === 0) {
      val = Infinity;
    } else {
      const mean = s.totalValue / s.visits;
      val = (maximize ? mean : -mean) + C_UCB * Math.sqrt(logP / s.visits);
    }
    if (val > bestVal) { bestVal = val; bestKey = k; }
  }
  return bestKey;
}

export class MctsTeamAI implements TeamAIStrategy {
  constructor(
    private iterations: number = DEFAULT_ITERATIONS,
    private evaluator: TeamEvaluator = heuristicTeamEvaluator,
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
    let bestIdx = 0;
    let bestVisits = -1;
    for (let i = 0; i < keys.length; i++) {
      const v = stats.get(keys[i])!.visits;
      if (v > bestVisits) { bestVisits = v; bestIdx = i; }
    }
    return legal[bestIdx];
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
      const childKey = `${key0 ?? '-'}|${key1 ?? '-'}|${next.phase}`;
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
