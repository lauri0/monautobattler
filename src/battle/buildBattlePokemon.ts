import type { PokemonData, BattlePokemon } from '../models/types';
import { getPokemonPersisted } from '../persistence/userStorage';
import { calcLevel50Stats } from '../utils/statCalc';

export function buildBattlePokemon(pokemonData: PokemonData): BattlePokemon {
  const persisted = getPokemonPersisted(pokemonData.id);
  const level50Stats = calcLevel50Stats(pokemonData.baseStats);

  // Resolve moveset: use persisted 4 move IDs, fall back to top 4 by power
  const moveMap = new Map(pokemonData.availableMoves.map(m => [m.id, m]));
  let moves = persisted.moveset
    .map(id => moveMap.get(id))
    .filter(Boolean) as typeof pokemonData.availableMoves;

  if (moves.length < 4) {
    const sorted = [...pokemonData.availableMoves].sort((a, b) => b.power - a.power);
    moves = sorted.slice(0, 4);
  }

  return {
    data: pokemonData,
    persisted,
    level50Stats,
    moves,
    currentHp: level50Stats.hp,
  };
}
