export type DamageClass = 'physical' | 'special' | 'status';

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
  doublePowerIfHit?: boolean; // doubles base power if user took damage from foe earlier this turn (Revenge)
  doublePowerIfTargetStatus?: boolean; // doubles base power if target has a major status condition (Hex)
  superEffectiveAgainst?: TypeName[];  // extra types this move is super effective against (Freeze-Dry vs Water)
  useFoeAttack?: boolean;  // use the defender's Attack stat for damage instead of the attacker's (Foul Play)
  useOwnDefense?: boolean; // use the attacker's Defense stat as the attack stat (Body Press)
  ignoreDefenseStages?: boolean; // treat the defender's defense stat stage as 0 (Sacred Sword, Chip Away)
  hitsExactly?: number;   // hit exactly N times, each roll independently (Dual Wingbeat, Dual Chop)
  hitsVariable?: boolean; // hit 2–5 times with 3/8, 3/8, 1/8, 1/8 distribution (Icicle Spear, Rock Blast, …)
  escalatingHits?: boolean; // Triple Axel / Triple Kick: N-th hit uses power * N, each hit rolls accuracy independently and the sequence ends on a miss. Skill Link guarantees all hits.
  confusesUser?: boolean;  // confuses the user after hitting (Outrage, Petal Dance, Thrash)
  pivotSwitch?: boolean;   // user switches out after hitting (U-turn, Volt Switch, Flip Turn)
  heal?: number;           // % of user's max HP to heal (Recover = 50)
  protect?: boolean;       // marks Protect
  fieldEffect?: FieldEffectKind; // marks a field/side-condition-setting status move
  taunt?: boolean;         // applies Taunt to the target (blocks status moves for N turns)
  throatChop?: boolean;    // prevents the target from using sound moves for 2 turns (Throat Chop)
  removesScreens?: boolean; // removes Reflect and Light Screen on defender's side before the hit (Brick Break)
  failsIfTargetNotAttacking?: boolean; // fails if the target is not using a damaging move this turn (Sucker Punch)
  clearsHazards?: boolean; // removes entry hazards (Stealth Rock) from user's side after hitting (Rapid Spin)
  crashOnMiss?: boolean;  // user takes 1/2 max HP crash damage when this move misses (Supercell Slam)
}

export type FieldEffectKind =
  | 'trickRoom'
  | 'tailwind'
  | 'lightScreen'
  | 'reflect'
  | 'stealthRock'
  | 'spikes'
  | 'toxicSpikes';

export type WeatherKind = 'sun' | 'rain' | 'sandstorm' | 'snow';

export type TerrainKind = 'grassy' | 'electric' | 'psychic' | 'misty';

export interface SideFieldState {
  tailwindTurns: number;
  lightScreenTurns: number;
  reflectTurns: number;
  stealthRock: boolean;
  spikes: number;        // 0–3 layers
  toxicSpikes: boolean;  // single layer (no badly-poison variant)
}

