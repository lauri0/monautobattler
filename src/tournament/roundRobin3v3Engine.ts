import type { PokemonData } from '../models/types';
import { getPokemonPersisted } from '../persistence/userStorage';

export interface RR3v3Team {
  name: string;
  roster: number[]; // 4 pokemon ids
  isPlayer: boolean;
}

export interface RR3v3Pairing {
  a: number; // team index
  b: number;
}

export interface RR3v3MatchResult {
  winner: 0 | 1; // 0 = team A, 1 = team B
  rosterA: [number, number, number, number]; // pokemon ids brought by team A
  rosterB: [number, number, number, number]; // pokemon ids brought by team B
  pokemonSurvivedA: number; // alive pokemon on team A at match end
  pokemonSurvivedB: number;
}

export type RR3v3Phase = 'draft' | 'overview' | 'match' | 'finished';
export type RR3v3Mode = 'play' | 'spectate';

export interface DraftState {
  reservedForPlayer: number[]; // the 12 ids reserved for player's draft offers
  offered: number[];           // 3 ids currently shown (one draft round)
  picked: number[];            // ids the player has picked so far (0..4)
  round: number;               // 0..3, which round (0 = first pick)
}

export interface RR3v3State {
  teams: RR3v3Team[];
  schedule: RR3v3Pairing[];
  results: (RR3v3MatchResult | null)[];
  currentMatchIdx: number;
  mode: RR3v3Mode;
  phase: RR3v3Phase;
  draft: DraftState | null;
}

export interface RR3v3Standing {
  teamIdx: number;
  played: number;
  wins: number;
  losses: number;
  points: number;
  koDiff: number; // (own survived) - (opp survived) summed across all played matches
}

// ── Constants ────────────────────────────────────────────────────────────────

export const RR_TEAM_COUNT = 10;
export const RR_ROSTER_SIZE = 4;
export const RR_MATCH_SIZE = 4;
export const RR_DRAFT_ROUNDS = 4;
export const RR_DRAFT_OFFER_SIZE = 3;
// Play mode: player is offered RR_DRAFT_OFFER_SIZE * RR_DRAFT_ROUNDS = 12 unique.
// AI teams (9) × 4 = 36. Min enabled = 48.
export const RR_MIN_POOL_PLAY = RR_DRAFT_OFFER_SIZE * RR_DRAFT_ROUNDS + (RR_TEAM_COUNT - 1) * RR_ROSTER_SIZE;
// Spectate mode: 10 × 4 = 40.
export const RR_MIN_POOL_SPECTATE = RR_TEAM_COUNT * RR_ROSTER_SIZE;
export const RR_TOTAL_MATCHES = (RR_TEAM_COUNT * (RR_TEAM_COUNT - 1)) / 2;

// ── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function enabledPoolIds(allPokemon: PokemonData[]): number[] {
  return allPokemon
    .filter(p => {
      const persisted = getPokemonPersisted(p.id);
      return !persisted.disabled && p.availableMoves.length > 0;
    })
    .map(p => p.id);
}

// Round-robin circle method for even n. Produces C(n,2) pairings, n-1 rounds of n/2 each.
// We fix team 0 and rotate the rest. Pairings are emitted round by round so the
// schedule is interleaved (each team plays about once every 5 matches).
export function generateSchedule(n: number): RR3v3Pairing[] {
  if (n % 2 !== 0) throw new Error(`generateSchedule requires even n, got ${n}`);
  const arr: number[] = Array.from({ length: n }, (_, i) => i);
  const rounds: RR3v3Pairing[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: RR3v3Pairing[] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push({ a: arr[i], b: arr[n - 1 - i] });
    }
    rounds.push(pairs);
    // Rotate: keep arr[0] fixed, rotate the rest rightward.
    const last = arr[n - 1];
    for (let i = n - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }
  return rounds.flat();
}

// ── Tournament creation ──────────────────────────────────────────────────────

export function createSpectateTournament(allPokemon: PokemonData[]): RR3v3State {
  const pool = enabledPoolIds(allPokemon);
  if (pool.length < RR_MIN_POOL_SPECTATE) {
    throw new Error(`Need at least ${RR_MIN_POOL_SPECTATE} enabled Pokemon, have ${pool.length}.`);
  }
  const shuffled = shuffle(pool);
  const teams: RR3v3Team[] = [];
  for (let i = 0; i < RR_TEAM_COUNT; i++) {
    const roster = shuffled.slice(i * RR_ROSTER_SIZE, i * RR_ROSTER_SIZE + RR_ROSTER_SIZE);
    teams.push({ name: `AI Team ${i + 1}`, roster, isPlayer: false });
  }
  const schedule = generateSchedule(RR_TEAM_COUNT);
  return {
    teams,
    schedule,
    results: new Array(schedule.length).fill(null),
    currentMatchIdx: 0,
    mode: 'spectate',
    phase: 'overview',
    draft: null,
  };
}

