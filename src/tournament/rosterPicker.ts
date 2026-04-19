import type { PokemonData, TeamAIStrategy } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { MctsTeamAI } from '../ai/mctsTeamAI';
import { runFullTeamBattle, buildTeamBattleState } from '../battle/teamBattleEngine';

/**
 * Decide which 3 of a team's 4 Pokemon to bring against a specific opponent roster.
 * Returns 3 indices into the own team's roster [0..3].
 *
 * Pipeline:
 *   1. Score each of own 4 Pokemon by (offensive coverage vs opp 4) − (defensive
 *      exposure vs opp 4) + small BST tiebreaker.
 *   2. Baseline = top-3 by score.
 *   3. Try up to 2 alternative triples (swap the 3rd pick with the 4th, swap 2nd
 *      with 4th). For each, simulate the match vs a plausible opponent triple
 *      using a low-iter MCTS a couple of times, pick the triple with the best
 *      simulated win rate — else keep baseline.
 */

// ── Scoring ──────────────────────────────────────────────────────────────────

function resolvedMoves(p: PokemonData): PokemonData['availableMoves'] {
  // For scoring we don't need the full battle-pokemon shape; we use the same
  // moves the Pokemon will actually carry, selected by buildBattlePokemon.
  // This is the single source of truth for "which moves does this pokemon use".
  const bp = buildBattlePokemon(p);
  return bp.moves;
}

function offensiveScore(own: PokemonData, opps: PokemonData[]): number {
  const moves = resolvedMoves(own);
  if (moves.length === 0) return 0;
  let total = 0;
  for (const opp of opps) {
    // Max effectiveness of any of own's offensive moves against this opp.
    let best = 0;
    for (const m of moves) {
      if (m.power <= 0) continue;
      const eff = getTypeEffectiveness(m.type, opp.types, m.effect?.superEffectiveAgainst);
      // Weight slightly by move power so a 90-power STAB beats a 40-power tech.
      const weighted = eff * Math.min(1.5, m.power / 80);
      if (weighted > best) best = weighted;
    }
    total += best;
  }
  return total / Math.max(1, opps.length);
}

function defensiveScore(own: PokemonData, opps: PokemonData[]): number {
  // Sum of how badly each opponent's best STAB+coverage hits own Pokemon.
  let total = 0;
  for (const opp of opps) {
    const oppMoves = resolvedMoves(opp);
    let worst = 0;
    // STAB types are assumed to be used.
    for (const t of opp.types) {
      const eff = getTypeEffectiveness(t, own.types);
      if (eff > worst) worst = eff;
    }
    for (const m of oppMoves) {
      if (m.power <= 0) continue;
      const eff = getTypeEffectiveness(m.type, own.types, m.effect?.superEffectiveAgainst);
      if (eff > worst) worst = eff;
    }
    total += worst;
  }
  return total / Math.max(1, opps.length);
}

function bst(p: PokemonData): number {
  const b = p.baseStats;
  return b.hp + b.attack + b.defense + b.specialAttack + b.specialDefense + b.speed;
}

export interface PokemonScore {
  index: number;
  composite: number;
  offensive: number;
  defensive: number;
}

export function scoreOwnPokemon(own: PokemonData[], opps: PokemonData[]): PokemonScore[] {
  return own.map((p, index) => {
    const offensive = offensiveScore(p, opps);
    const defensive = defensiveScore(p, opps);
    // Composite: offensive advantage minus defensive exposure, small BST tiebreak.
    const composite = offensive - defensive + bst(p) * 0.0005;
    return { index, composite, offensive, defensive };
  });
}

// ── Candidate generation ─────────────────────────────────────────────────────

function topThree(scores: PokemonScore[]): [number, number, number] {
  const sorted = [...scores].sort((x, y) => y.composite - x.composite);
  return [sorted[0].index, sorted[1].index, sorted[2].index];
}

function altSwapThirdFourth(scores: PokemonScore[]): [number, number, number] | null {
  const sorted = [...scores].sort((x, y) => y.composite - x.composite);
  if (sorted.length < 4) return null;
  return [sorted[0].index, sorted[1].index, sorted[3].index];
}

function altSwapSecondFourth(scores: PokemonScore[]): [number, number, number] | null {
  const sorted = [...scores].sort((x, y) => y.composite - x.composite);
  if (sorted.length < 4) return null;
  return [sorted[0].index, sorted[3].index, sorted[2].index];
}

// ── Optional MCTS validation ─────────────────────────────────────────────────

const VALIDATION_MCTS_ITERATIONS = 150;
const VALIDATION_TRIALS = 2;

function simulateWinRate(
  ownIds: [number, number, number],
  oppIds: [number, number, number],
  allPokemon: PokemonData[],
  ai: TeamAIStrategy,
): number {
  let wins = 0;
  for (let t = 0; t < VALIDATION_TRIALS; t++) {
    const initial = buildTeamBattleState(ownIds, oppIds, allPokemon);
    const result = runFullTeamBattle(initial, ai, ai);
    if (result.winner === 0) wins++;
  }
  return wins / VALIDATION_TRIALS;
}

// ── Entry point ──────────────────────────────────────────────────────────────

export interface PickRosterOptions {
  validateWithMcts?: boolean;
  allPokemon?: PokemonData[]; // required if validateWithMcts = true
}

export function pickRoster(
  ownRoster: PokemonData[],
  oppRoster: PokemonData[],
  options: PickRosterOptions = {},
): [number, number, number] {
  if (ownRoster.length !== 4) {
    throw new Error(`pickRoster: ownRoster must have 4 pokemon, got ${ownRoster.length}`);
  }

  const scores = scoreOwnPokemon(ownRoster, oppRoster);
  const baseline = topThree(scores);

  if (!options.validateWithMcts || !options.allPokemon) return baseline;

  // Generate opponent's likely pick via the same heuristic (no recursion — we just
  // symmetrically score opp's roster against ours).
  const oppScores = scoreOwnPokemon(oppRoster, ownRoster);
  const oppPickIdx = topThree(oppScores);
  const oppIds: [number, number, number] = [
    oppRoster[oppPickIdx[0]].id,
    oppRoster[oppPickIdx[1]].id,
    oppRoster[oppPickIdx[2]].id,
  ];

  const candidates: [number, number, number][] = [baseline];
  const a1 = altSwapThirdFourth(scores);
  const a2 = altSwapSecondFourth(scores);
  if (a1) candidates.push(a1);
  if (a2) candidates.push(a2);

  const ai: TeamAIStrategy = new MctsTeamAI(VALIDATION_MCTS_ITERATIONS);
  let best = baseline;
  let bestRate = -1;
  for (const cand of candidates) {
    const ownIds: [number, number, number] = [
      ownRoster[cand[0]].id,
      ownRoster[cand[1]].id,
      ownRoster[cand[2]].id,
    ];
    const rate = simulateWinRate(ownIds, oppIds, options.allPokemon, ai);
    if (rate > bestRate) { bestRate = rate; best = cand; }
  }
  return best;
}
