import type { AbilityId, BattlePokemon, FieldState, Move, StatStageName, TurnEvent, StatStages, WeatherKind } from '../models/types';

// Registry of abilities whose effects are wired into the battle engine. Any
// ability name not present here displays as "(Unimplemented)" in the UI and
// has no in-battle effect.

export const WEATHER_TURNS = 5;

export interface AbilityEffect {
  // Applied when the bearer switches in (including the start of a battle).
  // Returns the updated opponent and field. May push events.
  onSwitchIn?: (
    self: BattlePokemon,
    opponent: BattlePokemon,
    field: FieldState,
    turn: number,
    events: TurnEvent[],
  ) => { opponent: BattlePokemon; field: FieldState };
  // Multiplier applied to the bearer's outgoing damage.
  damageMultiplier?: (self: BattlePokemon, move: Move) => number;
  // When true, variable-hit moves (hitsVariable) always hit their maximum (5).
  maxVariableHits?: boolean;
}

function clampStage(v: number): number {
  return Math.max(-6, Math.min(6, v));
}

function applyStatChange(
  p: BattlePokemon,
  stat: StatStageName,
  change: number,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  const oldStage = p.statStages[stat];
  const newStage = clampStage(oldStage + change);
  if (newStage === oldStage) return p;
  events.push({ kind: 'stat_change', turn, pokemonName: p.data.name, stat, change: newStage - oldStage, newStage });
  return { ...p, statStages: { ...p.statStages, [stat]: newStage } as StatStages };
}

function setWeather(
  weather: WeatherKind,
  self: BattlePokemon,
  opponent: BattlePokemon,
  field: FieldState,
  turn: number,
  events: TurnEvent[],
): { opponent: BattlePokemon; field: FieldState } {
  if (field.weather === weather) return { opponent, field };
  events.push({ kind: 'weather_set', turn, weather, turns: WEATHER_TURNS, pokemonName: self.data.name });
  return { opponent, field: { ...field, weather, weatherTurns: WEATHER_TURNS } };
}

export const IMPLEMENTED_ABILITIES: Record<string, AbilityEffect> = {
  'intimidate': {
    onSwitchIn: (_self, opponent, field, turn, events) => {
      if (opponent.currentHp <= 0) return { opponent, field };
      return { opponent: applyStatChange(opponent, 'attack', -1, turn, events), field };
    },
  },
  'overgrow': {
    damageMultiplier: (self, move) => {
      if (move.type !== 'grass') return 1;
      if (self.currentHp * 3 < self.level50Stats.hp) return 1.5;
      return 1;
    },
  },
  'drought':       { onSwitchIn: (self, opp, field, turn, ev) => setWeather('sun',       self, opp, field, turn, ev) },
  'drizzle':       { onSwitchIn: (self, opp, field, turn, ev) => setWeather('rain',      self, opp, field, turn, ev) },
  'sand-stream':   { onSwitchIn: (self, opp, field, turn, ev) => setWeather('sandstorm', self, opp, field, turn, ev) },
  'snow-warning':  { onSwitchIn: (self, opp, field, turn, ev) => setWeather('snow',      self, opp, field, turn, ev) },
  'skill-link':    { maxVariableHits: true },
};

export function isAbilityImplemented(name: AbilityId | undefined): boolean {
  if (!name) return false;
  return name in IMPLEMENTED_ABILITIES;
}

export function abilityMaxVariableHits(attacker: BattlePokemon): boolean {
  const entry = attacker.ability ? IMPLEMENTED_ABILITIES[attacker.ability] : undefined;
  return entry?.maxVariableHits ?? false;
}

export function getAbilityDamageMultiplier(attacker: BattlePokemon, move: Move): number {
  const ability = attacker.ability;
  if (!ability) return 1;
  const entry = IMPLEMENTED_ABILITIES[ability];
  return entry?.damageMultiplier?.(attacker, move) ?? 1;
}

// Applies the incoming pokemon's switch-in ability against the opponent and
// field. Returns the (possibly updated) opponent and field. Emits an
// `ability_triggered` event when the ability actually produced any events.
export function applySwitchInAbility(
  incoming: BattlePokemon,
  opponent: BattlePokemon,
  field: FieldState,
  turn: number,
  events: TurnEvent[],
): { opponent: BattlePokemon; field: FieldState } {
  const ability = incoming.ability;
  if (!ability) return { opponent, field };
  const entry = IMPLEMENTED_ABILITIES[ability];
  if (!entry?.onSwitchIn) return { opponent, field };
  const marker: TurnEvent[] = [];
  const result = entry.onSwitchIn(incoming, opponent, field, turn, marker);
  if (marker.length > 0) {
    events.push({ kind: 'ability_triggered', turn, pokemonName: incoming.data.name, ability });
    for (const ev of marker) events.push(ev);
  }
  return result;
}
