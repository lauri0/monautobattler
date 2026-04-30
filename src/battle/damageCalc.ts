import type { BattlePokemon, FieldState, Move, TerrainKind, TypeName, WeatherKind } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';
import { getAbilityDamageMultiplier, getDefenderAbilityDamageMultiplier, noGuardInEffect, tintedLensMultiplier } from './abilities';

// "Grounded" = eligible to be hit by Ground-type moves and affected by terrain.
// Flying types and Levitate users float; no other modifiers are modeled.
export function isGrounded(p: BattlePokemon): boolean {
  if (p.ability === 'levitate') return false;
  if (p.data.types.includes('flying')) return false;
  return true;
}

// Terrain damage multiplier. Only grounded attackers benefit from the +30% to
// matching-type moves; misty halves incoming Dragon damage on grounded defenders.
const GRASSY_HALVED_MOVES = new Set(['earthquake', 'bulldoze']);

function terrainMoveMult(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  terrain: TerrainKind | undefined,
): number {
  if (!terrain) return 1;
  if (terrain === 'misty' && move.type === 'dragon' && isGrounded(defender)) return 0.5;
  if (terrain === 'grassy' && GRASSY_HALVED_MOVES.has(move.name) && isGrounded(defender)) return 0.5;
  if (!isGrounded(attacker)) return 1;
  if (terrain === 'electric' && move.type === 'electric') return 1.3;
  if (terrain === 'grassy'   && move.type === 'grass')    return 1.3;
  if (terrain === 'psychic'  && move.type === 'psychic')  return 1.3;
  return 1;
}

// Effective type multiplier including ability-based immunities and reductions.
function typeEffectiveness(move: Move, defender: BattlePokemon, attacker?: BattlePokemon): number {
  if (move.type === 'ground' && defender.ability === 'levitate') return 0;
  const scrappy = attacker?.ability === 'scrappy'
    && (move.type === 'normal' || move.type === 'fighting')
    && defender.data.types.includes('ghost');
  const defenderTypes = scrappy ? defender.data.types.filter(t => t !== 'ghost') : defender.data.types;
  const base = getTypeEffectiveness(move.type, defenderTypes, move.effect?.superEffectiveAgainst);
  if (defender.ability === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) return base * 0.5;
  return base;
}

// Weather-dependent accuracy override for moves whose hit chance is keyed to
// the weather. Returns `null` when the move always hits under the current
// weather, otherwise the (possibly scaled) percentage accuracy to roll against.
function effectiveAccuracy(move: Move, weather: WeatherKind | undefined, attacker?: BattlePokemon): number | null {
  if (move.accuracy === null) return null;
  if (weather === 'snow' && move.name === 'blizzard') return null;
  if (weather === 'rain' && (move.name === 'thunder' || move.name === 'hurricane')) return null;
  let acc = (weather === 'sun' && (move.name === 'thunder' || move.name === 'hurricane'))
    ? move.accuracy * 0.5
    : move.accuracy;
  if (attacker?.ability === 'hustle' && move.damageClass === 'physical') acc *= 0.8;
  return acc;
}

function weatherMoveMult(moveType: TypeName, weather: WeatherKind | undefined): number {
  if (weather === 'sun') {
    if (moveType === 'fire') return 1.5;
    if (moveType === 'water') return 0.5;
  } else if (weather === 'rain') {
    if (moveType === 'water') return 1.5;
    if (moveType === 'fire') return 0.5;
  }
  return 1;
}

// Weather-based defense multiplier applied to the defender's D stat:
//  - Sandstorm: Rock-type defenders get +50% SpD against special moves.
//  - Snow: Ice-type defenders get +50% Def against physical moves.
function weatherDefenseMult(
  defenderTypes: TypeName[],
  damageClass: Move['damageClass'],
  weather: WeatherKind | undefined,
): number {
  if (weather === 'sandstorm' && damageClass === 'special' && defenderTypes.includes('rock')) return 1.5;
  if (weather === 'snow' && damageClass === 'physical' && defenderTypes.includes('ice')) return 1.5;
  return 1;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  effectiveness: number;
}

// Screens on the defender's side that affect incoming damage. Passed into the
// damage calculators so the AI evaluators also see the reduction.
export interface DefenderScreens {
  lightScreen?: boolean;
  reflect?: boolean;
}

// Standard Gen stat stage multiplier: (2 + max(stage,0)) / (2 - min(stage,0))
function statStageMult(stage: number): number {
  return (2 + Math.max(stage, 0)) / (2 - Math.min(stage, 0));
}

export function effectiveSpeed(p: BattlePokemon, tailwind = false): number {
  let spd = p.level50Stats.speed * statStageMult(p.statStages.speed);
  if (p.ability === 'quick-feet' && p.statusCondition) {
    spd *= 1.5;
  } else if (p.statusCondition === 'paralysis') {
    spd *= 0.5;
  }
  if (tailwind) spd *= 2;
  return spd;
}

// True when a screen matching the move's class applies and the hit is not a crit.
function screenApplies(move: Move, screens: DefenderScreens | undefined, isCrit: boolean): boolean {
  if (!screens || isCrit) return false;
  if (move.damageClass === 'physical') return !!screens.reflect;
  if (move.damageClass === 'special') return !!screens.lightScreen;
  return false;
}

