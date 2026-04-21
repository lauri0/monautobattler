import type { PokemonData, Move } from '../models/types';

interface PokemonFileShape {
  id: number;
  name: string;
  types: PokemonData['types'];
  baseStats: PokemonData['baseStats'];
  spriteUrl: string;
  moves: string[];
  abilities?: string[];
}

async function listFiles(kind: 'pokemon' | 'move'): Promise<string[]> {
  const res = await fetch(`/__list-data/${kind}`);
  if (!res.ok) return [];
  const { files } = (await res.json()) as { files: string[] };
  return files;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function loadAllMoves(): Promise<Move[]> {
  const moveFiles = await listFiles('move');
  return Promise.all(moveFiles.map(f => fetchJson<Move>(`/data/moves/${f}`)));
}

export async function loadAllPokemonData(): Promise<PokemonData[]> {
  const moves = await loadAllMoves();
  const moveByName = new Map(moves.map(m => [m.name, m]));

  const pokemonFiles = await listFiles('pokemon');
  const raw = await Promise.all(
    pokemonFiles.map(f => fetchJson<PokemonFileShape>(`/data/pokemon/${f}`))
  );

  const pokemon: PokemonData[] = raw.map(p => {
    const resolved: Move[] = [];
    for (const name of p.moves) {
      const move = moveByName.get(name);
      if (move) resolved.push(move);
      else console.warn(`[loadLocalData] ${p.name}: unknown move "${name}"`);
    }
    return {
      id: p.id,
      name: p.name,
      types: p.types,
      baseStats: p.baseStats,
      spriteUrl: p.spriteUrl,
      availableMoves: resolved,
      abilities: p.abilities ?? [],
    };
  });

  pokemon.sort((a, b) => a.id - b.id);
  return pokemon;
}
