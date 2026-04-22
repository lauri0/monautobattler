import type { BaseStats, Level50Stats } from '../models/types';

export function calcLevel50Stats(base: BaseStats): Level50Stats {
  const calc = (b: number) => Math.floor(((2 * b + 31) * 50) / 100) + 5;
  const calcHp = (b: number) => Math.floor(((2 * b + 31) * 50) / 100) + 50 + 10;
  return {
    hp: calcHp(base.hp),
    attack: calc(base.attack),
    defense: calc(base.defense),
    specialAttack: calc(base.specialAttack),
    specialDefense: calc(base.specialDefense),
    speed: calc(base.speed),
  };
}
