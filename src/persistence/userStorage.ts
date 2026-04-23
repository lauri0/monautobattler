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

export function setSelectedAbility(id: number, ability: string | undefined): void {
  const existing = getPokemonPersisted(id);
  setPokemonPersisted({ ...existing, selectedAbility: ability });
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

export function deletePokemonPersisted(ids: number[]): void {
  if (ids.length === 0) return;
  const all = loadAllStats();
  let changed = false;
  for (const id of ids) {
    if (all[id] !== undefined) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) saveAllStats(all);
  removeFromLoadedRange(ids);
}

function removeFromLoadedRange(idsToRemove: number[]): void {
  const current = getLoadedRange();
  if (current.ids.length === 0) return;
  const drop = new Set(idsToRemove);
  const remaining = current.ids.filter(id => !drop.has(id));
  if (remaining.length === current.ids.length) return;
  const min = remaining.length > 0 ? remaining[0] : 0;
  const max = remaining.length > 0 ? remaining[remaining.length - 1] : 0;
  localStorage.setItem(LOADED_RANGE_KEY, JSON.stringify({ min, max, ids: remaining }));
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

const BATTLE_SELECTION_KEY = 'battle_selection';

export function getBattleSelection(): { idA: number; idB: number } | null {
  try {
    const raw = localStorage.getItem(BATTLE_SELECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setBattleSelection(idA: number, idB: number): void {
  localStorage.setItem(BATTLE_SELECTION_KEY, JSON.stringify({ idA, idB }));
}

const TEAM_3V3_SELECTION_KEY = 'team3v3_selection';

export interface Team3v3Selection {
  team0: [number, number, number];
  team1: [number, number, number];
}

export function getTeam3v3Selection(): Team3v3Selection | null {
  try {
    const raw = localStorage.getItem(TEAM_3V3_SELECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.team0) || !Array.isArray(parsed.team1)) return null;
    if (parsed.team0.length !== 3 || parsed.team1.length !== 3) return null;
    return parsed as Team3v3Selection;
  } catch {
    return null;
  }
}

export function setTeam3v3Selection(sel: Team3v3Selection): void {
  localStorage.setItem(TEAM_3V3_SELECTION_KEY, JSON.stringify(sel));
}

const MOVE_LEARN_SETTINGS_KEY = 'move_learn_settings';

export interface MoveLearnSettings {
  levelUp: boolean;
  machine: boolean;
  tutor: boolean;
  egg: boolean;
}

const DEFAULT_MOVE_LEARN_SETTINGS: MoveLearnSettings = {
  levelUp: true,
  machine: true,
  tutor: true,
  egg: false,
};

export function getMoveLearnSettings(): MoveLearnSettings {
  try {
    const raw = localStorage.getItem(MOVE_LEARN_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MOVE_LEARN_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_MOVE_LEARN_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_MOVE_LEARN_SETTINGS };
  }
}

export function setMoveLearnSettings(settings: MoveLearnSettings): void {
  localStorage.setItem(MOVE_LEARN_SETTINGS_KEY, JSON.stringify(settings));
}

const GAME_VERSION_KEY = 'game_version';

export type GameVersion = 'bdsp' | 'lgpe' | 'sv';

export interface GameVersionInfo {
  id: GameVersion;
  label: string;
  versionGroup: string;
}

export const GAME_VERSIONS: readonly GameVersionInfo[] = [
  { id: 'bdsp', label: 'Brilliant Diamond / Shining Pearl', versionGroup: 'brilliant-diamond-shining-pearl' },
  { id: 'lgpe', label: "Let's Go Pikachu / Eevee", versionGroup: 'lets-go-pikachu-lets-go-eevee' },
  { id: 'sv', label: 'Scarlet / Violet', versionGroup: 'scarlet-violet' },
];

const DEFAULT_GAME_VERSION: GameVersion = 'bdsp';

export function getSelectedGame(): GameVersion {
  try {
    const raw = localStorage.getItem(GAME_VERSION_KEY);
    if (raw === 'bdsp' || raw === 'lgpe' || raw === 'sv') return raw;
  } catch {
    // fall through
  }
  return DEFAULT_GAME_VERSION;
}

export function setSelectedGame(game: GameVersion): void {
  localStorage.setItem(GAME_VERSION_KEY, game);
}

export function getSelectedGameInfo(): GameVersionInfo {
  const id = getSelectedGame();
  return GAME_VERSIONS.find(g => g.id === id) ?? GAME_VERSIONS[0];
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

const AUTO_DISABLE_BST_KEY = 'auto_disable_bst_threshold';
const DEFAULT_AUTO_DISABLE_BST = 400;

export function getAutoDisableBstThreshold(): number {
  try {
    const raw = localStorage.getItem(AUTO_DISABLE_BST_KEY);
    if (raw === null) return DEFAULT_AUTO_DISABLE_BST;
    const n = Number(raw);
    return isFinite(n) && n >= 0 ? n : DEFAULT_AUTO_DISABLE_BST;
  } catch {
    return DEFAULT_AUTO_DISABLE_BST;
  }
}

export function setAutoDisableBstThreshold(value: number): void {
  localStorage.setItem(AUTO_DISABLE_BST_KEY, String(value));
}

const AUTO_DISABLE_BST_MAX_KEY = 'auto_disable_bst_max_threshold';
const DEFAULT_AUTO_DISABLE_BST_MAX = 999;

export function getAutoDisableBstMaxThreshold(): number {
  try {
    const raw = localStorage.getItem(AUTO_DISABLE_BST_MAX_KEY);
    if (raw === null) return DEFAULT_AUTO_DISABLE_BST_MAX;
    const n = Number(raw);
    return isFinite(n) && n >= 0 ? n : DEFAULT_AUTO_DISABLE_BST_MAX;
  } catch {
    return DEFAULT_AUTO_DISABLE_BST_MAX;
  }
}

export function setAutoDisableBstMaxThreshold(value: number): void {
  localStorage.setItem(AUTO_DISABLE_BST_MAX_KEY, String(value));
}

const AUTO_DISABLE_OVERWRITE_KEY = 'auto_disable_overwrite';

export function getAutoDisableOverwrite(): boolean {
  try { return localStorage.getItem(AUTO_DISABLE_OVERWRITE_KEY) === 'true'; } catch { return false; }
}

export function setAutoDisableOverwrite(value: boolean): void {
  localStorage.setItem(AUTO_DISABLE_OVERWRITE_KEY, String(value));
}

const VARIANT_SETTINGS_KEY = 'variant_settings';

export interface VariantSettings {
  useAlolan: boolean;
  useHisuian: boolean;
  usePaldean: boolean;
  includeMegas: boolean;
  swapMegaDrain: boolean;
}

const DEFAULT_VARIANT_SETTINGS: VariantSettings = {
  useAlolan: false,
  useHisuian: false,
  usePaldean: false,
  includeMegas: false,
  swapMegaDrain: false,
};

export function getVariantSettings(): VariantSettings {
  try {
    const raw = localStorage.getItem(VARIANT_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VARIANT_SETTINGS };
    return { ...DEFAULT_VARIANT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_VARIANT_SETTINGS };
  }
}

export function setVariantSettings(settings: VariantSettings): void {
  localStorage.setItem(VARIANT_SETTINGS_KEY, JSON.stringify(settings));
}

// ── Export / Import ──────────────────────────────────────────────────────────

export interface PokedexExport {
  version: 1;
  pokemon: Record<number, PokemonPersisted>;
  allowedMoves: number[];
}

export function exportPokedexState(): PokedexExport {
  return {
    version: 1,
    pokemon: loadAllStats(),
    allowedMoves: getAllowedMoveIds(),
  };
}

function sanitizePokemon(id: number, raw: unknown): PokemonPersisted {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id,
    elo: typeof obj.elo === 'number' && isFinite(obj.elo) ? obj.elo : 1500,
    wins: typeof obj.wins === 'number' && obj.wins >= 0 ? Math.floor(obj.wins) : 0,
    losses: typeof obj.losses === 'number' && obj.losses >= 0 ? Math.floor(obj.losses) : 0,
    moveset: Array.isArray(obj.moveset)
      ? obj.moveset.filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
      : [],
    disabled: typeof obj.disabled === 'boolean' ? obj.disabled : false,
  };
}

export function importPokedexState(raw: unknown): { pokemonCount: number; warnings: string[] } {
  const warnings: string[] = [];
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

  // Accept any version or missing version — best-effort
  if (data.version !== undefined && data.version !== 1) {
    warnings.push(`Unknown export version (${data.version}), importing best-effort.`);
  }

  // Pokemon data
  const pokemonRaw = data.pokemon;
  const sanitized: Record<number, PokemonPersisted> = {};
  let pokemonCount = 0;

  if (typeof pokemonRaw === 'object' && pokemonRaw !== null && !Array.isArray(pokemonRaw)) {
    for (const [key, val] of Object.entries(pokemonRaw as Record<string, unknown>)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id < 1) {
        warnings.push(`Skipped invalid pokemon ID: ${key}`);
        continue;
      }
      sanitized[id] = sanitizePokemon(id, val);
      pokemonCount++;
    }
  } else if (pokemonRaw !== undefined) {
    warnings.push('Pokemon data missing or malformed — skipped.');
  }

  if (pokemonCount > 0) {
    saveAllStats(sanitized);
  }

  // Allowed moves
  if (Array.isArray(data.allowedMoves)) {
    const validIds = data.allowedMoves.filter(
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0,
    );
    if (validIds.length !== data.allowedMoves.length) {
      warnings.push(`Filtered out ${data.allowedMoves.length - validIds.length} invalid allowed move IDs.`);
    }
    setAllowedMoveIds(validIds);
  } else if (data.allowedMoves !== undefined) {
    warnings.push('Allowed moves data malformed — skipped.');
  }

  return { pokemonCount, warnings };
}
