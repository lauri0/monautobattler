import type { AbilityId, BattlePokemon, FieldState, Move, StatStageName, StatusCondition, TurnEvent, StatStages, WeatherKind, TerrainKind, TypeName } from '../models/types';
import { makesContact } from './contact';

// Registry of abilities whose effects are wired into the battle engine. Any
// ability name not present here displays as "(Unimplemented)" in the UI and
// has no in-battle effect.

export const WEATHER_TURNS = 5;
export const TERRAIN_TURNS = 5;

export interface AbilityEffect {
  // Applied when the bearer switches in (including the start of a battle).
  // Returns the updated self (optional), opponent, and field. May push events.
  onSwitchIn?: (
    self: BattlePokemon,
    opponent: BattlePokemon,
    field: FieldState,
    turn: number,
    events: TurnEvent[],
  ) => { self?: BattlePokemon; opponent: BattlePokemon; field: FieldState };
  // Applied when the bearer switches out voluntarily (not when fainting).
  // Returns the updated bearer. May push events.
  onSwitchOut?: (self: BattlePokemon, turn: number, events: TurnEvent[]) => BattlePokemon;
  // Applied at the end of every turn. Returns the (possibly updated) bearer.
  onEndOfTurn?: (self: BattlePokemon, turn: number, events: TurnEvent[]) => BattlePokemon;
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
  'prankster':     {},
  'early-bird':    {},
  'sap-sipper':    {},
  'solid-rock':    {},
  'filter':        {},
  'skill-link':    { maxVariableHits: true },
  'levitate':      {},
  'no-guard':      {},
  'big-pecks':     {},
  'competitive':   {},
  'defiant':       {},
  'sheer-force': {
    damageMultiplier: (_self, move) => sheerForceApplies(move) ? 1.3 : 1,
  },
  'sniper': {},
  'super-luck': {},
  'thick-fat': {},
  'speed-boost': {
    onEndOfTurn: (self, turn, events) => {
      if (self.currentHp <= 0) return self;
      const marker: TurnEvent[] = [];
      const updated = applyStatChange(self, 'speed', 1, turn, marker);
      if (marker.length > 0) {
        events.push({ kind: 'ability_triggered', turn, pokemonName: self.data.name, ability: 'speed-boost' });
        for (const ev of marker) events.push(ev);
      }
      return updated;
    },
  },
  'regenerator': {
    onSwitchOut: (self, turn, events) => {
      const heal = Math.floor(self.level50Stats.hp / 3);
      if (heal <= 0 || self.currentHp >= self.level50Stats.hp) return self;
      const hpAfter = Math.min(self.level50Stats.hp, self.currentHp + heal);
      events.push({ kind: 'ability_triggered', turn, pokemonName: self.data.name, ability: 'regenerator' });
      events.push({ kind: 'heal', turn, pokemonName: self.data.name, healed: hpAfter - self.currentHp, hpAfter });
      return { ...self, currentHp: hpAfter };
    },
  },
  'rock-head':    {},
  'water-absorb': {},
  'volt-absorb':  {},
  'sturdy':       {},
  'static':        {},
  'flame-body':    {},
  'poison-point':  {},
  'effect-spore':  {},
  'lightning-rod': {},
  'tinted-lens': {},
  'flash-fire': {
    damageMultiplier: (self, move) => self.flashFireActive && move.type === 'fire' ? 1.5 : 1,
  },
  // Keen Eye would prevent foe-initiated accuracy drops and ignore the target's
  // evasion stage. This engine doesn't model accuracy or evasion stat stages
  // (see StatStageName), so the ability has no mechanical effect — it's
  // registered here so the UI doesn't flag it as "(Unimplemented)".
  'keen-eye':    {},
  'own-tempo':    {},
  'vital-spirit': {},
  'clear-body':   {},
  'hyper-cutter': {},
  'inner-focus':  {},
  'immunity':     {},
  'limber':       {},
  'shell-armor':  {},
  'iron-fist': {
    damageMultiplier: (_self, move) => move.name.includes('punch') ? 1.2 : 1,
  },
  'ice-scales': {},
  'fur-coat':   {},
  'scrappy':    {},
  'technician': {
    damageMultiplier: (_self, move) => move.power > 0 && move.power <= 60 ? 1.5 : 1,
  },
  'merciless':    {},
  'quick-feet':   {},
  'rattled':      {},
  'natural-cure': {
    onSwitchOut: (self, turn, events) => {
      if (!self.statusCondition) return self;
      events.push({ kind: 'ability_triggered', turn, pokemonName: self.data.name, ability: 'natural-cure' });
      events.push({ kind: 'status_cured', turn, pokemonName: self.data.name, condition: self.statusCondition });
      return { ...self, statusCondition: undefined };
    },
  },
  'guts': {
    damageMultiplier: (self, move) => {
      if (move.damageClass !== 'physical') return 1;
      return self.statusCondition ? 1.5 : 1;
    },
  },
  'tough-claws': {
    damageMultiplier: (_self, move) => makesContact(move) ? 1.3 : 1,
  },
  'magic-guard':   {},
  'marvel-scale':  {},
  'download': {
    onSwitchIn: (self, opponent, field, turn, events) => {
      if (opponent.currentHp <= 0) return { opponent, field };
      const raiseSpa = opponent.level50Stats.specialDefense < opponent.level50Stats.defense;
      const stat: StatStageName = raiseSpa ? 'special-attack' : 'attack';
      const boostedSelf = applyStatChange(self, stat, 1, turn, events);
      return { self: boostedSelf, opponent, field };
    },
  },
  'shed-skin':     {},
  'moxie':         {},
  'adaptability':  {},
  'weak-armor':    {},
  'anger-point':   {},
  'magma-armor':   {},
  'liquid-ooze':   {},
  'stench':        {},
  'poison-touch':  {},
  'poison-heal':   {},
  'hustle': {
    damageMultiplier: (_self, move) => move.damageClass === 'physical' ? 1.5 : 1,
  },
  'steadfast':  {},
  'justified':  {},
  'storm-drain': {},
  'water-veil':  {},
  'analytic':    {},
  'motor-drive': {},
  'sharpness': {
    damageMultiplier: (_self, move) => isSlicingMove(move) ? 1.5 : 1,
  },
  'infiltrator': {},
  'wind-rider':  {},
};

