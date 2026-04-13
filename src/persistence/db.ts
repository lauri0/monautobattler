import type { PokemonData, Move } from '../models/types';

const DB_NAME = 'PokemonBattlerDB';
const DB_VERSION = 1;
const POKEMON_STORE = 'pokemon';
const MOVES_STORE = 'moves';
const SPRITES_STORE = 'sprites';

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(POKEMON_STORE)) {
        db.createObjectStore(POKEMON_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(MOVES_STORE)) {
        db.createObjectStore(MOVES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SPRITES_STORE)) {
        db.createObjectStore(SPRITES_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = (e.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };
    req.onerror = () => reject(req.error);
  });
}

function txGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  }));
}

function txPut(storeName: string, value: unknown): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function txGetAll<T>(storeName: string): Promise<T[]> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  }));
}

function txClear(storeName: string): Promise<void> {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

export async function savePokemonData(pokemon: PokemonData): Promise<void> {
  await txPut(POKEMON_STORE, pokemon);
}

export async function getPokemonData(id: number): Promise<PokemonData | undefined> {
  return txGet<PokemonData>(POKEMON_STORE, id);
}

export async function getAllPokemonData(): Promise<PokemonData[]> {
  return txGetAll<PokemonData>(POKEMON_STORE);
}

export async function saveMove(move: Move): Promise<void> {
  await txPut(MOVES_STORE, move);
}

export async function getMove(id: number): Promise<Move | undefined> {
  return txGet<Move>(MOVES_STORE, id);
}

export async function saveSprite(id: number, blob: Blob): Promise<void> {
  await txPut(SPRITES_STORE, { id, blob });
}

export async function getSprite(id: number): Promise<Blob | undefined> {
  const row = await txGet<{ id: number; blob: Blob }>(SPRITES_STORE, id);
  return row?.blob;
}

export async function clearAllPokemonData(): Promise<void> {
  await Promise.all([
    txClear(POKEMON_STORE),
    txClear(MOVES_STORE),
    txClear(SPRITES_STORE),
  ]);
}
