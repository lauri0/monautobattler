import type { PokemonData, Move, TypeName, DamageClass } from '../models/types';
import { savePokemonData, saveMove, saveSprite } from '../persistence/db';
import { addToLoadedRange } from '../persistence/userStorage';

const BASE = 'https://pokeapi.co/api/v2';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json() as Promise<T>;
}

async function fetchMoveData(moveUrl: string): Promise<Move | null> {
  try {
    const data = await fetchJson<RawMove>(moveUrl);
    const rawClass = data.damage_class?.name;
    if (!rawClass || rawClass === 'status') return null;
    const damageClass = rawClass as DamageClass;
    if (!data.power) return null;

    return {
      id: data.id,
      name: data.name,
      type: data.type.name as TypeName,
      power: data.power,
      accuracy: data.accuracy,
      pp: data.pp,
      damageClass,
      priority: data.priority ?? 0,
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
}