// Tinted Lens: not-very-effective hits (effectiveness < 1) deal double damage.
// Applied after type effectiveness is computed, since the multiplier depends
// on the resulting effectiveness rather than the move alone.
export function tintedLensMultiplier(attacker: BattlePokemon, effectiveness: number): number {
  if (attacker.ability !== 'tinted-lens') return 1;
  return effectiveness > 0 && effectiveness < 1 ? 2 : 1;
}

// Lightning Rod: incoming electric-type damaging moves are nullified and the
// defender's Special Attack rises by one stage. Mirrors Water Absorb's shape.
export function absorbsElectric(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'lightning-rod'
    && move.type === 'electric'
    && move.damageClass !== 'status';
}

// Storm Drain: incoming water-type damaging moves are nullified and the
// defender's Special Attack rises by one stage. Mirrors Lightning Rod's shape.
export function absorbsStormDrain(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'storm-drain'
    && move.type === 'water'
    && move.damageClass !== 'status';
}

// Volt Absorb: incoming electric-type damaging moves are nullified and the
// defender heals 1/4 of their max HP. Mirrors Water Absorb.
export function absorbsVoltAbsorb(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'volt-absorb'
    && move.type === 'electric'
    && move.damageClass !== 'status';
}

// Motor Drive: incoming electric-type damaging moves are nullified and the
// defender's Speed rises by one stage.
export function absorbsMotorDrive(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'motor-drive'
    && move.type === 'electric'
    && move.damageClass !== 'status';
}

// Ability-based immunity to a major status ailment.
export function abilityBlocksAilment(p: BattlePokemon, ailment: StatusCondition): boolean {
  switch (p.ability) {
    case 'vital-spirit': return ailment === 'sleep';
    case 'immunity':     return ailment === 'poison';
    case 'limber':       return ailment === 'paralysis';
    case 'magma-armor':  return ailment === 'freeze';
    case 'water-veil':   return ailment === 'burn';
    default:             return false;
  }
}

// Own Tempo prevents confusion.
export function abilityBlocksConfusion(p: BattlePokemon): boolean {
  return p.ability === 'own-tempo';
}

