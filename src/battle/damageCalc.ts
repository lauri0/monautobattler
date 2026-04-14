import type { BattlePokemon, Move } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  effectiveness: number;
}

// Standard Gen stat stage multiplier: (2 + max(stage,0)) / (2 - min(stage,0))
function statStageMult(stage: number): number {
  return (2 + Math.max(stage, 0)) / (2 - Math.min(stage, 0));
}

export function effectiveSpeed(p: BattlePokemon): number {
  let spd = p.level50Stats.speed * statStageMult(p.statStages.speed);
  if (p.statusCondition === 'paralysis') spd *= 0.5;
  return spd;
}

export function calcDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move,
  randomRoll?: number // 0.85–1.00; if not provided, random
): DamageResult {
  // Check accuracy
  if (move.accuracy !== null) {
    const hitRoll = Math.random();
    if (hitRoll > move.accuracy / 100) {
      return { damage: 0, isCrit: false, missed: true, effectiveness: 1 };
    }
  }

  const effectiveness = getTypeEffectiveness(move.type, defender.data.types);
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
    A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    if (attacker.statusCondition === 'burn') A *= 0.5;
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const critMult = isCrit ? 1.5 : 1.0;

  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * critMult * roll * stab * effectiveness);

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
  move: Move
): number {
  const effectiveness = getTypeEffectiveness(move.type, defender.data.types);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * 0.85 * stab * effectiveness);
  return Math.max(1, damage);
}

export function calcExpectedDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: Move
): number {
  const effectiveness = getTypeEffectiveness(move.type, defender.data.types);
  if (effectiveness === 0) return 0;

  let A: number;
  let D: number;

  if (move.damageClass === 'physical') {
    A = attacker.level50Stats.attack * statStageMult(attacker.statStages.attack);
    D = defender.level50Stats.defense * statStageMult(defender.statStages.defense);
  } else {
    A = attacker.level50Stats.specialAttack * statStageMult(attacker.statStages['special-attack']);
    D = defender.level50Stats.specialDefense * statStageMult(defender.statStages['special-defense']);
  }

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const roll = 0.925; // average of 0.85–1.00
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * roll * stab * effectiveness);
  return Math.max(1, damage);
}
