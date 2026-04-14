export type DamageClass = 'physical' | 'special';

export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export type StatusCondition = 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze';

export type StatStageName = 'attack' | 'defense' | 'special-attack' | 'special-defense' | 'speed';

export interface StatChange {
  stat: StatStageName;
  change: number;
  target: 'user' | 'foe';
}

export interface MoveEffect {
  drain?: number;           // % of damage dealt: positive = heal user, negative = recoil
  statChanges?: StatChange[];
  statChance?: number;      // 0 = always, 1–100 = percentage chance
  ailment?: StatusCondition;
  ailmentChance?: number;   // 0 = always, 1–100 = percentage chance
  flinchChance?: number;    // 1–100 percentage chance to flinch the target
  critRate?: number;        // extra crit stages: 1 = high (~1/8), 2 = very high (~1/2)
  confuses?: boolean;       // true if move can confuse the target
  confusionChance?: number; // 1–100 percentage chance; 0 = always
  firstTurnOnly?: boolean;  // move fails if not the first turn (Fake Out)
}

export interface StatStages {
  attack: number;
  defense: number;
  'special-attack': number;
  'special-defense': number;
  speed: number;
}

export interface Move {
  id: number;
  name: string;
  type: TypeName;
  power: number;
  accuracy: number | null;
  pp: number;
  damageClass: DamageClass;
  priority: number;
  effect?: MoveEffect;
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
  statusCondition?: StatusCondition;
  sleepTurnsUsed?: number;    // turns elapsed while asleep (0-based)
  frozenTurnsUsed?: number;   // turns elapsed while frozen (0-based)
  confused?: boolean;
  confusionTurnsLeft?: number;
  statStages: StatStages;
}

export type TurnEvent =
  | {
      kind: 'attack';
      turn: number;
      attackerName: string;
      defenderName: string;
      moveName: string;
      moveType: TypeName;
      damage: number;
      isCrit: boolean;
      missed: boolean;
      effectiveness: number;
      attackerHpAfter: number;
      defenderHpAfter: number;
    }
  | { kind: 'recoil'; turn: number; pokemonName: string; damage: number; hpAfter: number }
  | { kind: 'drain'; turn: number; pokemonName: string; healed: number; hpAfter: number }
  | { kind: 'stat_change'; turn: number; pokemonName: string; stat: StatStageName; change: number; newStage: number }
  | { kind: 'status_applied'; turn: number; pokemonName: string; condition: StatusCondition }
  | { kind: 'status_damage'; turn: number; pokemonName: string; condition: StatusCondition; damage: number; hpAfter: number }
  | { kind: 'cant_move'; turn: number; pokemonName: string; reason: StatusCondition | 'flinch' }
  | { kind: 'status_cured'; turn: number; pokemonName: string; condition: StatusCondition }
  | { kind: 'confused'; turn: number; pokemonName: string }
  | { kind: 'confusion_hit'; turn: number; pokemonName: string; damage: number; hpAfter: number }
  | { kind: 'confusion_end'; turn: number; pokemonName: string }
  | { kind: 'move_failed'; turn: number; pokemonName: string; moveName: string };

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

export interface AIStrategy {
  selectMove(attacker: BattlePokemon, defender: BattlePokemon): Move;
}