export function calcDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  randomRoll?: number, // 0.85–1.00; if not provided, random
  defenderScreens?: DefenderScreens,
  field?: FieldState,
): DamageResult {
  // Check accuracy (with weather-based overrides for Blizzard / Thunder / Hurricane).
  // No Guard on either side bypasses the miss roll entirely.
  const acc = effectiveAccuracy(move, field?.weather, attacker);
  if (acc !== null && !noGuardInEffect(attacker, defender)) {
    const hitRoll = Math.random();
    if (hitRoll > acc / 100) {
      return { damage: 0, isCrit: false, missed: true, effectiveness: 1 };
    }
  }

  const effectiveness = typeEffectiveness(move, defender, attacker);
  if (effectiveness === 0) {
    return { damage: 0, isCrit: false, missed: false, effectiveness: 0 };
  }

  const critRate = move.effect?.critRate ?? 0;
  const critStage = critRate + (attacker.ability === 'super-luck' ? 1 : 0);
  const critProb = critStage === 0 ? 1 / 24 : critStage === 1 ? 1 / 8 : 1 / 2;
  const mercilessCrit = attacker.ability === 'merciless' && defender.statusCondition === 'poison';
  const isCrit = mercilessCrit || (defender.ability !== 'shell-armor' && Math.random() < critProb);
  const roll = randomRoll ?? (0.85 + Math.random() * 0.15);

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    if (move.effect?.useFoeAttack) {
      A = defender.level50Stats.attack * statStageMult(defender.statStages.attack);
    } else if (move.effect?.useOwnDefense) {
      A = attacker.level50Stats.defense * statStageMult(attacker.statStages.defense);
    } else {
      A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
      if (attacker.statusCondition === 'burn' && attacker.ability !== 'guts') A *= 0.5;
    }
    const defStage = move.effect?.ignoreDefenseStages ? 0 : defender.statStages.defense;
    D = defender.level50Stats.defense * statStageMult(defStage);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    const spdStage = move.effect?.ignoreDefenseStages ? 0 : defender.statStages['special-defense'];
    D = defender.level50Stats.specialDefense * statStageMult(spdStage);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? (attacker.ability === 'adaptability' ? 2.0 : 1.5) : 1.0;
  const critMult = isCrit ? (attacker.ability === 'sniper' ? 2.25 : 1.5) : 1.0;
  const screenMult = screenApplies(move, defenderScreens, isCrit) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);
  const terrainMult = terrainMoveMult(attacker, defender, move, field?.terrain);

  const tintedMult = tintedLensMultiplier(attacker, effectiveness);
  const defAbilityMult = getDefenderAbilityDamageMultiplier(defender, move, effectiveness);
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * critMult * roll * stab * effectiveness * screenMult * abilityMult * weatherMult * terrainMult * tintedMult * defAbilityMult);

  return {
    damage: Math.max(1, damage),
    isCrit,
    missed: false,
    effectiveness,
  };
}

export function calcMinDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  defenderScreens?: DefenderScreens,
  field?: FieldState,
): number {
  const effectiveness = typeEffectiveness(move, defender, attacker);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    if (move.effect?.useFoeAttack) {
      A = defender.level50Stats.attack * statStageMult(defender.statStages.attack);
    } else if (move.effect?.useOwnDefense) {
      A = attacker.level50Stats.defense * statStageMult(attacker.statStages.defense);
    } else {
      A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    }
    const defStageMin = move.effect?.ignoreDefenseStages ? 0 : defender.statStages.defense;
    D = defender.level50Stats.defense * statStageMult(defStageMin);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    const spdStageMin = move.effect?.ignoreDefenseStages ? 0 : defender.statStages['special-defense'];
    D = defender.level50Stats.specialDefense * statStageMult(spdStageMin);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? (attacker.ability === 'adaptability' ? 2.0 : 1.5) : 1.0;
  const screenMult = screenApplies(move, defenderScreens, false) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);
  const terrainMult = terrainMoveMult(attacker, defender, move, field?.terrain);
  const tintedMult = tintedLensMultiplier(attacker, effectiveness);
  const defAbilityMult = getDefenderAbilityDamageMultiplier(defender, move, effectiveness);
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * 0.85 * stab * effectiveness * screenMult * abilityMult * weatherMult * terrainMult * tintedMult * defAbilityMult);
  return Math.max(1, damage);
}

export function calcExpectedDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  defenderScreens?: DefenderScreens,
  field?: FieldState,
): number {
  const effectiveness = typeEffectiveness(move, defender, attacker);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    if (move.effect?.useFoeAttack) {
      A = defender.level50Stats.attack * statStageMult(defender.statStages.attack);
    } else if (move.effect?.useOwnDefense) {
      A = attacker.level50Stats.defense * statStageMult(attacker.statStages.defense);
    } else {
      A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    }
    const defStageExp = move.effect?.ignoreDefenseStages ? 0 : defender.statStages.defense;
    D = defender.level50Stats.defense * statStageMult(defStageExp);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    const spdStageExp = move.effect?.ignoreDefenseStages ? 0 : defender.statStages['special-defense'];
    D = defender.level50Stats.specialDefense * statStageMult(spdStageExp);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? (attacker.ability === 'adaptability' ? 2.0 : 1.5) : 1.0;
  const roll = 0.925; // average of 0.85–1.00
  const screenMult = screenApplies(move, defenderScreens, false) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);
  const terrainMult = terrainMoveMult(attacker, defender, move, field?.terrain);
  const tintedMult = tintedLensMultiplier(attacker, effectiveness);
  const defAbilityMult = getDefenderAbilityDamageMultiplier(defender, move, effectiveness);
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * roll * stab * effectiveness * screenMult * abilityMult * weatherMult * terrainMult * tintedMult * defAbilityMult);
  return Math.max(1, damage);
}
