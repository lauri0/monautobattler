import type {
  BattlePokemon,
  FieldState,
  SideFieldState,
  Team,
  TeamBattleState,
  TeamSlotIndex,
  TeamTurnEvent,
  TurnEvent,
} from '../models/types';

// ── Shared field helpers ──────────────────────────────────────────────────────

function applyFieldSet(
  field: FieldState,
  event: Extract<TurnEvent, { kind: 'field_set' }>,
): FieldState {
  const { effect, side, turns } = event;
  if (effect === 'trickRoom') return { ...field, trickRoomTurns: turns };
  if (side === undefined) return field;
  const sides: [SideFieldState, SideFieldState] = [{ ...field.sides[0] }, { ...field.sides[1] }];
  const s = sides[side];
  if (effect === 'tailwind') s.tailwindTurns = turns;
  else if (effect === 'lightScreen') s.lightScreenTurns = turns;
  else if (effect === 'reflect') s.reflectTurns = turns;
  else if (effect === 'stealthRock') s.stealthRock = true;
  else if (effect === 'spikes') s.spikes = turns; // turns encodes the new layer count
  else if (effect === 'toxicSpikes') s.toxicSpikes = true;
  return { ...field, sides };
}

function applyFieldExpired(
  field: FieldState,
  event: Extract<TurnEvent, { kind: 'field_expired' }>,
): FieldState {
  const { effect, side } = event;
  if (effect === 'trickRoom') return { ...field, trickRoomTurns: 0 };
  if (side === undefined) return field;
  const sides: [SideFieldState, SideFieldState] = [{ ...field.sides[0] }, { ...field.sides[1] }];
  const s = sides[side];
  if (effect === 'tailwind') s.tailwindTurns = 0;
  else if (effect === 'lightScreen') s.lightScreenTurns = 0;
  else if (effect === 'reflect') s.reflectTurns = 0;
  return { ...field, sides };
}

// ── 1v1 ──────────────────────────────────────────────────────────────────────

function patchByName(
  p1: BattlePokemon,
  p2: BattlePokemon,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): { p1: BattlePokemon; p2: BattlePokemon } {
  return {
    p1: p1.data.name === name ? patch(p1) : p1,
    p2: p2.data.name === name ? patch(p2) : p2,
  };
}

function hpPatch(hpAfter: number): (p: BattlePokemon) => BattlePokemon {
  return p => ({ ...p, currentHp: hpAfter });
}

/**
 * Applies one TurnEvent to the displayed 1v1 battle state.
 * Pure — never mutates its inputs.
 */
export function applyEventToState(
  p1: BattlePokemon,
  p2: BattlePokemon,
  field: FieldState,
  event: TurnEvent,
): { p1: BattlePokemon; p2: BattlePokemon; field: FieldState } {
  switch (event.kind) {
    case 'attack': {
      const a = patchByName(p1, p2, event.attackerName, hpPatch(event.attackerHpAfter));
      const d = patchByName(a.p1, a.p2, event.defenderName, hpPatch(event.defenderHpAfter));
      return { ...d, field };
    }
    case 'recoil':
    case 'drain':
    case 'heal':
    case 'status_damage':
    case 'confusion_hit':
    case 'stealth_rock_damage':
    case 'spikes_damage':
    case 'weather_damage':
    case 'terrain_heal':
      return { ...patchByName(p1, p2, event.pokemonName, hpPatch(event.hpAfter)), field };
    case 'stat_change': {
      const patch = patchByName(p1, p2, event.pokemonName, p => ({
        ...p, statStages: { ...p.statStages, [event.stat]: event.newStage },
      }));
      return { ...patch, field };
    }
    case 'status_applied':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, statusCondition: event.condition })), field };
    case 'status_cured':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, statusCondition: undefined })), field };
    case 'confused':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, confused: true })), field };
    case 'confusion_end':
      return { ...patchByName(p1, p2, event.pokemonName, p => ({ ...p, confused: false })), field };
    case 'weather_set':
      return { p1, p2, field: { ...field, weather: event.weather, weatherTurns: event.turns } };
    case 'weather_expired':
      return { p1, p2, field: { ...field, weather: undefined, weatherTurns: 0 } };
    case 'terrain_set':
      return { p1, p2, field: { ...field, terrain: event.terrain, terrainTurns: event.turns } };
    case 'terrain_expired':
      return { p1, p2, field: { ...field, terrain: undefined, terrainTurns: 0 } };
    case 'field_set':
      return { p1, p2, field: applyFieldSet(field, event) };
    case 'field_expired':
      return { p1, p2, field: applyFieldExpired(field, event) };
    default:
      return { p1, p2, field };
  }
}

