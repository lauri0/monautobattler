import type { AbilityId, BattlePokemon, FieldState, Move, StatStageName, StatusCondition, TurnEvent, StatStages, WeatherKind, TerrainKind, TypeName } from '../models/types';
import { makesContact } from './contact';

// Registry of abilities whose effects are wired into the battle engine. Any
// ability name not present here displays as "(Unimplemented)" in the UI and
// has no in-battle effect.

export const WEATHER_TURNS = 5;
export const TERRAIN_TURNS = 5;

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

function setTerrain(
  terrain: TerrainKind,
  self: BattlePokemon,
  opponent: BattlePokemon,
  field: FieldState,
  turn: number,
  events: TurnEvent[],
): { opponent: BattlePokemon; field: FieldState } {
  if (field.terrain === terrain) return { opponent, field };
  events.push({ kind: 'terrain_set', turn, terrain, turns: TERRAIN_TURNS, pokemonName: self.data.name });
  return { opponent, field: { ...field, terrain, terrainTurns: TERRAIN_TURNS } };
}

function pinchBoost(type: TypeName): AbilityEffect {
  return {
    damageMultiplier: (self, move) => {
      if (move.type !== type) return 1;
      if (self.currentHp * 3 < self.level50Stats.hp) return 1.5;
      return 1;
    },
  };
}

export const IMPLEMENTED_ABILITIES: Record<string, AbilityEffect> = {
  'intimidate': {
    onSwitchIn: (_self, opponent, field, turn, events) => {
      if (opponent.currentHp <= 0) return { opponent, field };
      return { opponent: applyStatChangeFromFoe(opponent, 'attack', -1, turn, events), field };
    },
  },
  'overgrow': pinchBoost('grass'),
  'blaze':    pinchBoost('fire'),
  'torrent':  pinchBoost('water'),
  'swarm':    pinchBoost('bug'),
  'drought':        { onSwitchIn: (self, opp, field, turn, ev) => setWeather('sun',       self, opp, field, turn, ev) },
  'drizzle':        { onSwitchIn: (self, opp, field, turn, ev) => setWeather('rain',      self, opp, field, turn, ev) },
  'sand-stream':    { onSwitchIn: (self, opp, field, turn, ev) => setWeather('sandstorm', self, opp, field, turn, ev) },
  'snow-warning':   { onSwitchIn: (self, opp, field, turn, ev) => setWeather('snow',      self, opp, field, turn, ev) },
  'grassy-surge':   { onSwitchIn: (self, opp, field, turn, ev) => setTerrain('grassy',    self, opp, field, turn, ev) },
  'electric-surge': { onSwitchIn: (self, opp, field, turn, ev) => setTerrain('electric',  self, opp, field, turn, ev) },
  'psychic-surge':  { onSwitchIn: (self, opp, field, turn, ev) => setTerrain('psychic',   self, opp, field, turn, ev) },
  'misty-surge':    { onSwitchIn: (self, opp, field, turn, ev) => setTerrain('misty',     self, opp, field, turn, ev) },
  'skill-link':    { maxVariableHits: true },
  'levitate':      {},
  'no-guard':      {},
  'big-pecks':     {},
  'competitive':   {},
  'defiant':       {},
  'sheer-force': {
    damageMultiplier: (_self, move) => sheerForceApplies(move) ? 1.3 : 1,
  },
  'rock-head':    {},
  'water-absorb': {},
  'sturdy':       {},
  'static':        {},
  'flame-body':    {},
  'poison-point':  {},
  'effect-spore':  {},
  'lightning-rod': {},
};

// Lightning Rod: incoming electric-type damaging moves are nullified and the
// defender's Special Attack rises by one stage. Mirrors Water Absorb's shape.
export function absorbsElectric(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'lightning-rod'
    && move.type === 'electric'
    && move.damageClass !== 'status';
}

// Type-based immunity to an incoming status. Mirrors isImmuneToAilment in
// battleEngine.ts (duplicated here to keep abilities.ts free of engine imports).
function immuneToStatus(p: BattlePokemon, ailment: StatusCondition): boolean {
  const types = p.data.types;
  switch (ailment) {
    case 'burn':      return types.includes('fire');
    case 'poison':    return types.includes('poison') || types.includes('steel');
    case 'paralysis': return types.includes('electric');
    case 'freeze':    return types.includes('ice');
    case 'sleep':     return false;
  }
}

function inflict(
  target: BattlePokemon,
  ailment: StatusCondition,
  bearer: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (target.statusCondition) return target;
  if (immuneToStatus(target, ailment)) return target;
  events.push({ kind: 'ability_triggered', turn, pokemonName: bearer.data.name, ability: bearer.ability! });
  events.push({ kind: 'status_applied', turn, pokemonName: target.data.name, condition: ailment });
  return { ...target, statusCondition: ailment };
}