// Type- or ability-based immunity to an incoming status. Mirrors isImmuneToAilment
// in battleEngine.ts (duplicated here to keep abilities.ts free of engine imports).
function immuneToStatus(p: BattlePokemon, ailment: StatusCondition): boolean {
  if (abilityBlocksAilment(p, ailment)) return true;
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

// Rattled: when the defender is hit by a Bug-, Ghost-, or Dark-type damaging move,
// raise its Speed by one stage.
export function applyRattledByMove(
  defender: BattlePokemon,
  move: Move,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (defender.ability !== 'rattled') return defender;
  if (defender.currentHp <= 0) return defender;
  if (move.type !== 'bug' && move.type !== 'ghost' && move.type !== 'dark') return defender;
  events.push({ kind: 'ability_triggered', turn, pokemonName: defender.data.name, ability: 'rattled' });
  return applyStatChange(defender, 'speed', 1, turn, events);
}

// Justified: when the bearer is hit by a Dark-type damaging move, raise Attack
// by one stage.
export function applyJustified(
  defender: BattlePokemon,
  move: Move,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (defender.ability !== 'justified') return defender;
  if (defender.currentHp <= 0) return defender;
  if (move.type !== 'dark') return defender;
  events.push({ kind: 'ability_triggered', turn, pokemonName: defender.data.name, ability: 'justified' });
  return applyStatChange(defender, 'attack', 1, turn, events);
}

// Steadfast: when the bearer flinches, raise its Speed by one stage.
export function applySteadfast(
  p: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (p.ability !== 'steadfast') return p;
  events.push({ kind: 'ability_triggered', turn, pokemonName: p.data.name, ability: 'steadfast' });
  return applyStatChange(p, 'speed', 1, turn, events);
}

const SLICING_KEYWORDS = ['ace', 'cut', 'slash', 'edge', 'razor', 'blade', 'axe', 'sword', 'scissor', 'claw'];

export function isSlicingMove(move: Move): boolean {
  if (move.damageClass === 'status') return false;
  const lower = move.name.toLowerCase();
  return SLICING_KEYWORDS.some(kw => lower.includes(kw));
}

// Weak Armor: when the bearer is hit by a physical move, its Defense drops by
// one stage and its Speed rises by two stages.
export function applyWeakArmor(
  defender: BattlePokemon,
  move: Move,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (defender.ability !== 'weak-armor') return defender;
  if (defender.currentHp <= 0) return defender;
  if (move.damageClass !== 'physical') return defender;
  events.push({ kind: 'ability_triggered', turn, pokemonName: defender.data.name, ability: 'weak-armor' });
  let p = applyStatChange(defender, 'defense', -1, turn, events);
  p = applyStatChange(p, 'speed', 2, turn, events);
  return p;
}

// Flash Fire: incoming fire-type damaging moves are nullified and the defender
// gains a 1.5× boost to their own Fire-type moves (stored as flashFireActive).
export function absorbsFire(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'flash-fire'
    && move.type === 'fire'
    && move.damageClass !== 'status';
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

// Sap Sipper: nullify grass-type damaging moves and raise the defender's Attack by 1.
export function absorbsGrass(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'sap-sipper'
    && move.type === 'grass'
    && move.damageClass !== 'status';
}

const WIND_MOVES = new Set(['air-cutter', 'blizzard', 'heat-wave', 'hurricane', 'icy-wind', 'petal-blizzard']);

export function isWindMove(move: Move): boolean {
  return WIND_MOVES.has(move.name);
}

// Wind Rider: incoming wind moves are nullified and the defender's Attack rises by 1.
export function absorbsWind(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'wind-rider'
    && isWindMove(move)
    && move.damageClass !== 'status';
}

// Sturdy: a full-HP defender survives a would-be KO with 1 HP. Only activates
// when the defender is at max HP entering the hit.
export function sturdyActive(defender: BattlePokemon): boolean {
  return defender.ability === 'sturdy' && defender.currentHp === defender.level50Stats.hp;
}

// Rock Head / Magic Guard: no recoil from recoil moves.
export function ignoresRecoil(attacker: BattlePokemon): boolean {
  return attacker.ability === 'rock-head' || attacker.ability === 'magic-guard';
}

// Magic Guard: bearer takes no indirect damage (status ticks, weather, hazards).
export function hasMagicGuard(p: BattlePokemon): boolean {
  return p.ability === 'magic-guard';
}

// Shed Skin: 33% chance each end-of-turn to cure the bearer's major status.
export function applyShedSkin(
  p: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (p.ability !== 'shed-skin') return p;
  if (!p.statusCondition) return p;
  if (p.currentHp <= 0) return p;
  if (Math.random() >= 1 / 3) return p;
  events.push({ kind: 'ability_triggered', turn, pokemonName: p.data.name, ability: 'shed-skin' });
  events.push({ kind: 'status_cured', turn, pokemonName: p.data.name, condition: p.statusCondition });
  return { ...p, statusCondition: undefined };
}

// Moxie: raise Attack by 1 stage when the bearer KOs a foe with a direct attack.
export function applyMoxie(
  attacker: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (attacker.ability !== 'moxie') return attacker;
  events.push({ kind: 'ability_triggered', turn, pokemonName: attacker.data.name, ability: 'moxie' });
  return applyStatChange(attacker, 'attack', 1, turn, events);
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
  if (change < 0 && target.ability === 'clear-body') {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: 'clear-body' });
    return target;
  }
  if (change < 0 && stat === 'attack' && (target.ability === 'hyper-cutter' || target.ability === 'own-tempo' || target.ability === 'inner-focus' || target.ability === 'scrappy')) {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: target.ability });
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
  if (target.ability === 'rattled' && stat === 'attack') {
    events.push({ kind: 'ability_triggered', turn, pokemonName: target.data.name, ability: 'rattled' });
    return applyStatChange(updated, 'speed', 1, turn, events);
  }
  return updated;
}

