import type { PokemonData, Move, TypeName, DamageClass, StatusCondition, MoveEffect, StatChange } from '../models/types';
import { savePokemonData, saveMove } from '../persistence/db';
import {
  addToLoadedRange,
  getMoveLearnSettings,
  getSelectedGameInfo,
  type MoveLearnSettings,
  type GameVersionInfo,
} from '../persistence/userStorage';

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

const STATUS_MAP: Record<string, StatusCondition> = {
  burn: 'burn',
  poison: 'poison',
  paralysis: 'paralysis',
  sleep: 'sleep',
  freeze: 'freeze',
};

async function fetchMoveData(moveUrl: string): Promise<Move | null> {
  try {
    const data = await fetchJson<RawMove>(moveUrl);
    const rawClass = data.damage_class?.name;
    if (!rawClass || rawClass === 'status') return null;
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
  game?: GameVersionInfo
): Promise<PokemonData | null> {
  onProgress?.(`Fetching Pokemon #${id}...`);
  const raw = await fetchJson<RawPokemon>(`${BASE}/pokemon/${id}`);
  const settings = learnSettings ?? getMoveLearnSettings();
  const gameInfo = game ?? getSelectedGameInfo();
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
      await saveMove(result.value);
    }
  }

  // Sort by power descending for default moveset selection
  moves.sort((a, b) => b.power - a.power);

  const baseStats = parseStats(raw.stats);
  const localSpriteUrl = `/sprites/${id}.png`;

  const pokemon: PokemonData = {
    id: raw.id,
    name: raw.name,
    types: raw.types.map((t: RawTypeEntry) => t.type.name as TypeName),
    baseStats,
    spriteUrl: localSpriteUrl,
    availableMoves: moves,
  };

  await savePokemonData(pokemon);
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
  const allIds = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const loaded: number[] = [];
  const skipped: number[] = [];
  let done = 0;

  for (const id of allIds) {
    const result = await fetchAndStorePokemon(
      id,
      (msg) => onProgress?.(msg, done, allIds.length),
      settings,
      game
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
