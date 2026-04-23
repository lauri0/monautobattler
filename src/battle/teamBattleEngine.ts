import type {
  BattlePokemon,
  FieldState,
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
  TurnEvent,
  SideIndex,
  StatStages,
} from '../models/types';
import { buildBattlePokemon } from './buildBattlePokemon';
import { applyEndOfTurnStatus, applyEndOfTurnTerrain, applyEndOfTurnWeather, applySpikesOnEntry, applyStealthRockOnEntry, applyToxicSpikesOnEntry, effectivePriority, makeInitialField, resolveSingleAttack, tickTaunt, usableMoves } from './battleEngine';
import { effectiveSpeed } from './damageCalc';
import { applySwitchInAbility, applySwitchOutAbility } from './abilities';

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
  const teams: [Team, Team] = [mkTeam(team0Ids), mkTeam(team1Ids)];
  return { teams, turn: 1, phase: 'choose', field: makeInitialField() };
}

// Apply switch-in abilities for both initial actives. Callers should invoke
// this once, right after building the state, to seed the battle log. Separated
// from buildTeamBattleState so the function stays a pure constructor.
export function applyInitialSwitchInsTeam(
  state: TeamBattleState,
): { state: TeamBattleState; events: TeamTurnEvent[] } {
  const events: TeamTurnEvent[] = [];
  const teams: [Team, Team] = [state.teams[0], state.teams[1]];
  let field = state.field;
  field = applySwitchInInTeam(teams, 0, field, state.turn, events);
  field = applySwitchInInTeam(teams, 1, field, state.turn, events);
  return { state: { ...state, teams, field }, events };
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

function mustPivot(state: TeamBattleState, side: SideIndex): boolean {
  return (state.phase === 'pivot0' && side === 0) || (state.phase === 'pivot1' && side === 1);
}

export function sideNeedsAction(state: TeamBattleState, side: SideIndex): boolean {
  return state.phase === 'choose' || mustReplace(state, side) || mustPivot(state, side);
}

export function legalActions(state: TeamBattleState, side: SideIndex): TeamAction[] {
  const team = state.teams[side];
  const bench = aliveBenchSlots(team);

  if (mustReplace(state, side) || mustPivot(state, side)) {
    return bench.map(idx => ({ kind: 'switch', targetIdx: idx }));
  }

  // In a replace/pivot phase where this side is NOT the one acting: no action.
  if (state.phase !== 'choose') return [];

  const active = team.pokemon[team.activeIdx];
  const moveActions: TeamAction[] = usableMoves(active, state.turn).map(m => ({ kind: 'move', move: m }));
  // Locked into a forced move (Outrage/Petal Dance/Thrash): no switching.
  if (active.lockedMove) return moveActions;
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
    lockedMove: undefined,
    protectedThisTurn: false,
    lastMoveProtected: false,
    sleepTurnsUsed: p.statusCondition === 'sleep' ? 0 : undefined,
    frozenTurnsUsed: p.statusCondition === 'freeze' ? 0 : undefined,
  };
}