// True if either participant in an attack has No Guard: their attacks never
// miss, and attacks targeting them never miss.
export function noGuardInEffect(attacker: BattlePokemon, defender: BattlePokemon): boolean {
  return attacker.ability === 'no-guard' || defender.ability === 'no-guard';
}

// Stench: when the bearer deals damage, there is a 10% chance the target flinches.
// Returns true if the target flinched (caller updates defenderFlinched).
export function applyStench(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  turn: number,
  events: TurnEvent[],
): boolean {
  if (attacker.ability !== 'stench') return false;
  if (move.damageClass === 'status') return false;
  if (defender.currentHp <= 0) return false;
  if (defender.ability === 'inner-focus') return false;
  if (Math.random() >= 0.1) return false;
  events.push({ kind: 'ability_triggered', turn, pokemonName: attacker.data.name, ability: 'stench' });
  return true;
}

// Poison Touch: when the bearer hits a target with a contact move, the target
// has a 30% chance of being poisoned.
export function applyPoisonTouch(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (attacker.ability !== 'poison-touch') return defender;
  if (!makesContact(move)) return defender;
  if (defender.currentHp <= 0) return defender;
  if (defender.statusCondition) return defender;
  if (Math.random() >= 0.3) return defender;
  return inflict(defender, 'poison', attacker, turn, events);
}

// Poison Heal: true when end-of-turn poison should heal instead of damage.
export function hasPoisonHeal(p: BattlePokemon): boolean {
  return p.ability === 'poison-heal' && p.statusCondition === 'poison';
}

// Anger Point: when the bearer takes a critical hit, raise its Attack to +6.
export function applyAngerPoint(
  defender: BattlePokemon,
  isCrit: boolean,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  if (defender.ability !== 'anger-point') return defender;
  if (!isCrit) return defender;
  if (defender.currentHp <= 0) return defender;
  const change = 6 - defender.statStages.attack;
  if (change <= 0) return defender;
  events.push({ kind: 'ability_triggered', turn, pokemonName: defender.data.name, ability: 'anger-point' });
  return applyStatChange(defender, 'attack', change, turn, events);
}

