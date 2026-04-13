import type { BattlePokemon, Move } from '../models/types';
import { getTypeEffectiveness } from '../utils/typeChart';

export interface DamageResult {
  damage: number;
  isCrit: boolean;
  missed: boolean;
  effectiveness: number;
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

  const isCrit = Math.random() < 1 / 24;
  const roll = randomRoll ?? (0.85 + Math.random() * 0.15);

  const A = move.damageClass === 'physical'
    ? attacker.level50Stats.attack
    : attacker.level50Stats.specialAttack;
  const D = move.damageClass === 'physical'
    ? defender.level50Stats.defense
    : defender.level50Stats.specialDefense;

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

  const A = move.damageClass === 'physical'
    ? attacker.level50Stats.attack
    : attacker.level50Stats.specialAttack;
  const D = move.damageClass === 'physical'
    ? defender.level50Stats.defense
    : defender.level50Stats.specialDefense;

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

  const A = move.damageClass === 'physical'
    ? attacker.level50Stats.attack
    : attacker.level50Stats.specialAttack;
  const D = move.damageClass === 'physical'
    ? defender.level50Stats.defense
    : defender.level50Stats.specialDefense;

  const stab = attacker.data.types.includes(move.type) ? 1.5 : 1.0;
  const roll = 0.925; // average of 0.85–1.00
  const base = Math.floor(Math.floor((Math.floor(2 * 50 / 5) + 2) * move.power * A / D) / 50 + 2);
  const damage = Math.floor(base * 1.0 * roll * stab * effectiveness);
  return Math.max(1, damage);
}