function setActive(team: Team, newIdx: TeamSlotIndex, updatedOut: BattlePokemon): Team {
  const pokemon = team.pokemon.slice();
  pokemon[team.activeIdx] = updatedOut;
  pokemon[newIdx] = { ...pokemon[newIdx], justSwitchedIn: true };
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
// Tag TurnEvents produced by a single attack with side attributions by matching
// pokemon names against the known attacker. Same-species collisions are
// pre-existing ambiguity and degrade gracefully (attacker wins the tie).
function tagAttackEvents(
  inner: TurnEvent[],
  attackerName: string,
  attackerSide: SideIndex,
  defenderSide: SideIndex,
  out: TeamTurnEvent[],
): void {
  for (const ev of inner) {
    const evName = 'attackerName' in ev ? ev.attackerName : 'pokemonName' in ev ? ev.pokemonName : '';
    const side: SideIndex = evName === attackerName ? attackerSide : defenderSide;
    out.push({ side, ...ev });
  }
}

function tagTickEvents(
  inner: TurnEvent[],
  side0Name: string,
  out: TeamTurnEvent[],
): void {
  for (const ev of inner) {
    const evName = 'pokemonName' in ev ? ev.pokemonName : '';
    const side: SideIndex = evName === side0Name ? 0 : 1;
    out.push({ side, ...ev });
  }
}

// Apply end-of-turn burn/poison ticks to both actives, then compute the next
// phase (replace*/choose). Advances the turn counter. Used whenever a turn is
// fully resolved — either straight out of 'choose' phase, or after a pivot
// sequence finishes.
function completeTurn(
  teams: [Team, Team],
  turn: number,
  field: FieldState,
  events: TeamTurnEvent[],
): { next: TeamBattleState; events: TeamTurnEvent[] } {
  const inner: TurnEvent[] = [];
  const a0 = teams[0].pokemon[teams[0].activeIdx];
  const a1 = teams[1].pokemon[teams[1].activeIdx];
  let a0Ticked = applyEndOfTurnStatus(a0, turn, inner);
  let a1Ticked = applyEndOfTurnStatus(a1, turn, inner);
  a0Ticked = applyEndOfTurnWeather(a0Ticked, field, turn, inner);
  a1Ticked = applyEndOfTurnWeather(a1Ticked, field, turn, inner);
  a0Ticked = applyEndOfTurnTerrain(a0Ticked, field, turn, inner);
  a1Ticked = applyEndOfTurnTerrain(a1Ticked, field, turn, inner);
  a0Ticked = tickTaunt(a0Ticked, turn, inner);
  a1Ticked = tickTaunt(a1Ticked, turn, inner);
  if (a0Ticked.protectedThisTurn) a0Ticked = { ...a0Ticked, protectedThisTurn: false };
  if (a1Ticked.protectedThisTurn) a1Ticked = { ...a1Ticked, protectedThisTurn: false };
  if (a0Ticked.justSwitchedIn) a0Ticked = { ...a0Ticked, justSwitchedIn: false };
  if (a1Ticked.justSwitchedIn) a1Ticked = { ...a1Ticked, justSwitchedIn: false };
  teams[0] = writeActive(teams[0], a0Ticked);
  teams[1] = writeActive(teams[1], a1Ticked);
  tagTickEvents(inner, a0.data.name, events);
  const nextField = tickFieldInTeam(field, turn, a0.data.name, events);
  const phase = computePhaseAfterAttack(teams);
  return { next: { teams, turn: turn + 1, phase, field: nextField }, events };
}

// Mirror of battleEngine.tickField, but emits TeamTurnEvents (with `side`).
function tickFieldInTeam(
  field: FieldState,
  turn: number,
  _side0Name: string,
  out: TeamTurnEvent[],
): FieldState {
  const next: FieldState = {
    trickRoomTurns: field.trickRoomTurns,
    weather: field.weather,
    weatherTurns: field.weatherTurns,
    terrain: field.terrain,
    terrainTurns: field.terrainTurns,
    sides: [{ ...field.sides[0] }, { ...field.sides[1] }],
  };
  if (next.trickRoomTurns > 0) {
    next.trickRoomTurns--;
    if (next.trickRoomTurns === 0) {
      out.push({ side: 0, kind: 'field_expired', turn, effect: 'trickRoom' });
    }
  }
  if (next.weatherTurns > 0 && next.weather) {
    next.weatherTurns--;
    if (next.weatherTurns === 0) {
      out.push({ side: 0, kind: 'weather_expired', turn, weather: next.weather });
      next.weather = undefined;
    }
  }
  if (next.terrainTurns > 0 && next.terrain) {
    next.terrainTurns--;
    if (next.terrainTurns === 0) {
      out.push({ side: 0, kind: 'terrain_expired', turn, terrain: next.terrain });
      next.terrain = undefined;
    }
  }
  for (const s of [0, 1] as SideIndex[]) {
    const side = next.sides[s];
    if (side.tailwindTurns > 0) {
      side.tailwindTurns--;
      if (side.tailwindTurns === 0) out.push({ side: s, kind: 'field_expired', turn, effect: 'tailwind', side: s });
    }
    if (side.lightScreenTurns > 0) {
      side.lightScreenTurns--;
      if (side.lightScreenTurns === 0) out.push({ side: s, kind: 'field_expired', turn, effect: 'lightScreen', side: s });
    }
    if (side.reflectTurns > 0) {
      side.reflectTurns--;
      if (side.reflectTurns === 0) out.push({ side: s, kind: 'field_expired', turn, effect: 'reflect', side: s });
    }
  }
  return next;
}

// Apply the incoming pokemon's switch-in ability (e.g. Intimidate) against the
// opposing active. Emits tagged team events.
function applySwitchInInTeam(
  teams: [Team, Team],
  incomingSide: SideIndex,
  field: FieldState,
  turn: number,
  events: TeamTurnEvent[],
): FieldState {
  const opponentSide: SideIndex = incomingSide === 0 ? 1 : 0;
  const incoming = teams[incomingSide].pokemon[teams[incomingSide].activeIdx];
  const opponent = teams[opponentSide].pokemon[teams[opponentSide].activeIdx];
  if (incoming.currentHp <= 0 || opponent.currentHp <= 0) return field;
  const inner: TurnEvent[] = [];
  const result = applySwitchInAbility(incoming, opponent, field, turn, inner);
  if (inner.length === 0) return field;
  if (result.opponent !== opponent) {
    teams[opponentSide] = writeActive(teams[opponentSide], result.opponent);
  }
  // Events emitted by a switch-in ability describe the incoming pokemon's
  // effect on the opposing side (stat drops, weather changes broadcast by the
  // active). Tag with the opponent side for wording consistency with the
  // existing Intimidate event flow.
  for (const ev of inner) {
    events.push({ side: opponentSide, ...ev });
  }
  return result.field;
}

// Apply all entry hazards to the active pokemon on `side`. Order: Stealth Rock
// → Spikes → Toxic Spikes. Short-circuits when the pokemon faints so a KO'd
// pokemon doesn't also get poisoned by toxic spikes. Returns the possibly
// updated field (Toxic Spikes absorption by a grounded Poison-type clears the
// hazard).
function applyHazardsToActive(
  teams: [Team, Team],
  side: SideIndex,
  field: FieldState,
  turn: number,
  events: TeamTurnEvent[],
): FieldState {
  const hasAny = field.sides[side].stealthRock || field.sides[side].spikes > 0 || field.sides[side].toxicSpikes;
  if (!hasAny) return field;
  let active = teams[side].pokemon[teams[side].activeIdx];

  const srInner: TurnEvent[] = [];
  const afterSr = applyStealthRockOnEntry(active, field, side, turn, srInner);
  if (afterSr !== active) {
    active = afterSr;
    teams[side] = writeActive(teams[side], active);
    for (const ev of srInner) events.push({ side, ...ev });
  }
  if (active.currentHp <= 0) return field;

  const spInner: TurnEvent[] = [];
  const afterSp = applySpikesOnEntry(active, field, side, turn, spInner);
  if (afterSp !== active) {
    active = afterSp;
    teams[side] = writeActive(teams[side], active);
    for (const ev of spInner) events.push({ side, ...ev });
  }
  if (active.currentHp <= 0) return field;

  const txInner: TurnEvent[] = [];
  const res = applyToxicSpikesOnEntry(active, field, side, turn, txInner);
  if (res.pokemon !== active || res.field !== field) {
    if (res.pokemon !== active) teams[side] = writeActive(teams[side], res.pokemon);
    for (const ev of txInner) events.push({ side, ...ev });
    return res.field;
  }
  return field;
}

// Resolve a single attack against the current active on `defenderSide`. Writes
// the updated pokemon back into teams. Returns the SingleAttackResult so the
// caller can inspect flinch / pivot / damage flags.
function runOneAttack(
  teams: [Team, Team],
  attackerSide: SideIndex,
  move: Move,
  turn: number,
  field: FieldState,
  ctx: { preFlinched: boolean; foeHitUserThisTurn: boolean; defenderMove?: Move | null },
  events: TeamTurnEvent[],
): { dealtDamage: boolean; defenderFlinched: boolean; pivotTriggered: boolean; field: FieldState } {
  const defenderSide: SideIndex = attackerSide === 0 ? 1 : 0;
  const attacker = teams[attackerSide].pokemon[teams[attackerSide].activeIdx];
  const defender = teams[defenderSide].pokemon[teams[defenderSide].activeIdx];
  const inner: TurnEvent[] = [];
  const r = resolveSingleAttack(attacker, defender, move, turn, { ...ctx, field, attackerSide }, inner);
  teams[attackerSide] = writeActive(teams[attackerSide], r.attacker);
  teams[defenderSide] = writeActive(teams[defenderSide], r.defender);
  tagAttackEvents(inner, attacker.data.name, attackerSide, defenderSide, events);
  return {
    dealtDamage: r.dealtDamage,
    defenderFlinched: r.defenderFlinched,
    pivotTriggered: r.pivotTriggered,
    field: r.field,
  };
}

// Figure out which side acts first. Only meaningful when both have a move.
function speedOrder(teams: [Team, Team], m0: Move, m1: Move, field: FieldState): SideIndex {
  const p0 = effectivePriority(m0, teams[0].pokemon[teams[0].activeIdx], field);
  const p1 = effectivePriority(m1, teams[1].pokemon[teams[1].activeIdx], field);
  if (p0 !== p1) return p0 > p1 ? 0 : 1;
  const s0 = effectiveSpeed(teams[0].pokemon[teams[0].activeIdx], field.sides[0].tailwindTurns > 0);
  const s1 = effectiveSpeed(teams[1].pokemon[teams[1].activeIdx], field.sides[1].tailwindTurns > 0);
  if (s0 !== s1) {
    // Trick Room reverses order within the same priority bracket.
    const faster: SideIndex = s0 > s1 ? 0 : 1;
    return field.trickRoomTurns > 0 ? (faster === 0 ? 1 : 0) : faster;
  }
  return Math.random() < 0.5 ? 0 : 1;
}

export function applyActions(
  state: TeamBattleState,
  action0: TeamAction | null,
  action1: TeamAction | null,
): { next: TeamBattleState; events: TeamTurnEvent[] } {
  const events: TeamTurnEvent[] = [];

  let field: FieldState = state.field ?? makeInitialField();

  // ── Pivot phase ───────────────────────────────────────────────────────────
  // The pivoting side picks a replacement; then any pending opponent attack
  // resolves against the new active. Opponent may themselves pivot, chaining.
  if (state.phase === 'pivot0' || state.phase === 'pivot1') {
    const pivotSide: SideIndex = state.phase === 'pivot0' ? 0 : 1;
    const action = pivotSide === 0 ? action0 : action1;
    if (!action || action.kind !== 'switch') {
      throw new Error(`Pivot phase requires a switch action for side ${pivotSide}`);
    }

    let teams = state.teams.slice() as [Team, Team];
    const team = teams[pivotSide];
    const inner: TurnEvent[] = [];
    const outgoing = applySwitchOutAbility(onSwitchOut(team.pokemon[team.activeIdx]), state.turn, inner);
    for (const ev of inner) events.push({ side: pivotSide, ...ev });
    const incoming = team.pokemon[action.targetIdx];
    teams[pivotSide] = setActive(team, action.targetIdx, outgoing);
    events.push({
      kind: 'switch', turn: state.turn, side: pivotSide,
      outName: outgoing.data.name, inName: incoming.data.name,
    });
    field = applyHazardsToActive(teams, pivotSide, field, state.turn, events);
    field = applySwitchInInTeam(teams, pivotSide, field, state.turn, events);

    // If hazards KO'd the incoming pokemon, skip the pending attack and let the
    // normal phase logic surface a replace request.
    const incomingAlive = teams[pivotSide].pokemon[teams[pivotSide].activeIdx].currentHp > 0;

    const pending = state.pendingAttack;
    if (pending && incomingAlive) {
      const pendingAttacker = teams[pending.side].pokemon[teams[pending.side].activeIdx];
      if (pendingAttacker.currentHp > 0) {
        const r = runOneAttack(teams, pending.side, pending.move, state.turn, field, {
          preFlinched: false,
          foeHitUserThisTurn: false,
        }, events);
        field = r.field;
        if (r.pivotTriggered && aliveBenchSlots(teams[pending.side]).length > 0) {
          const nextPhase: TeamBattlePhase = pending.side === 0 ? 'pivot0' : 'pivot1';
          return { next: { teams, turn: state.turn, phase: nextPhase, field }, events };
        }
      }
    }

    return completeTurn(teams, state.turn, field, events);
  }

  // ── Replace phases ────────────────────────────────────────────────────────
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
      const newTeam = setActive(team, action.targetIdx, outgoing);
      teams[side] = newTeam;
      events.push({
        kind: 'switch', turn: state.turn, side,
        outName: outgoing.data.name, inName: incoming.data.name,
      });
      field = applyHazardsToActive(teams, side, field, state.turn, events);
      field = applySwitchInInTeam(teams, side, field, state.turn, events);
    }

    const phase = computePhaseAfterAttack(teams);
    return { next: { teams, turn: state.turn, phase, field }, events };
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
    const switchOutInner: TurnEvent[] = [];
    const outgoing = applySwitchOutAbility(onSwitchOut(team.pokemon[team.activeIdx]), state.turn, switchOutInner);
    for (const ev of switchOutInner) events.push({ side, ...ev });
    const incoming = team.pokemon[action.targetIdx];
    teams[side] = setActive(team, action.targetIdx, outgoing);
    events.push({
      kind: 'switch', turn: state.turn, side,
      outName: outgoing.data.name, inName: incoming.data.name,
    });
    field = applyHazardsToActive(teams, side, field, state.turn, events);
    field = applySwitchInInTeam(teams, side, field, state.turn, events);
  }

  // A pokemon switched in and fainted to SR: surface replacement via phase.
  const anyActiveDown = teams[0].pokemon[teams[0].activeIdx].currentHp <= 0
    || teams[1].pokemon[teams[1].activeIdx].currentHp <= 0;
  if (anyActiveDown) {
    const phase = computePhaseAfterAttack(teams);
    return { next: { teams, turn: state.turn, phase, field }, events };
  }

  const move0: Move | null = action0.kind === 'move' ? action0.move : null;
  const move1: Move | null = action1.kind === 'move' ? action1.move : null;

  if (move0 === null && move1 === null) {
    return completeTurn(teams, state.turn, field, events);
  }

  // Determine attack order. When only one side attacks, that side goes first.
  let firstSide: SideIndex;
  if (move0 && move1) {
    firstSide = speedOrder(teams, move0, move1, field);
  } else {
    firstSide = move0 ? 0 : 1;
  }
  const secondSide: SideIndex = firstSide === 0 ? 1 : 0;
  const firstMove = firstSide === 0 ? move0 : move1;
  const secondMove = secondSide === 0 ? move0 : move1;

  // First attack.
  const r1 = runOneAttack(teams, firstSide, firstMove!, state.turn, field, {
    preFlinched: false,
    foeHitUserThisTurn: false,
    defenderMove: secondMove,
  }, events);
  field = r1.field;

  // If first attacker pivots (U-turn), suspend the turn and wait for them to
  // pick a replacement. The second side's move (if any) is carried as pending.
  if (r1.pivotTriggered && aliveBenchSlots(teams[firstSide]).length > 0) {
    const pendingAttack = secondMove ? { side: secondSide, move: secondMove } : undefined;
    const phase: TeamBattlePhase = firstSide === 0 ? 'pivot0' : 'pivot1';
    return { next: { teams, turn: state.turn, phase, pendingAttack, field }, events };
  }

  // Second attack, if the second attacker still has a move and is alive.
  if (secondMove) {
    const secondAttacker = teams[secondSide].pokemon[teams[secondSide].activeIdx];
    if (secondAttacker.currentHp > 0) {
      const r2 = runOneAttack(teams, secondSide, secondMove, state.turn, field, {
        preFlinched: r1.defenderFlinched,
        foeHitUserThisTurn: r1.dealtDamage,
        defenderMove: firstMove,
      }, events);
      field = r2.field;
      if (r2.pivotTriggered && aliveBenchSlots(teams[secondSide]).length > 0) {
        const phase: TeamBattlePhase = secondSide === 0 ? 'pivot0' : 'pivot1';
        return { next: { teams, turn: state.turn, phase, field }, events };
      }
    }
  }

  return completeTurn(teams, state.turn, field, events);
}

// ── Top-level driver ──────────────────────────────────────────────────────────

export function runFullTeamBattle(
  initial: TeamBattleState,
  ai0: TeamAIStrategy,
  ai1: TeamAIStrategy,
): TeamBattleResult {
  const startup = applyInitialSwitchInsTeam(initial);
  let state = startup.state;
  const log: TeamTurnEvent[] = [...startup.events];
  let guard = 0;

  while (battleWinner(state) === null && guard < MAX_TURNS) {
    const a0 = sideNeedsAction(state, 0) ? ai0.selectAction(state, 0) : null;
    const a1 = sideNeedsAction(state, 1) ? ai1.selectAction(state, 1) : null;
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