// Contact abilities (Static, Flame Body, Poison Point, Effect Spore) roll a
// 30% chance to inflict a status on the foe that just hit the bearer with a
// contact move. Grass-type and poison-type foes are immune to Effect Spore's
// powder component in modern Pokémon; we apply the grass immunity.
export function applyContactAbility(
  attacker: BattlePokemon,   // the one who made contact
  defender: BattlePokemon,   // the ability bearer
  move: Move,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (!makesContact(move)) return attacker;
  const ability = defender.ability;
  if (!ability) return attacker;
  if (attacker.currentHp <= 0) return attacker;
  if (attacker.statusCondition) return attacker;

  if (Math.random() >= 0.3) return attacker;

  switch (ability) {
    case 'static':       return inflict(attacker, 'paralysis', defender, turn, events);
    case 'flame-body':   return inflict(attacker, 'burn',      defender, turn, events);
    case 'poison-point': return inflict(attacker, 'poison',    defender, turn, events);
    case 'effect-spore': {
      // Effect Spore is a powder — grass types are immune. Overcoat is not modeled.
      if (attacker.data.types.includes('grass')) return attacker;
      const r = Math.random();
      const ailment: StatusCondition = r < 1 / 3 ? 'paralysis' : r < 2 / 3 ? 'poison' : 'sleep';
      return inflict(attacker, ailment, defender, turn, events);
    }
    default: return attacker;
  }
}

// Water Absorb: incoming water-type damaging moves are nullified and the
// defender heals 1/4 of their max HP. Status moves (damageClass 'status') are
// unaffected — those don't deal damage and Water Absorb doesn't protect from
// things like Soak.
export function absorbsWater(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'water-absorb'
    && move.type === 'water'
    && move.damageClass !== 'status';
}

// Sturdy: a full-HP defender survives a would-be KO with 1 HP. Only activates
// when the defender is at max HP entering the hit.
export function sturdyActive(defender: BattlePokemon): boolean {
  return defender.ability === 'sturdy' && defender.currentHp === defender.level50Stats.hp;
}

// Rock Head: the bearer takes no recoil from recoil moves (Double-Edge, etc.).
// Does not affect crash damage from self-missing moves (not modeled here).
export function ignoresRecoil(attacker: BattlePokemon): boolean {
  return attacker.ability === 'rock-head';
}

// A move qualifies for Sheer Force iff it's a damaging move with at least one
// *beneficial* secondary effect. Beneficial = causes status/flinch/confusion on
// the foe, lowers a foe stat, or raises a user stat — i.e. a positive side
// effect the user would want. Self-debuffs (Superpower) and recoil
// (Double-Edge) are not beneficial and do not trigger Sheer Force.
export function sheerForceApplies(move: Move): boolean {
  if (move.damageClass === 'status' || move.power <= 0) return false;
  const eff = move.effect;
  if (!eff) return false;
  if ((eff.ailmentChance ?? 0) > 0 && eff.ailment) return true;
  if ((eff.flinchChance ?? 0) > 0) return true;
  if ((eff.confusionChance ?? 0) > 0) return true;
  if ((eff.statChance ?? 0) > 0 && eff.statChanges?.some(
    sc => (sc.target === 'foe' && sc.change < 0) || (sc.target === 'user' && sc.change > 0),
  )) return true;
  return false;
}

// True when the attacker's Sheer Force should suppress the secondary effects of
// this move. Call before applying ailment / flinch / confusion / stat-change
// secondaries. Recoil and drain are preserved.
export function sheerForceSuppresses(attacker: BattlePokemon, move: Move): boolean {
  return attacker.ability === 'sheer-force' && sheerForceApplies(move);
}

// Applies a stat change initiated by the foe against `target`. Centralizes the
// reactive abilities that care about who lowered the stat:
//   - big-pecks blocks foe-initiated defense drops
//   - competitive raises Sp. Atk by 2 when any stat is lowered by a foe
//   - defiant raises Attack by 2 when any stat is lowered by a foe
// Call this instead of a bare stat mutation whenever a foe lowers/raises a
// stat on `target` (direct move effects, Intimidate, etc.).
export function applyStatChangeFromFoe(
  target: BattlePokemon,
  stat: StatStageName,
  change: number,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (change < 0 && stat === 'defense' && target.ability === 'big-pecks') {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: 'big-pecks' });
    return target;
  }

  const before = target.statStages[stat];
  const updated = applyStatChange(target, stat, change, turn, events);
  const actuallyLowered = updated.statStages[stat] < before;
  if (!actuallyLowered) return updated;

  if (target.ability === 'competitive') {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: 'competitive' });
    return applyStatChange(updated, 'special-attack', 2, turn, events);
  }
  if (target.ability === 'defiant') {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: 'defiant' });
    return applyStatChange(updated, 'attack', 2, turn, events);
  }
  return updated;
}

// True if either participant in an attack has No Guard: their attacks never
// miss, and attacks targeting them never miss.
export function noGuardInEffect(attacker: BattlePokemon, defender: BattlePokemon): boolean {
  return attacker.ability === 'no-guard' || defender.ability === 'no-guard';
}

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
