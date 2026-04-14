import type { PokemonData, Move, TypeName, DamageClass, StatusCondition, MoveEffect, StatChange } from '../models/types';
import { savePokemonData, saveMove, saveSprite } from '../persistence/db';
import { addToLoadedRange } from '../persistence/userStorage';

const BASE = 'https://pokeapi.co/api/v2';

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
  onProgress?: (msg: string) => void
): Promise<PokemonData> {
  onProgress?.(`Fetching Pokemon #${id}...`);
  const raw = await fetchJson<RawPokemon>(`${BASE}/pokemon/${id}`);

  // Collect unique move URLs
  const moveUrls = Array.from(
    new Set(raw.moves.map((m: RawMoveEntry) => m.move.url))
  );

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
  const spriteUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

  const pokemon: PokemonData = {
    id: raw.id,
    name: raw.name,
    types: raw.types.map((t: RawTypeEntry) => t.type.name as TypeName),
    baseStats,
    spriteUrl,
    availableMoves: moves,
  };

  await savePokemonData(pokemon);

  // Fetch and cache sprite blob
  try {
    onProgress?.(`Fetching sprite for ${raw.name}...`);
    const imgRes = await fetch(spriteUrl);
    if (imgRes.ok) {
      const blob = await imgRes.blob();
      await saveSprite(id, blob);
    }
  } catch {
    // Sprite fetch failure is non-fatal
  }

  return pokemon;
}

export async function fetchAndStoreRange(
  from: number,
  to: number,
  onProgress?: (msg: string, done: number, total: number) => void
): Promise<void> {
  const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  let done = 0;

  for (const id of ids) {
    await fetchAndStorePokemon(id, (msg) => onProgress?.(msg, done, ids.length));
    done++;
    onProgress?.(`Loaded #${id}`, done, ids.length);
  }

  addToLoadedRange(ids);
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
interface RawMoveEntry { move: { url: string } }
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
