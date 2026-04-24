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
  'sniper': {},
  'thick-fat': {},
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

// Volt Absorb: incoming electric-type damaging moves are nullified and the
// defender heals 1/4 of their max HP. Mirrors Water Absorb.
export function absorbsVoltAbsorb(defender: BattlePokemon, move: Move): boolean {
  return defender.ability === 'volt-absorb'
    && move.type === 'electric'
    && move.damageClass !== 'status';
}

// Ability-based immunity to a major status ailment.
export function abilityBlocksAilment(p: BattlePokemon, ailment: StatusCondition): boolean {
  switch (p.ability) {
    case 'vital-spirit': return ailment === 'sleep';
    case 'immunity':     return ailment === 'poison';
    case 'limber':       return ailment === 'paralysis';
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

export function getDefenderAbilityDamageMultiplier(defender: BattlePokemon, move: Move): number {
  if (move.damageClass === 'special' && defender.ability === 'ice-scales') return 0.5;
  if (move.damageClass === 'physical' && defender.ability === 'fur-coat') return 0.5;
  if (move.damageClass === 'physical' && defender.ability === 'marvel-scale' && defender.statusCondition) return 0.5;
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
