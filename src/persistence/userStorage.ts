import type { PokemonPersisted } from '../models/types';

const POKEMON_STATS_KEY = 'pokemon_stats';
const LOADED_RANGE_KEY = 'loaded_range';

export interface LoadedRange {
  min: number;
  max: number;
  ids: number[];
}

function loadAllStats(): Record<number, PokemonPersisted> {
  try {
    const raw = localStorage.getItem(POKEMON_STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllStats(stats: Record<number, PokemonPersisted>): void {
  localStorage.setItem(POKEMON_STATS_KEY, JSON.stringify(stats));
}

export function getPokemonPersisted(id: number): PokemonPersisted {
  const all = loadAllStats();
  return all[id] ?? {
    id,
    elo: 1500,
    wins: 0,
    losses: 0,
    moveset: [],
    disabled: false,
  };
}

export function setPokemonPersisted(data: PokemonPersisted): void {
  const all = loadAllStats();
  all[data.id] = data;
  saveAllStats(all);
}

export function setManyPokemonPersisted(updates: PokemonPersisted[]): void {
  const all = loadAllStats();
  for (const p of updates) {
    all[p.id] = p;
  }
  saveAllStats(all);
}

export function resetAllStats(): void {
  const all = loadAllStats();
  for (const id of Object.keys(all)) {
    const p = all[Number(id)];
    all[Number(id)] = { ...p, elo: 1500, wins: 0, losses: 0 };
  }
  saveAllStats(all);
}

export function getLoadedRange(): LoadedRange {
  try {
    const raw = localStorage.getItem(LOADED_RANGE_KEY);
    return raw ? JSON.parse(raw) : { min: 0, max: 0, ids: [] };
  } catch {
    return { min: 0, max: 0, ids: [] };
  }
}

export function addToLoadedRange(ids: number[]): void {
  const current = getLoadedRange();
  const merged = Array.from(new Set([...current.ids, ...ids])).sort((a, b) => a - b);
  const min = merged.length > 0 ? merged[0] : 0;
  const max = merged.length > 0 ? merged[merged.length - 1] : 0;
  localStorage.setItem(LOADED_RANGE_KEY, JSON.stringify({ min, max, ids: merged }));
}

export function clearLoadedRange(): void {
  localStorage.removeItem(LOADED_RANGE_KEY);
}

const ALLOWED_MOVES_KEY = 'allowed_moves';

export function getAllowedMoveIds(): number[] {
  try {
    const raw = localStorage.getItem(ALLOWED_MOVES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setAllowedMoveIds(ids: number[]): void {
  localStorage.setItem(ALLOWED_MOVES_KEY, JSON.stringify(ids));
}
