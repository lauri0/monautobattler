import type {
  BattlePokemon,
  Move,
  PokemonData,
  Team,
  TeamAction,
  TeamBattlePhase,
  TeamBattleResult,
  TeamBattleState,
  TeamAIStrategy,
  TeamSlotIndex,
  TeamTurnEvent,
  SideIndex,
  StatStages,
} from '../models/types';
import { buildBattlePokemon } from './buildBattlePokemon';
import { resolveTurnWithMoves, usableMoves } from './battleEngine';

const MAX_TURNS = 500;

const ZERO_STAGES: StatStages = {
  attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0,
};

// ── Construction ──────────────────────────────────────────────────────────────

export function buildTeamBattleState(
  team0Ids: [number, number, number],
  team1Ids: [number, number, number],
  allPokemon: PokemonData[],
): TeamBattleState {
  const byId = new Map(allPokemon.map(p => [p.id, p]));
  const mkTeam = (ids: [number, number, number]): Team => ({
    pokemon: ids.map(id => {
      const data = byId.get(id);
      if (!data) throw new Error(`Pokemon id ${id} not found`);
      return buildBattlePokemon(data);
    }),
    activeIdx: 0,
  });
  return { teams: [mkTeam(team0Ids), mkTeam(team1Ids)], turn: 1, phase: 'choose' };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getActive(state: TeamBattleState, side: SideIndex): BattlePokemon {
  const t = state.teams[side];
  return t.pokemon[t.activeIdx];
}

export function aliveBenchSlots(team: Team): TeamSlotIndex[] {
  const out: TeamSlotIndex[] = [];
  for (let i = 0; i < 3; i++) {
    if (i !== team.activeIdx && team.pokemon[i].currentHp > 0) out.push(i as TeamSlotIndex);
  }
  return out;
}

export function teamAlive(team: Team): boolean {
  return team.pokemon.some(p => p.currentHp > 0);
}

function mustReplace(state: TeamBattleState, side: SideIndex): boolean {
  if (state.phase === 'replaceBoth') return true;
  if (side === 0 && state.phase === 'replace0') return true;
  if (side === 1 && state.phase === 'replace1') return true;
  return false;
}

export function legalActions(state: TeamBattleState, side: SideIndex): TeamAction[] {
  const team = state.teams[side];
  const bench = aliveBenchSlots(team);

  if (mustReplace(state, side)) {
    return bench.map(idx => ({ kind: 'switch', targetIdx: idx }));
  }

  // In a replace phase where this side is NOT the one replacing: no action.
  if (state.phase !== 'choose') return [];

  const active = team.pokemon[team.activeIdx];
  const moveActions: TeamAction[] = usableMoves(active, state.turn).map(m => ({ kind: 'move', move: m }));
  const switchActions: TeamAction[] = bench.map(idx => ({ kind: 'switch', targetIdx: idx }));
  return [...moveActions, ...switchActions];
}

// Reset volatile state on switch-out: stat stages, confusion, sleep/freeze counters.
// Major status condition (burn/poison/paralysis/sleep/freeze) persists.
function onSwitchOut(p: BattlePokemon): BattlePokemon {
  return {
    ...p,
    statStages: { ...ZERO_STAGES },
    confused: false,
    confusionTurnsLeft: undefined,
    sleepTurnsUsed: p.statusCondition === 'sleep' ? 0 : undefined,
    frozenTurnsUsed: p.statusCondition === 'freeze' ? 0 : undefined,
  };
}

function setActive(team: Team, newIdx: TeamSlotIndex, updatedOut: BattlePokemon): Team {
  const pokemon = team.pokemon.slice();
  pokemon[team.activeIdx] = updatedOut;
  return { pokemon, activeIdx: newIdx };
}

function writeActive(team: Team, updated: BattlePokemon): Team {
  const pokemon = team.pokemon.slice();
  pokemon[team.activeIdx] = updated;
  return { pokemon, activeIdx: team.activeIdx };
}

function computePhaseAfterAttack(teams: [Team, Team]): TeamBattlePhase {
  const a0 = teams[0].pokemon[teams[0].activeIdx];
  const a1 = teams[1].pokemon[teams[1].activeIdx];
  const f0 = a0.currentHp <= 0;
  const f1 = a1.currentHp <= 0;
  if (f0 && f1) return 'replaceBoth';
  if (f0) return 'replace0';
  if (f1) return 'replace1';
  return 'choose';
}

export function battleWinner(state: TeamBattleState): SideIndex | null {
  const a0 = teamAlive(state.teams[0]);
  const a1 = teamAlive(state.teams[1]);
  if (a0 && !a1) return 0;
  if (!a0 && a1) return 1;
  return null;
}

// ── Action application ───────────────────────────────────────────────────────

/**
 * Apply the chosen actions for both sides and advance the battle state.
 * Uses RNG internally (via resolveTurnWithMoves). For MCTS deterministic
 * simulation, a parallel deterministic variant will be added alongside.
 *
 * In 'choose' phase, both sides must provide an action. Switches resolve
 * before attacks (so an attacker hits the newly-switched-in Pokemon).
 * In a replace phase, only the side(s) that must replace provide actions
 * (the other side's action is ignored).
 */
export function applyActions(
  state: TeamBattleState,
  action0: TeamAction | null,
  action1: TeamAction | null,
): { next: TeamBattleState; events: TeamTurnEvent[] } {
  const events: TeamTurnEvent[] = [];

  // Replace phases: perform requested switch(es) only, don't advance turn.
  if (state.phase !== 'choose') {
    let teams = state.teams.slice() as [Team, Team];
    const replacers: [SideIndex, TeamAction | null][] =
      state.phase === 'replaceBoth' ? [[0, action0], [1, action1]]
      : state.phase === 'replace0' ? [[0, action0]]
      : [[1, action1]];

    for (const [side, action] of replacers) {
      if (!action || action.kind !== 'switch') {
        throw new Error(`Replace phase requires a switch action for side ${side}`);
      }
      const team = teams[side];
      const outgoing = team.pokemon[team.activeIdx];
      const incoming = team.pokemon[action.targetIdx];
      // Outgoing is fainted; no volatile reset needed, but keep structure consistent.
      const newTeam = setActive(team, action.targetIdx, outgoing);
      teams[side] = newTeam;
      events.push({
        kind: 'switch', turn: state.turn, side,
        outName: outgoing.data.name, inName: incoming.data.name,
      });
    }

    const phase = computePhaseAfterAttack(teams);
    // If a team has no alive Pokemon at all, battle is effectively over; phase stays as-is.
    return { next: { teams, turn: state.turn, phase }, events };
  }

  // ── 'choose' phase ────────────────────────────────────────────────────────
  if (!action0 || !action1) {
    throw new Error('Choose phase requires actions for both sides');
  }

  let teams = state.teams.slice() as [Team, Team];

  // Resolve switches first (both happen before any attacks).
  for (const side of [0, 1] as SideIndex[]) {
    const action = side === 0 ? action0 : action1;
    if (action.kind !== 'switch') continue;
    const team = teams[side];
    const outgoing = onSwitchOut(team.pokemon[team.activeIdx]);
    const incoming = team.pokemon[action.targetIdx];
    teams[side] = setActive(team, action.targetIdx, outgoing);
    events.push({
      kind: 'switch', turn: state.turn, side,
      outName: outgoing.data.name, inName: incoming.data.name,
    });
  }

  // Determine attacking moves (null if that side switched).
  const move0: Move | null = action0.kind === 'move' ? action0.move : null;
  const move1: Move | null = action1.kind === 'move' ? action1.move : null;

  if (move0 !== null || move1 !== null) {
    const active0 = teams[0].pokemon[teams[0].activeIdx];
    const active1 = teams[1].pokemon[teams[1].activeIdx];

    const { events: innerEvents, p1After, p2After } = resolveTurnWithMoves(
      active0, active1, move0, move1, state.turn,
    );
    const name1 = active1.data.name;
    for (const ev of innerEvents) {
      const evName = 'attackerName' in ev ? ev.attackerName : 'pokemonName' in ev ? ev.pokemonName : '';
      const side: SideIndex = evName === name1 ? 1 : 0;
      events.push({ side, ...ev });
    }

    teams[0] = writeActive(teams[0], p1After);
    teams[1] = writeActive(teams[1], p2After);
  }

  const phase = computePhaseAfterAttack(teams);
  return { next: { teams, turn: state.turn + 1, phase }, events };
}

// ── Top-level driver ──────────────────────────────────────────────────────────

export function runFullTeamBattle(
  initial: TeamBattleState,
  ai0: TeamAIStrategy,
  ai1: TeamAIStrategy,
): TeamBattleResult {
  let state = initial;
  const log: TeamTurnEvent[] = [];
  let guard = 0;

  while (battleWinner(state) === null && guard < MAX_TURNS) {
    const a0 = mustReplace(state, 0) || state.phase === 'choose' ? ai0.selectAction(state, 0) : null;
    const a1 = mustReplace(state, 1) || state.phase === 'choose' ? ai1.selectAction(state, 1) : null;
    const { next, events } = applyActions(state, a0, a1);
    log.push(...events);
    state = next;
    guard++;
  }

  const winner = battleWinner(state);
  if (winner === null) {
    // Shouldn't happen under normal play; pick the side with more HP as a tiebreaker.
    const hp0 = state.teams[0].pokemon.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
    const hp1 = state.teams[1].pokemon.reduce((s, p) => s + Math.max(0, p.currentHp), 0);
    return { winner: hp0 >= hp1 ? 0 : 1, finalState: state, log };
  }
  return { winner, finalState: state, log };
}