// ── 4v4 ──────────────────────────────────────────────────────────────────────

function patchPokemonInTeam(
  team: Team,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): Team {
  return { ...team, pokemon: team.pokemon.map(p => p.data.name === name ? patch(p) : p) };
}

function patchAllTeams(
  state: TeamBattleState,
  name: string,
  patch: (p: BattlePokemon) => BattlePokemon,
): TeamBattleState {
  return {
    ...state,
    teams: [patchPokemonInTeam(state.teams[0], name, patch), patchPokemonInTeam(state.teams[1], name, patch)],
  };
}

function applyTurnEventToTeamState(state: TeamBattleState, event: TurnEvent): TeamBattleState {
  switch (event.kind) {
    case 'attack': {
      const s = patchAllTeams(state, event.attackerName, hpPatch(event.attackerHpAfter));
      return patchAllTeams(s, event.defenderName, hpPatch(event.defenderHpAfter));
    }
    case 'recoil':
    case 'drain':
    case 'heal':
    case 'status_damage':
    case 'confusion_hit':
    case 'stealth_rock_damage':
    case 'spikes_damage':
    case 'weather_damage':
    case 'terrain_heal':
      return patchAllTeams(state, event.pokemonName, hpPatch(event.hpAfter));
    case 'stat_change':
      return patchAllTeams(state, event.pokemonName, p => ({
        ...p, statStages: { ...p.statStages, [event.stat]: event.newStage },
      }));
    case 'status_applied':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, statusCondition: event.condition }));
    case 'status_cured':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, statusCondition: undefined }));
    case 'confused':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, confused: true }));
    case 'confusion_end':
      return patchAllTeams(state, event.pokemonName, p => ({ ...p, confused: false }));
    case 'weather_set':
      return { ...state, field: { ...state.field, weather: event.weather, weatherTurns: event.turns } };
    case 'weather_expired':
      return { ...state, field: { ...state.field, weather: undefined, weatherTurns: 0 } };
    case 'terrain_set':
      return { ...state, field: { ...state.field, terrain: event.terrain, terrainTurns: event.turns } };
    case 'terrain_expired':
      return { ...state, field: { ...state.field, terrain: undefined, terrainTurns: 0 } };
    case 'field_set':
      return { ...state, field: applyFieldSet(state.field, event) };
    case 'field_expired':
      return { ...state, field: applyFieldExpired(state.field, event) };
    default:
      return state;
  }
}

/**
 * Applies one TeamTurnEvent to the displayed 4v4 battle state.
 * Pure — never mutates its inputs.
 */
export function applyTeamEventToState(
  state: TeamBattleState,
  event: TeamTurnEvent,
): TeamBattleState {
  if (event.kind === 'switch') {
    const teams: [Team, Team] = [{ ...state.teams[0] }, { ...state.teams[1] }];
    const team = teams[event.side];
    const newIdx = team.pokemon.findIndex(p => p.data.name === event.inName);
    if (newIdx !== -1) teams[event.side] = { ...team, activeIdx: newIdx as TeamSlotIndex };
    return { ...state, teams };
  }
  return applyTurnEventToTeamState(state, event as TurnEvent);
}