export const ABILITY_DESCRIPTIONS: Record<string, string> = {
  'intimidate':     'Lowers the foe\'s Attack by one stage on switch-in',
  'overgrow':       'Boosts Grass-type moves by 50% when HP drops below 1/3',
  'blaze':          'Boosts Fire-type moves by 50% when HP drops below 1/3',
  'torrent':        'Boosts Water-type moves by 50% when HP drops below 1/3',
  'swarm':          'Boosts Bug-type moves by 50% when HP drops below 1/3',
  'drought':        'Summons harsh sunlight for 5 turns on switch-in',
  'drizzle':        'Summons rain for 5 turns on switch-in',
  'sand-stream':    'Summons a sandstorm for 5 turns on switch-in',
  'snow-warning':   'Summons snow for 5 turns on switch-in',
  'grassy-surge':   'Sets Grassy Terrain for 5 turns on switch-in',
  'electric-surge': 'Sets Electric Terrain for 5 turns on switch-in',
  'psychic-surge':  'Sets Psychic Terrain for 5 turns on switch-in',
  'misty-surge':    'Sets Misty Terrain for 5 turns on switch-in',
  'skill-link':     'Multi-hit moves always hit the maximum number of times',
  'levitate':       'Immune to Ground-type moves and unaffected by terrain',
  'no-guard':       'This Pokémon\'s moves and moves targeting it never miss',
  'big-pecks':      'Prevents foes from lowering this Pokémon\'s Defense',
  'competitive':    'Raises Sp. Atk by 2 when a foe lowers any of this Pokémon\'s stats',
  'defiant':        'Raises Attack by 2 when a foe lowers any of this Pokémon\'s stats',
  'sheer-force':    'Removes secondary effects of moves to boost their power by 30%',
  'sniper':         'Boosts the power of critical hits to 2.25× instead of 1.5×',
  'super-luck':     'Raises this Pokémon\'s critical hit ratio by one stage',
  'thick-fat':      'Halves damage taken from Fire- and Ice-type moves',
  'regenerator':    'Heals 1/3 of max HP when switching out',
  'rock-head':      'Prevents recoil damage from recoil-dealing moves',
  'water-absorb':   'Absorbs Water-type moves, healing 1/4 of max HP instead',
  'volt-absorb':    'Absorbs Electric-type moves, healing 1/4 of max HP instead',
  'sturdy':         'Survives a one-hit KO with 1 HP when at full health',
  'static':         '30% chance to paralyze a foe that makes contact',
  'flame-body':     '30% chance to burn a foe that makes contact',
  'poison-point':   '30% chance to poison a foe that makes contact',
  'effect-spore':   '30% chance to inflict paralysis, poison, or sleep on contact',
  'lightning-rod':  'Draws and nullifies Electric-type moves; raises Sp. Atk by 1',
  'flash-fire':     'Immune to Fire-type moves and the first one absorbed boosts Fire-type move power by 1.5×',
  'tinted-lens':    'Doubles the power of not-very-effective moves',
  'keen-eye':       'Prevents foes from lowering this Pokémon\'s accuracy and ignores the target\'s evasion',
  'own-tempo':      'Prevents confusion. Immune to Intimidate and other foe-initiated Attack drops',
  'clear-body':     'Prevents other Pokémon from lowering this Pokémon\'s stats',
  'hyper-cutter':   'Prevents other Pokémon from lowering this Pokémon\'s Attack stat',
  'inner-focus':    'Prevents flinching. Immune to Intimidate and other foe-initiated Attack drops',
  'vital-spirit':   'Prevents this Pokémon from falling asleep',
  'immunity':       'Prevents this Pokémon from being poisoned',
  'limber':         'Prevents this Pokémon from being paralyzed',
  'shell-armor':    'Prevents the opponent from landing critical hits',
  'iron-fist':      'Boosts the power of punching moves by 20%',
  'ice-scales':     'Halves damage taken from special moves',
  'fur-coat':       'Halves damage taken from physical moves',
  'scrappy':        'Normal- and Fighting-type moves hit Ghost types and immunity to Intimidate',
  'technician':     'Moves with 60 base power or less have their power multiplied by 1.5×',
  'merciless':      'Attacks always result in a critical hit if the target is poisoned. Bypasses Shell Armor.',
  'quick-feet':     'Raises Speed by 50% when the bearer has a major status ailment. Paralysis speed penalty is ignored.',
  'rattled':        'Raises Speed by one stage when hit by a Bug-, Ghost-, or Dark-type move, or when Intimidated.',
  'natural-cure':   'Cures any major status condition when this Pokémon switches out',
  'guts':           'Raises Attack by 50% when the bearer has a major status ailment; burn\'s Attack penalty is suppressed',
  'tough-claws':    'Boosts the power of moves that make direct contact by 30%',
  'magic-guard':    'This Pokémon can only be damaged by direct attacks; ignores all indirect damage',
  'marvel-scale':   'Halves damage from physical moves when the bearer has a major status ailment',
  'download':       'Raises Attack or Sp. Atk by one stage on switch-in based on which of the foe\'s defenses is lower',
  'shed-skin':      '33% chance each turn to cure the bearer\'s major status condition',
  'moxie':          'Raises Attack by one stage each time the bearer knocks out an opposing Pokémon',
  'adaptability':   'Raises the bonus from Same-Type Attack Bonus from 1.5× to 2×',
  'weak-armor':     'Physical hits lower Defense by one stage but sharply raise Speed by two stages',
  'anger-point':    'Maxes out Attack when the bearer takes a critical hit',
  'magma-armor':    'Prevents the bearer from being frozen',
  'liquid-ooze':    'Opponent\'s draining moves deal damage to them instead of restoring their HP',
  'stench':         'Adds a 10% flinch chance to all of the bearer\'s damaging moves',
  'poison-touch':   '30% chance to poison the target when the bearer hits with a contact move',
  'poison-heal':    'If poisoned, restores 1/8 of max HP at the end of each turn instead of taking damage',
  'hustle':         'Boosts Attack by 50% but reduces the accuracy of physical moves by 20%',
  'storm-drain':    'Draws and nullifies Water-type moves; raises Sp. Atk by 1',
  'water-veil':     'Prevents the bearer from being burned',
  'analytic':       'Boosts the power of moves by 30% when the bearer moves last in the turn',
  'motor-drive':    'Immune to Electric-type moves; raises Speed by 1 when hit by one',
  'steadfast':      'Raises Speed by one stage whenever the bearer flinches',
  'justified':      'Raises Attack by one stage when the bearer is hit by a Dark-type move',
  'sharpness':      'Boosts the power of slicing moves (those with ace, cut, slash, edge, razor, blade, axe, sword, or scissor in their name) by 50%',
  'prankster':      'Non-damaging moves have their priority increased by 1',
  'early-bird':     'This Pokémon wakes up after only 1 turn of sleep',
  'sap-sipper':     'Immune to Grass-type moves; being hit by one raises Attack by one stage instead',
  'solid-rock':     'Reduces damage taken from super-effective moves by 25%',
  'filter':         'Reduces damage taken from super-effective moves by 25%',
  'infiltrator':    'Moves ignore the effects of Light Screen and Reflect',
  'wind-rider':     'Boosts Attack when Tailwind takes effect; immune to wind moves and boosts Attack when hit by one',
};

