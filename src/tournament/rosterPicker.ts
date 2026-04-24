import type { PokemonData, TeamSlotIndex } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';

/**
 * Pick the best starting Pokemon index (0-3) for `ownRoster` against `oppRoster`.
 * All 4 pokemon are always brought in 4v4; only the starting slot needs deciding.
 *
 * Pipeline:
 *   Score each of own 4 Pokemon by (offensive coverage vs opp 4) − (defensive
 *   exposure vs opp 4) + small BST tiebreaker. Return the index of the highest scorer.
 */

// ── Scoring ──────────────────────────────────────────────────────────────────

function resolvedMoves(p: PokemonData): PokemonData['availableMoves'] {
  const bp = buildBattlePokemon(p);
  return bp.moves;
}

function offensiveScore(own: PokemonData, opps: PokemonData[]): number {
  const moves = resolvedMoves(own);
  if (moves.length === 0) return 0;
  let total = 0;
  for (const opp of opps) {
    let best = 0;
    for (const m of moves) {
      if (m.power <= 0) continue;
      const eff = getTypeEffectiveness(m.type, opp.types, m.effect?.superEffectiveAgainst);
      const weighted = eff * Math.min(1.5, m.power / 80);
      if (weighted > best) best = weighted;
    }
    total += best;
  }
  return total / Math.max(1, opps.length);
}

function defensiveScore(own: PokemonData, opps: PokemonData[]): number {
  let total = 0;
  for (const opp of opps) {
    const oppMoves = resolvedMoves(opp);
    let worst = 0;
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
    const composite = offensive - defensive + bst(p) * 0.0005;
    return { index, composite, offensive, defensive };
  });
}

// ── Entry point ──────────────────────────────────────────────────────────────

export function pickStartingIndex(
  ownRoster: PokemonData[],
  oppRoster: PokemonData[],
): TeamSlotIndex {
  if (ownRoster.length !== 4) {
    throw new Error(`pickStartingIndex: ownRoster must have 4 pokemon, got ${ownRoster.length}`);
  }
  const scores = scoreOwnPokemon(ownRoster, oppRoster);
  const best = scores.reduce((a, b) => b.composite > a.composite ? b : a);
  return best.index as TeamSlotIndex;
}
