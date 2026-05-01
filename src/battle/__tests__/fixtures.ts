import type {
  BattlePokemon,
  Move,
  PokemonData,
  PokemonPersisted,
  Level50Stats,
  StatStages,
  TypeName,
} from '../../models/types';

const ZERO_STAGES: StatStages = {
  attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0, accuracy: 0, evasion: 0,
};

const DEFAULT_STATS: Level50Stats = {
  hp: 200,
  attack: 100,
  defense: 100,
  specialAttack: 100,
  specialDefense: 100,
  speed: 100,
};

export interface PokemonOverrides {
  name?: string;
  id?: number;
  types?: TypeName[];
  stats?: Partial<Level50Stats>;
  currentHp?: number;
  moves?: Move[];
  statStages?: Partial<StatStages>;
  statusCondition?: BattlePokemon['statusCondition'];
  sleepTurnsUsed?: number;
  frozenTurnsUsed?: number;
  confused?: boolean;
  confusionTurnsLeft?: number;
  lockedMove?: BattlePokemon['lockedMove'];
  protectedThisTurn?: boolean;
  lastMoveProtected?: boolean;
  ability?: string;
  abilities?: string[];
  flashFireActive?: boolean;
  throatChopTurns?: number;
}

export function makePokemon(overrides: PokemonOverrides = {}): BattlePokemon {
  const id = overrides.id ?? 1;
  const name = overrides.name ?? 'testmon';
  const types = overrides.types ?? ['normal'];
  const stats: Level50Stats = { ...DEFAULT_STATS, ...(overrides.stats ?? {}) };
  const moves = overrides.moves ?? [];

  const data: PokemonData = {
    id,
    name,
    types,
    baseStats: {
      hp: stats.hp,
      attack: stats.attack,
      defense: stats.defense,
      specialAttack: stats.specialAttack,
      specialDefense: stats.specialDefense,
      speed: stats.speed,
    },
    spriteUrl: '',
    availableMoves: moves,
    abilities: overrides.abilities ?? (overrides.ability ? [overrides.ability] : []),
  };
  const persisted: PokemonPersisted = {
    id,
    elo: 1000,
    wins: 0,
    losses: 0,
    moveset: moves.map(m => m.id).slice(0, 4),
    disabled: false,
  };
  return {
    data,
    persisted,
    level50Stats: stats,
    moves,
    currentHp: overrides.currentHp ?? stats.hp,
    statusCondition: overrides.statusCondition,
    sleepTurnsUsed: overrides.sleepTurnsUsed,
    frozenTurnsUsed: overrides.frozenTurnsUsed,
    confused: overrides.confused,
    confusionTurnsLeft: overrides.confusionTurnsLeft,
    lockedMove: overrides.lockedMove,
    protectedThisTurn: overrides.protectedThisTurn,
    lastMoveProtected: overrides.lastMoveProtected,
    ability: overrides.ability,
    flashFireActive: overrides.flashFireActive,
    throatChopTurns: overrides.throatChopTurns,
    statStages: { ...ZERO_STAGES, ...(overrides.statStages ?? {}) },
  };
}

let _moveIdCounter = 1000;
export function makeMove(overrides: Partial<Move> = {}): Move {
  return {
    id: overrides.id ?? _moveIdCounter++,
    name: overrides.name ?? 'testmove',
    type: overrides.type ?? 'normal',
    power: overrides.power ?? 60,
    accuracy: overrides.accuracy ?? 100,
    pp: overrides.pp ?? 10,
    damageClass: overrides.damageClass ?? 'physical',
    priority: overrides.priority ?? 0,
    effect: overrides.effect,
  };
}