export interface FieldState {
  trickRoomTurns: number;
  weather?: WeatherKind;
  weatherTurns: number; // 0 when no weather is active
  terrain?: TerrainKind;
  terrainTurns: number; // 0 when no terrain is active
  sides: [SideFieldState, SideFieldState];
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

export type AbilityId = string; // kebab-case, matches PokeAPI `ability.name`

export interface PokemonData {
  id: number;
  name: string;
  types: TypeName[];
  baseStats: BaseStats;
  spriteUrl: string;
  availableMoves: Move[];
  abilities: AbilityId[]; // ordered by PokeAPI slot; empty for LGPE
}

export interface PokemonPersisted {
  id: number;
  elo: number;
  wins: number;
  losses: number;
  moveset: number[]; // 4 move IDs
  disabled: boolean;
  selectedAbility?: AbilityId;
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
  // Forced-move lock (Outrage, Petal Dance, Thrash). turnsLeft is the number
  // of additional forced turns AFTER the current turn. When it ticks to 0 the
  // lock clears and the user becomes confused.
  lockedMove?: { moveId: number; turnsLeft: number };
  // Protect: set for the duration of the turn when Protect successfully resolves.
  // Cleared at end of turn. Blocks any subsequent damaging move this turn.
  protectedThisTurn?: boolean;
  // True iff the pokemon's last move was a successful Protect. Triggers the
  // 50% consecutive-use failure roll on the next attempt.
  lastMoveProtected?: boolean;
  // Taunt: remaining turns during which the pokemon cannot select status moves.
  // 0/undefined = not taunted. Decremented at end of turn.
  tauntTurns?: number;
  // Throat Chop: remaining turns during which the pokemon cannot use sound moves.
  // 0/undefined = not silenced. Decremented at end of turn.
  throatChopTurns?: number;
  // True on a pokemon's first turn on the field (start of battle, or fresh after
  // switching in). Cleared at end of turn. Fake Out uses this gate.
  justSwitchedIn?: boolean;
  ability?: AbilityId;
  // Flash Fire: true once the pokemon has absorbed at least one Fire-type move.
  flashFireActive?: boolean;
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
      damageClass: DamageClass;
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
  | { kind: 'move_failed'; turn: number; pokemonName: string; moveName: string }
  | { kind: 'heal'; turn: number; pokemonName: string; healed: number; hpAfter: number }
  | { kind: 'protected'; turn: number; pokemonName: string }
  | { kind: 'protect_blocked'; turn: number; attackerName: string; defenderName: string; moveName: string }
  | { kind: 'field_set'; turn: number; effect: FieldEffectKind; side?: SideIndex; turns: number; pokemonName: string }
  | { kind: 'field_expired'; turn: number; effect: FieldEffectKind; side?: SideIndex }
  | { kind: 'stealth_rock_damage'; turn: number; pokemonName: string; damage: number; hpAfter: number }
  | { kind: 'spikes_damage'; turn: number; pokemonName: string; damage: number; hpAfter: number; layers: number }
  | { kind: 'toxic_spikes_poison'; turn: number; pokemonName: string }
  | { kind: 'toxic_spikes_absorbed'; turn: number; pokemonName: string }
  | { kind: 'taunted'; turn: number; pokemonName: string; turns: number }
  | { kind: 'taunt_end'; turn: number; pokemonName: string }
  | { kind: 'throat_chopped'; turn: number; pokemonName: string; turns: number }
  | { kind: 'throat_chop_end'; turn: number; pokemonName: string }
  | { kind: 'ability_triggered'; turn: number; pokemonName: string; ability: AbilityId }
  | { kind: 'weather_set'; turn: number; weather: WeatherKind; turns: number; pokemonName: string }
  | { kind: 'weather_expired'; turn: number; weather: WeatherKind }
  | { kind: 'weather_damage'; turn: number; pokemonName: string; weather: WeatherKind; damage: number; hpAfter: number }
  | { kind: 'terrain_set'; turn: number; terrain: TerrainKind; turns: number; pokemonName: string }
  | { kind: 'terrain_expired'; turn: number; terrain: TerrainKind }
  | { kind: 'terrain_heal'; turn: number; pokemonName: string; healed: number; hpAfter: number }
  | { kind: 'crash'; turn: number; pokemonName: string; damage: number; hpAfter: number };

export interface BattleResult {
  winner: BattlePokemon;
  loser: BattlePokemon;
  log: TurnEvent[];
}

export interface DamageStat {
  physical: number;  // damage dealt to enemies via physical moves
  special: number;   // damage dealt to enemies via special moves
  other: number;     // status/weather/hazard/confusion damage dealt to enemies
  recoil: number;    // self-damage from recoil
  heal: number;      // all HP recovered (drain, Recover/Roost, Grassy Terrain)
}

export type MatchDamageSummary = Array<{ pokemonId: number } & DamageStat>;

export interface EloChange {
  pokemonId: number;
  oldElo: number;
  newElo: number;
}

export interface AIStrategy {
  // turnNumber is the current battle turn (1-based). Optional for back-compat;
  // AIs that model first-turn-only moves should use it to prune correctly.
  // opts.defenderScreens, when present, lets strategies down-weight moves that
  // are halved by an active Reflect / Light Screen on the defender's side.
  selectMove(
    attacker: BattlePokemon,
    defender: BattlePokemon,
    turnNumber?: number,
    opts?: { defenderScreens?: { reflect?: boolean; lightScreen?: boolean } },
  ): Move;
}

// ── 4v4 Team Battle Types ──

export type TeamSlotIndex = 0 | 1 | 2 | 3;
export type SideIndex = 0 | 1;

export interface Team {
  pokemon: BattlePokemon[];      // length 4
  activeIdx: TeamSlotIndex;
}

export type TeamAction =
  | { kind: 'move'; move: Move }
  | { kind: 'switch'; targetIdx: TeamSlotIndex };

export type TeamBattlePhase = 'choose' | 'replace0' | 'replace1' | 'replaceBoth' | 'pivot0' | 'pivot1';

export interface TeamBattleState {
  teams: [Team, Team];
  turn: number;
  phase: TeamBattlePhase;
  field: FieldState;
  // During pivot0/pivot1, holds the opponent's still-to-resolve attack (if any).
  // The opponent attack is resolved against the new active after the pivoting
  // side picks a replacement. Cleared once the turn finishes.
  pendingAttack?: { side: SideIndex; move: Move };
}

export type TeamTurnEvent =
  | ({ side: SideIndex } & TurnEvent)
  | { kind: 'switch'; turn: number; side: SideIndex; outName: string; inName: string };

export interface TeamBattleResult {
  winner: SideIndex;
  finalState: TeamBattleState;
  log: TeamTurnEvent[];
}

export interface TeamAIStrategy {
  selectAction(state: TeamBattleState, side: SideIndex): TeamAction;
}

export interface TeamEvaluator {
  // value ∈ [-1, +1] from `side`'s perspective.
  evaluate(state: TeamBattleState, side: SideIndex): { value: number; priors?: Map<string, number> };
}

// ── Tournament Types ──

export interface TournamentPokemon {
  id: number;
  name: string;
  spriteUrl: string;
  types: TypeName[];
}

export interface GroupStanding {
  pokemon: TournamentPokemon;
  played: number;
  wins: number;
  losses: number;
  points: number;
}

export interface TournamentGroup {
  label: string;
  members: TournamentPokemon[];
  standings: GroupStanding[];
  matches: GroupMatch[];
}

export interface GroupMatch {
  pokemonA: TournamentPokemon;
  pokemonB: TournamentPokemon;
  winnerId: number | null;
}

export interface KnockoutMatch {
  round: 'ro16' | 'quarter' | 'semi' | 'third' | 'final';
  slot: number;
  pokemonA: TournamentPokemon | null;
  pokemonB: TournamentPokemon | null;
  winnerId: number | null;
  loserId: number | null;
}

export interface TournamentState {
  phase: 'group' | 'knockout' | 'finished';
  groups: TournamentGroup[];
  knockoutMatches: KnockoutMatch[];
  currentMatchIndex: number;
  champion: TournamentPokemon | null;
  runnerUp: TournamentPokemon | null;
  thirdPlace: TournamentPokemon | null;
}
