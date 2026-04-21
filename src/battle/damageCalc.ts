import type { BattlePokemon, FieldState, Move, TypeName, WeatherKind } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';
import { getAbilityDamageMultiplier } from './abilities';

// Weather-dependent accuracy override for moves whose hit chance is keyed to
// the weather. Returns `null` when the move always hits under the current
// weather, otherwise the (possibly scaled) percentage accuracy to roll against.
function effectiveAccuracy(move: Move, weather: WeatherKind | undefined): number | null {
  if (move.accuracy === null) return null;
  if (weather === 'snow' && move.name === 'blizzard') return null;
  if (weather === 'rain' && (move.name === 'thunder' || move.name === 'hurricane')) return null;
  if (weather === 'sun' && (move.name === 'thunder' || move.name === 'hurricane')) return move.accuracy * 0.5;
  return move.accuracy;
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
  if (p.statusCondition === 'paralysis') spd *= 0.5;
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
  const acc = effectiveAccuracy(move, field?.weather);
  if (acc !== null) {
    const hitRoll = Math.random();
    if (hitRoll > acc / 100) {
      return { damage: 0, isCrit: false, missed: true, effectiveness: 1 };
    }
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.data.types, move.effect?.superEffectiveAgainst);
  if (effectiveness === 0) {
    return { damage: 0, isCrit: false, missed: false, effectiveness: 0 };
  }

  const critRate = move.effect?.critRate ?? 0;
  const critProb = critRate === 0 ? 1 / 24 : critRate === 1 ? 1 / 8 : 1 / 2;
  const isCrit = Math.random() < critProb;
  const roll = randomRoll ?? (0.85 + Math.random() * 0.15);

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    A = move.effect?.useFoeAttack
      ? defender.level50Stats.attack * statStageMult(defender.statStages.attack)
      : attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    if (!move.effect?.useFoeAttack && attacker.statusCondition === 'burn') A *= 0.5;
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const critMult = isCrit ? 1.5 : 1.0;
  const screenMult = screenApplies(move, defenderScreens, isCrit) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);

  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * critMult * roll * stab * effectiveness * screenMult * abilityMult * weatherMult);

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
  const effectiveness = getTypeEffectiveness(move.type, defender.data.types, move.effect?.superEffectiveAgainst);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    A = move.effect?.useFoeAttack
      ? defender.level50Stats.attack * statStageMult(defender.statStages.attack)
      : attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const screenMult = screenApplies(move, defenderScreens, false) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * 0.85 * stab * effectiveness * screenMult * abilityMult * weatherMult);
  return Math.max(1, damage);
}

export function calcExpectedDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  defenderScreens?: DefenderScreens,
  field?: FieldState,
): number {
  const effectiveness = getTypeEffectiveness(move.type, defender.data.types, move.effect?.superEffectiveAgainst);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    A = move.effect?.useFoeAttack
      ? defender.level50Stats.attack * statStageMult(defender.statStages.attack)
      : attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  D *= weatherDefenseMult(defender.data.types, move.damageClass, field?.weather);

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const roll = 0.925; // average of 0.85–1.00
  const screenMult = screenApplies(move, defenderScreens, false) ? 0.5 : 1.0;
  const abilityMult = getAbilityDamageMultiplier(attacker, move);
  const weatherMult = weatherMoveMult(move.type, field?.weather);
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * roll * stab * effectiveness * screenMult * abilityMult * weatherMult);
  return Math.max(1, damage);
}
