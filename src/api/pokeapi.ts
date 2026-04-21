import type { PokemonData, Move, TypeName, DamageClass, StatusCondition, MoveEffect, StatChange } from '../models/types';
import {
  addToLoadedRange,
  getMoveLearnSettings,
  getSelectedGameInfo,
  getVariantSettings,
  getAutoDisableBstThreshold,
  getAutoDisableBstMaxThreshold,
  getAutoDisableOverwrite,
  getPokemonPersisted,
  setPokemonPersisted,
  type MoveLearnSettings,
  type GameVersionInfo,
  type VariantSettings,
} from '../persistence/userStorage';
import { buildFetchIds } from './variants';
import { mergeAbilityNames } from '../data/abilitiesStore';

const BASE = 'https://pokeapi.co/api/v2';

// PokeAPI move_learn_method names we map onto our settings toggles.
const LEARN_METHOD_TO_SETTING: Record<string, keyof MoveLearnSettings> = {
  'level-up': 'levelUp',
  'machine': 'machine',
  'tutor': 'tutor',
  'egg': 'egg',
};

// Availability check: "does this Pokemon have at least one move learnable in
// the selected game?" This is more accurate than the regional pokedex, which
// often excludes post-game-obtainable species.
function isPokemonInGame(raw: RawPokemon, versionGroup: string): boolean {
  return raw.moves.some(m =>
    m.version_group_details.some(vgd => vgd.version_group.name === versionGroup)
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

async function saveJsonFile(kind: 'pokemon' | 'move', name: string, body: unknown): Promise<void> {
  await fetch(`/__save-data/${kind}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  });
}

const STATUS_MAP: Record<string, StatusCondition> = {
  burn: 'burn',
  poison: 'poison',
  paralysis: 'paralysis',
  sleep: 'sleep',
  freeze: 'freeze',
};

// Status moves we explicitly support. Any `damage_class === 'status'` move not
// in this table is dropped — PokeAPI's meta is too inconsistent to trust for
// status moves generically.
const STATUS_MOVE_EFFECTS: Record<string, MoveEffect> = {
  'swords-dance': { statChanges: [{ stat: 'attack', change: 2, target: 'user' }], statChance: 0 },
  'agility':      { statChanges: [{ stat: 'speed', change: 2, target: 'user' }], statChance: 0 },
  'amnesia':      { statChanges: [{ stat: 'special-defense', change: 2, target: 'user' }], statChance: 0 },
  'barrier':      { statChanges: [{ stat: 'defense', change: 2, target: 'user' }], statChance: 0 },
  'growl':        { statChanges: [{ stat: 'attack', change: -1, target: 'foe' }], statChance: 0 },
  'leer':         { statChanges: [{ stat: 'defense', change: -1, target: 'foe' }], statChance: 0 },
  'thunder-wave': { ailment: 'paralysis', ailmentChance: 0 },
  'sleep-powder': { ailment: 'sleep', ailmentChance: 0 },
  'poison-powder':{ ailment: 'poison', ailmentChance: 0 },
  'recover':      { heal: 50 },
  'protect':      { protect: true },
  'trick-room':   { fieldEffect: 'trickRoom' },
  'tailwind':     { fieldEffect: 'tailwind' },
  'light-screen': { fieldEffect: 'lightScreen' },
  'reflect':      { fieldEffect: 'reflect' },
  'stealth-rock': { fieldEffect: 'stealthRock' },
  'taunt':        { taunt: true },
  'will-o-wisp':  { ailment: 'burn', ailmentChance: 0 },
  'nasty-plot':   { statChanges: [{ stat: 'special-attack', change: 2, target: 'user' }], statChance: 0 },
  'dragon-dance': { statChanges: [{ stat: 'attack', change: 1, target: 'user' }, { stat: 'speed', change: 1, target: 'user' }], statChance: 0 },
  'calm-mind':    { statChanges: [{ stat: 'special-attack', change: 1, target: 'user' }, { stat: 'special-defense', change: 1, target: 'user' }], statChance: 0 },
  'bulk-up':      { statChanges: [{ stat: 'attack', change: 1, target: 'user' }, { stat: 'defense', change: 1, target: 'user' }], statChance: 0 },
  'iron-defense': { statChanges: [{ stat: 'defense', change: 2, target: 'user' }], statChance: 0 },
  'shell-smash':  { statChanges: [
    { stat: 'attack', change: 2, target: 'user' },
    { stat: 'special-attack', change: 2, target: 'user' },
    { stat: 'speed', change: 2, target: 'user' },
    { stat: 'defense', change: -1, target: 'user' },
    { stat: 'special-defense', change: -1, target: 'user' },
  ], statChance: 0 },
  'parting-shot': { statChanges: [
    { stat: 'attack', change: -1, target: 'foe' },
    { stat: 'special-attack', change: -1, target: 'foe' },
  ], statChance: 0, pivotSwitch: true },
};

async function fetchMoveData(moveUrl: string): Promise<Move | null> {
  try {
    const data = await fetchJson<RawMove>(moveUrl);
    const rawClass = data.damage_class?.name;
    if (!rawClass) return null;

    // Status moves: require an explicit whitelist entry.
    if (rawClass === 'status') {
      const statusEffect = STATUS_MOVE_EFFECTS[data.name];
      if (!statusEffect) return null;
      return {
        id: data.id,
        name: data.name,
        type: data.type.name as TypeName,
        power: 0,
        accuracy: data.accuracy,
        pp: data.pp,
        damageClass: 'status',
        priority: data.priority ?? 0,
        effect: statusEffect,
      };
    }

    const damageClass = rawClass as DamageClass;
    if (!data.power) return null;

    // Build secondary effect if any meaningful data exists
    let effect: MoveEffect | undefined;

    if (data.meta) {
      const m = data.meta;
      const ailmentName = STATUS_MAP[m.ailment?.name ?? ''];
      const hasDrain = m.drain !== 0;
      const hasAilment = !!ailmentName;
      const hasStatChanges = data.stat_changes.length > 0;
      const hasFlinch = m.flinch_chance > 0;
      const hasCritRate = m.crit_rate > 0;
      // Confusion applied to foe: ailment is confusion with a > 0 chance
      const hasConfusion = m.ailment?.name === 'confusion' && m.ailment_chance > 0;

      if (hasDrain || hasAilment || hasStatChanges || hasFlinch || hasCritRate || hasConfusion) {
        effect = {};

        if (hasDrain) {
          effect.drain = m.drain;
        }

        if (hasAilment) {
          effect.ailment = ailmentName;
          effect.ailmentChance = m.ailment_chance;
        }

        if (hasStatChanges) {
          const foeDrop = m.category?.name === 'damage-lower' && m.stat_chance > 0;
          effect.statChanges = data.stat_changes.map(sc => ({
            stat: sc.stat.name as StatChange['stat'],
            change: sc.change,
            target: foeDrop ? 'foe' : 'user',
          } satisfies StatChange));
          effect.statChance = m.stat_chance;
        }

        if (hasFlinch) {
          effect.flinchChance = m.flinch_chance;
        }

        if (hasCritRate) {
          effect.critRate = m.crit_rate;
        }

        if (hasConfusion) {
          effect.confuses = true;
          effect.confusionChance = m.ailment_chance;
        }
      }
    }

    // Fake Out: always-flinch move that only works on the first turn
    if (data.name === 'fake-out') {
      effect = { ...effect, firstTurnOnly: true };
    }

    // Revenge / Avalanche: double base power if user was hit by the target earlier this turn
    if (data.name === 'revenge' || data.name === 'avalanche') {
      effect = { ...effect, doublePowerIfHit: true };
    }

    // Hex: doubles base power if the target has a major status condition
    if (data.name === 'hex') {
      effect = { ...effect, doublePowerIfTargetStatus: true };
    }

    // Freeze-Dry: super effective against Water in addition to normal Ice effectiveness
    if (data.name === 'freeze-dry') {
      effect = { ...effect, superEffectiveAgainst: ['water'] };
    }

    // Tri Attack: 20% chance to confuse the target
    if (data.name === 'tri-attack') {
      effect = { ...effect, confuses: true, confusionChance: 20 };
    }

    // Foul Play: uses the defender's Attack stat for damage
    if (data.name === 'foul-play') {
      effect = { ...effect, useFoeAttack: true };
    }

    // Outrage / Petal Dance / Thrash: always confuse the user after use
    if (data.name === 'outrage' || data.name === 'petal-dance' || data.name === 'thrash') {
      effect = { ...effect, confusesUser: true };
    }

    // U-turn / Volt Switch / Flip Turn: user switches out after hitting
    if (data.name === 'u-turn' || data.name === 'volt-switch' || data.name === 'flip-turn') {
      effect = { ...effect, pivotSwitch: true };
    }

    // Brick Break: removes Reflect and Light Screen on the defender's side before hitting
    if (data.name === 'brick-break') {
      effect = { ...effect, removesScreens: true };
    }

    return {
      id: data.id,
      name: data.name,
      type: data.type.name as TypeName,
      power: data.power,
      accuracy: data.accuracy,
      pp: data.pp,
      damageClass,
      priority: data.priority ?? 0,
      ...(effect ? { effect } : {}),
    };
  } catch {
    return null;
  }
}

export async function fetchAndStorePokemon(
  id: number,
  onProgress?: (msg: string) => void,
  learnSettings?: MoveLearnSettings,
  game?: GameVersionInfo,
  variants?: VariantSettings
): Promise<PokemonData | null> {
  onProgress?.(`Fetching Pokemon #${id}...`);
  const raw = await fetchJson<RawPokemon>(`${BASE}/pokemon/${id}`);
  const settings = learnSettings ?? getMoveLearnSettings();
  const gameInfo = game ?? getSelectedGameInfo();
  const variantInfo = variants ?? getVariantSettings();
  const versionGroup = gameInfo.versionGroup;

  // Skip Pokemon not available in the selected game.
  if (!isPokemonInGame(raw, versionGroup)) return null;

  // Only keep moves learnable in the selected game via one of the enabled learn methods.
  const filteredEntries = raw.moves.filter(m =>
    m.version_group_details.some(vgd => {
      if (vgd.version_group.name !== versionGroup) return false;
      const key = LEARN_METHOD_TO_SETTING[vgd.move_learn_method.name];
      return key !== undefined && settings[key];
    })
  );

  const moveUrls = Array.from(new Set(filteredEntries.map(m => m.move.url)));

  onProgress?.(`Fetching moves for ${raw.name} (${moveUrls.length} moves)...`);
  const moveResults = await Promise.allSettled(
    moveUrls.map(url => fetchMoveData(url))
  );

  const moves: Move[] = [];
  for (const result of moveResults) {
    if (result.status === 'fulfilled' && result.value !== null) {
      moves.push(result.value);
      await saveJsonFile('move', result.value.name, result.value);
    }
  }

  // Sort by power descending for default moveset selection
  moves.sort((a, b) => b.power - a.power);

  if (variantInfo.swapMegaDrain) {
    const idx = moves.findIndex(m => m.name === 'mega-drain');
    if (idx !== -1) {
      const gigaDrain = await fetchMoveData(`${BASE}/move/giga-drain`);
      if (gigaDrain) {
        moves[idx] = gigaDrain;
        await saveJsonFile('move', gigaDrain.name, gigaDrain);
      }
    }
  }

  const baseStats = parseStats(raw.stats);
  const localSpriteUrl = `/sprites/${id}.png`;

  // Abilities: LGPE has none; other games pull the slot-ordered list from the
  // pokemon response. The full set of encountered names is maintained in a
  // single `public/data/abilities/all.json`.
  const abilities: string[] = gameInfo.id === 'lgpe'
    ? []
    : [...raw.abilities].sort((a, b) => a.slot - b.slot).map(a => a.ability.name);

  const pokemon: PokemonData = {
    id: raw.id,
    name: raw.name,
    types: raw.types.map((t: RawTypeEntry) => t.type.name as TypeName),
    baseStats,
    spriteUrl: localSpriteUrl,
    availableMoves: moves,
    abilities,
  };

  await saveJsonFile('pokemon', pokemon.name, {
    id: pokemon.id,
    name: pokemon.name,
    types: pokemon.types,
    baseStats: pokemon.baseStats,
    spriteUrl: pokemon.spriteUrl,
    moves: moves.map(m => m.name),
    abilities,
  });

  if (abilities.length > 0) {
    await mergeAbilityNames(abilities);
  }

  const bst = Object.values(baseStats).reduce((sum, v) => sum + v, 0);
  const bstThreshold = getAutoDisableBstThreshold();
  const bstMaxThreshold = getAutoDisableBstMaxThreshold();
  const overwrite = getAutoDisableOverwrite();
  const existing = getPokemonPersisted(pokemon.id);
  const isNew = existing.wins === 0 && existing.losses === 0 && existing.elo === 1500 && existing.moveset.length === 0 && !existing.disabled;
  if (overwrite || isNew) {
    setPokemonPersisted({ ...existing, disabled: bst < bstThreshold || bst > bstMaxThreshold });
  }

  await ensureSpriteOnDisk(id, raw.name, onProgress);

  return pokemon;
}

// Download the sprite from PokeAPI and POST it to the Vite dev middleware,
// which writes it to public/sprites/{id}.png so it can be committed. Skips the
// network fetch if the file is already present locally.
async function ensureSpriteOnDisk(
  id: number,
  name: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  try {
    const check = await fetch(`/__sprite-exists/${id}`);
    if (check.ok) {
      const { exists } = (await check.json()) as { exists: boolean };
      if (exists) return;
    }
  } catch {
    // Fall through to download
  }

  try {
    onProgress?.(`Fetching sprite for ${name}...`);
    const remoteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    const imgRes = await fetch(remoteUrl);
    if (!imgRes.ok) return;
    const blob = await imgRes.blob();
    await fetch(`/__save-sprite/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
  } catch {
    // Sprite fetch/save failure is non-fatal
  }
}

export async function fetchAndStoreRange(
  from: number,
  to: number,
  onProgress?: (msg: string, done: number, total: number) => void
): Promise<{ loaded: number[]; skipped: number[] }> {
  const settings = getMoveLearnSettings();
  const game = getSelectedGameInfo();
  const variantSettings = getVariantSettings();
  const baseIds = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const allIds = buildFetchIds(baseIds, variantSettings);
  const loaded: number[] = [];
  const skipped: number[] = [];
  let done = 0;

  for (const id of allIds) {
    const result = await fetchAndStorePokemon(
      id,
      (msg) => onProgress?.(msg, done, allIds.length),
      settings,
      game,
      variantSettings
    );
    if (result) {
      loaded.push(id);
      onProgress?.(`Loaded #${id}`, done + 1, allIds.length);
    } else {
      skipped.push(id);
      onProgress?.(`Skipped #${id} (not in ${game.label})`, done + 1, allIds.length);
    }
    done++;
  }

  if (loaded.length > 0) addToLoadedRange(loaded);
  return { loaded, skipped };
}

export async function repairMissingAbilities(
  ids: number[],
  onProgress?: (msg: string, done: number, total: number) => void
): Promise<{ repaired: number[]; skipped: number[] }> {
  const repaired: number[] = [];
  const skipped: number[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    onProgress?.(`Checking #${id}...`, i, ids.length);
    try {
      const raw = await fetchJson<RawPokemon>(`${BASE}/pokemon/${id}`);
      const abilities = [...raw.abilities].sort((a, b) => a.slot - b.slot).map(a => a.ability.name);

      const localRes = await fetch(`/data/pokemon/${raw.name}.json?t=${Date.now()}`);
      if (!localRes.ok) { skipped.push(id); continue; }

      const existing = await localRes.json() as Record<string, unknown>;
      const existingAbilities = existing['abilities'] as string[] | undefined;
      if (existingAbilities && existingAbilities.length > 0) { skipped.push(id); continue; }

      await saveJsonFile('pokemon', raw.name, { ...existing, abilities });
      if (abilities.length > 0) await mergeAbilityNames(abilities);
      repaired.push(id);
      onProgress?.(`Repaired ${raw.name}`, i + 1, ids.length);
    } catch {
      skipped.push(id);
    }
  }

  return { repaired, skipped };
}

function parseStats(stats: RawStat[]): PokemonData['baseStats'] {
  const get = (name: string) => stats.find(s => s.stat.name === name)?.base_stat ?? 0;
  return {
    hp: get('hp'),
    attack: get('attack'),
    defense: get('defense'),
    specialAttack: get('special-attack'),
    specialDefense: get('special-defense'),
    speed: get('speed'),
  };
}

// Raw API types
interface RawPokemon {
  id: number;
  name: string;
  types: RawTypeEntry[];
  stats: RawStat[];
  moves: RawMoveEntry[];
  abilities: RawAbilityEntry[];
}
interface RawAbilityEntry {
  ability: { name: string; url: string };
  is_hidden: boolean;
  slot: number;
}
interface RawTypeEntry { type: { name: string } }
interface RawStat { stat: { name: string }; base_stat: number }
interface RawMoveEntry {
  move: { name: string; url: string };
  version_group_details: Array<{
    level_learned_at: number;
    version_group: { name: string; url: string };
    move_learn_method: { name: string; url: string };
  }>;
}
interface RawMove {
  id: number;
  name: string;
  type: { name: string };
  power: number | null;
  accuracy: number | null;
  pp: number;
  damage_class: { name: string } | null;
  priority: number;
  stat_changes: Array<{ change: number; stat: { name: string } }>;
  meta: {
    ailment: { name: string };
    ailment_chance: number;
    drain: number;
    stat_chance: number;
    flinch_chance: number;
    crit_rate: number;
    category: { name: string } | null;
  } | null;
}
