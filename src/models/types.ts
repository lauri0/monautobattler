export type DamageClass = 'physical' | 'special';

export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface Move {
  id: number;
  name: string;
  type: TypeName;
  power: number;
  accuracy: number | null;
  pp: number;
  damageClass: DamageClass;
  priority: number;
}

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface Level50Stats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export interface PokemonData {
  id: number;
  name: string;
  types: TypeName[];
  baseStats: BaseStats;
  spriteUrl: string;
  availableMoves: Move[];
}

export interface PokemonPersisted {
  id: number;
  elo: number;
  wins: number;
  losses: number;
  moveset: number[]; // 4 move IDs
  disabled: boolean;
}

export interface BattlePokemon {
  data: PokemonData;
  persisted: PokemonPersisted;
  level50Stats: Level50Stats;
  moves: Move[];
  currentHp: number;
}

export interface TurnEvent {
  turn: number;
  attackerName: string;
  defenderName: string;
  moveName: string;
  moveType: TypeName;
  damage: number;
  isCrit: boolean;
  missed: boolean;
  effectiveness: number; // 0, 0.25, 0.5, 1, 2, 4
  attackerHpAfter: number;
  defenderHpAfter: number;
}

export interface BattleResult {
  winner: BattlePokemon;
  loser: BattlePokemon;
  log: TurnEvent[];
}

export interface EloChange {
  pokemonId: number;
  oldElo: number;
  newElo: number;
}