export function createPlayTournament(allPokemon: PokemonData[]): RR3v3State {
  const pool = enabledPoolIds(allPokemon);
  if (pool.length < RR_MIN_POOL_PLAY) {
    throw new Error(`Need at least ${RR_MIN_POOL_PLAY} enabled Pokemon for draft, have ${pool.length}.`);
  }
  const shuffled = shuffle(pool);
  // Reserve first 12 for player draft offers.
  const reserved = shuffled.slice(0, RR_DRAFT_ROUNDS * RR_DRAFT_OFFER_SIZE);
  // Remaining pool for AI teams.
  const aiPool = shuffled.slice(RR_DRAFT_ROUNDS * RR_DRAFT_OFFER_SIZE);

  const aiTeams: RR3v3Team[] = [];
  for (let i = 0; i < RR_TEAM_COUNT - 1; i++) {
    const roster = aiPool.slice(i * RR_ROSTER_SIZE, i * RR_ROSTER_SIZE + RR_ROSTER_SIZE);
    aiTeams.push({ name: `AI Team ${i + 1}`, roster, isPlayer: false });
  }

  // Player team starts empty; roster fills during draft.
  const playerTeam: RR3v3Team = { name: 'Your Team', roster: [], isPlayer: true };

  // Randomize team slot order so player isn't always team 0 (but keep isPlayer marker).
  const allTeams = shuffle([playerTeam, ...aiTeams]);

  const schedule = generateSchedule(RR_TEAM_COUNT);

  // First draft offering = first 3 from reserved.
  const offered = reserved.slice(0, RR_DRAFT_OFFER_SIZE);

  return {
    teams: allTeams,
    schedule,
    results: new Array(schedule.length).fill(null),
    currentMatchIdx: 0,
    mode: 'play',
    phase: 'draft',
    draft: {
      reservedForPlayer: reserved,
      offered,
      picked: [],
      round: 0,
    },
  };
}

// ── Draft progression ────────────────────────────────────────────────────────

export function applyDraftPick(state: RR3v3State, pickedId: number): RR3v3State {
  if (state.phase !== 'draft' || !state.draft) return state;
  if (!state.draft.offered.includes(pickedId)) return state;

  const nextPicked = [...state.draft.picked, pickedId];
  const nextRound = state.draft.round + 1;

  if (nextRound >= RR_DRAFT_ROUNDS) {
    // Draft complete — assign picks to the player team and move to overview.
    const nextTeams = state.teams.map(t =>
      t.isPlayer ? { ...t, roster: nextPicked } : t,
    );
    return {
      ...state,
      teams: nextTeams,
      phase: 'overview',
      draft: null,
    };
  }

  const nextOffered = state.draft.reservedForPlayer.slice(
    nextRound * RR_DRAFT_OFFER_SIZE,
    (nextRound + 1) * RR_DRAFT_OFFER_SIZE,
  );

  return {
    ...state,
    draft: {
      ...state.draft,
      offered: nextOffered,
      picked: nextPicked,
      round: nextRound,
    },
  };
}

// ── Match result application ─────────────────────────────────────────────────

export function applyMatchResult(state: RR3v3State, result: RR3v3MatchResult): RR3v3State {
  if (state.phase !== 'overview' && state.phase !== 'match') return state;
  if (state.currentMatchIdx >= state.schedule.length) return state;

  const results = [...state.results];
  results[state.currentMatchIdx] = result;
  const nextIdx = state.currentMatchIdx + 1;
  const finished = nextIdx >= state.schedule.length;

  return {
    ...state,
    results,
    currentMatchIdx: nextIdx,
    phase: finished ? 'finished' : 'overview',
  };
}

// ── Standings ────────────────────────────────────────────────────────────────

export function computeStandings(state: RR3v3State): RR3v3Standing[] {
  const standings: RR3v3Standing[] = state.teams.map((_, i) => ({
    teamIdx: i,
    played: 0, wins: 0, losses: 0, points: 0, koDiff: 0,
  }));

  state.schedule.forEach((pair, i) => {
    const result = state.results[i];
    if (!result) return;
    const sA = standings[pair.a];
    const sB = standings[pair.b];
    sA.played++; sB.played++;
    const diff = result.pokemonSurvivedA - result.pokemonSurvivedB;
    sA.koDiff += diff;
    sB.koDiff -= diff;
    if (result.winner === 0) {
      sA.wins++; sA.points++; sB.losses++;
    } else {
      sB.wins++; sB.points++; sA.losses++;
    }
  });

  // Head-to-head between two teams (used for tiebreakers).
  const headToHead = (a: number, b: number): number => {
    for (let i = 0; i < state.schedule.length; i++) {
      const pair = state.schedule[i];
      const result = state.results[i];
      if (!result) continue;
      if (pair.a === a && pair.b === b) return result.winner === 0 ? 1 : -1;
      if (pair.a === b && pair.b === a) return result.winner === 0 ? -1 : 1;
    }
    return 0;
  };

  standings.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    const h2h = headToHead(y.teamIdx, x.teamIdx);
    if (h2h !== 0) return h2h;
    if (y.koDiff !== x.koDiff) return y.koDiff - x.koDiff;
    return 0;
  });

  return standings;
}

// Convenience: find the next pairing involving the player (used for fast-forward).
export function findNextPlayerMatchIdx(state: RR3v3State): number | null {
  for (let i = state.currentMatchIdx; i < state.schedule.length; i++) {
    const { a, b } = state.schedule[i];
    if (state.teams[a].isPlayer || state.teams[b].isPlayer) return i;
  }
  return null;
}

export function isPlayerPairing(state: RR3v3State, matchIdx: number): boolean {
  const p = state.schedule[matchIdx];
  if (!p) return false;
  return state.teams[p.a].isPlayer || state.teams[p.b].isPlayer;
}