export function getAbilityDescription(name: AbilityId | undefined): string | undefined {
  if (!name) return undefined;
  return ABILITY_DESCRIPTIONS[name];
}

export function isAbilityImplemented(name: AbilityId | undefined): boolean {
  if (!name) return false;
  return name in IMPLEMENTED_ABILITIES;
}

export function abilityMaxVariableHits(attacker: BattlePokemon): boolean {
  const entry = attacker.ability ? IMPLEMENTED_ABILITIES[attacker.ability] : undefined;
  return entry?.maxVariableHits ?? false;
}

export function getDefenderAbilityDamageMultiplier(defender: BattlePokemon, move: Move, effectiveness = 1): number {
  if (move.damageClass === 'special' && defender.ability === 'ice-scales') return 0.5;
  if (move.damageClass === 'physical' && defender.ability === 'fur-coat') return 0.5;
  if (move.damageClass === 'physical' && defender.ability === 'marvel-scale' && defender.statusCondition) return 0.5;
  if ((defender.ability === 'solid-rock' || defender.ability === 'filter') && effectiveness > 1) return 0.75;
  return 1;
}

export function getAbilityDamageMultiplier(attacker: BattlePokemon, move: Move): number {
  const ability = attacker.ability;
  if (!ability) return 1;
  const entry = IMPLEMENTED_ABILITIES[ability];
  return entry?.damageMultiplier?.(attacker, move) ?? 1;
}

// Applies the outgoing pokemon's switch-out ability (e.g. Regenerator). Returns
// the (possibly updated) bearer. Emits events when the ability activates.
export function applySwitchOutAbility(
  outgoing: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  const ability = outgoing.ability;
  if (!ability) return outgoing;
  const entry = IMPLEMENTED_ABILITIES[ability];
  if (!entry?.onSwitchOut) return outgoing;
  return entry.onSwitchOut(outgoing, turn, events);
}

// Applies the bearer's end-of-turn ability (e.g. Speed Boost). Returns the
// (possibly updated) bearer. Emits events when the ability activates.
export function applyEndOfTurnAbility(
  p: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  const ability = p.ability;
  if (!ability) return p;
  const entry = IMPLEMENTED_ABILITIES[ability];
  if (!entry?.onEndOfTurn) return p;
  return entry.onEndOfTurn(p, turn, events);
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
): { self?: BattlePokemon; opponent: BattlePokemon; field: FieldState } {
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
