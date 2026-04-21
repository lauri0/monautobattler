import type { PokemonData, BattlePokemon } from '../models/types';
import { getPokemonPersisted, getAllowedMoveIds } from '../persistence/userStorage';
import { calcLevel50Stats } from '../utils/statCalc';

export function buildBattlePokemon(pokemonData: PokemonData): BattlePokemon {
  const persisted = getPokemonPersisted(pokemonData.id);
  const level50Stats = calcLevel50Stats(pokemonData.baseStats);
  const allowedIds = getAllowedMoveIds();

  // Resolve moveset: use persisted IDs filtered to allowed moves, fall back to top 4 allowed by power
  const moveMap = new Map(pokemonData.availableMoves.map(m => [m.id, m]));
  let moves = persisted.moveset
    .map(id => moveMap.get(id))
    .filter(m => m && allowedIds.includes(m.id)) as typeof pokemonData.availableMoves;

  if (moves.length < 4) {
    const used = new Set(moves.map(m => m.id));
    const sorted = [...pokemonData.availableMoves]
      .filter(m => allowedIds.includes(m.id))
      .sort((a, b) => b.power - a.power);
    for (const m of sorted) {
      if (moves.length >= 4) break;
      if (!used.has(m.id)) moves.push(m);
    }
  }

  // If no allowed moves remain, the battle engine falls back to Struggle via usableMoves()

  const abilities = pokemonData.abilities ?? [];
  const selected = persisted.selectedAbility && abilities.includes(persisted.selectedAbility)
    ? persisted.selectedAbility
    : abilities[0];

  return {
    data: pokemonData,
    persisted,
    level50Stats,
    moves,
    currentHp: level50Stats.hp,
    statStages: { attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0 },
    justSwitchedIn: true,
    ability: selected,
  };
}
