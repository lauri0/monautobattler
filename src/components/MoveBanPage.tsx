import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import type { PokemonData, Move } from '../models/types';
import { getAllPokemonData, getAllMoves } from '../persistence/db';
import { getAllowedMoveIds, setAllowedMoveIds } from '../persistence/userStorage';
import { getTypeColor } from '../utils/typeColors';
import { effectSummary } from '../utils/moveEffectSummary';
import './MoveBanPage.css';

interface Props {
  onBack: () => void;
}

interface MoveRowProps {
  m: Move;
  isAllowed: boolean;
  onAllow: (m: Move) => void;
  onBan: (id: number) => void;
}

// Hoisted so React doesn't remount every row on each parent render — remounts
// cause the list's scrollHeight to collapse briefly, which the browser clamps
// by snapping scrollTop to 0.
function MoveRow({ m, isAllowed, onAllow, onBan }: MoveRowProps) {
  const fx = effectSummary(m);
  return (
    <div className="ban-result-row">
      <span className="ban-type-badge" style={{ background: getTypeColor(m.type) }}>
        {m.type}
      </span>
      <span className="ban-move-name">
        {m.damageClass === 'physical' ? '⚔' : '✦'} {m.name}
      </span>
      <span className="ban-move-meta">
        {m.power}pw · {m.accuracy ?? '—'}%{m.priority ? ` · pri ${m.priority > 0 ? '+' : ''}${m.priority}` : ''}{fx ? ` · ${fx}` : ''}
      </span>
      {isAllowed
        ? <button className="ban-btn" onClick={() => onBan(m.id)}>Ban</button>
        : <button className="allow-btn" onClick={() => onAllow(m)}>Allow</button>
      }
    </div>
  );
}

export default function MoveBanPage({ onBack }: Props) {
  const [search, setSearch] = useState('');
  const [allowedIds, setAllowedIds] = useState<number[]>(() => getAllowedMoveIds());
  const resultsListRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const [allPokemon, setAllPokemon] = useState<PokemonData[]>([]);
  const [allMoves, setAllMoves] = useState<Move[]>([]);

  useEffect(() => {
    getAllPokemonData().then(setAllPokemon);
    getAllMoves().then(setAllMoves);
  }, []);

  const moveIndex = useMemo(() => {
    const map = new Map<number, Move>();
    for (const m of allMoves) map.set(m.id, m);
    return map;
  }, [allMoves]);

  // Order by type alphabetically, then by move name alphabetically.
  const sortMoves = (moves: Move[]): Move[] =>
    [...moves].sort((a, b) =>
      a.type.localeCompare(b.type) || a.name.localeCompare(b.name)
    );

  const hasSearch = search.trim().length > 0;

  // Search results: all moves matching query (both allowed and banned)
  const searchResults = useMemo((): Move[] => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const matchedPokemon = allPokemon.filter(p => p.name.toLowerCase().includes(q));
    let results: Move[];
    if (matchedPokemon.length > 0) {
      const seen = new Set<number>();
      results = [];
      for (const p of matchedPokemon) {
        for (const m of p.availableMoves) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            results.push(m);
          }
        }
      }
    } else {
      results = allMoves.filter(m => m.name.toLowerCase().includes(q));
    }
    return sortMoves(results);
  }, [search, allPokemon, allMoves]);

  // Banned moves = every move not currently allowed.
  const bannedMoves = useMemo((): Move[] => {
    const allowedSet = new Set(allowedIds);
    return sortMoves(allMoves.filter(m => !allowedSet.has(m.id)));
  }, [allMoves, allowedIds]);

  useLayoutEffect(() => {
    if (resultsListRef.current) {
      resultsListRef.current.scrollTop = savedScroll.current;
    }
  }, [allowedIds]);

  function allow(move: Move) {
    savedScroll.current = resultsListRef.current?.scrollTop ?? 0;
    const next = [...allowedIds, move.id];
    setAllowedIds(next);
    setAllowedMoveIds(next);
  }

  function ban(id: number) {
    savedScroll.current = resultsListRef.current?.scrollTop ?? 0;
    const next = allowedIds.filter(x => x !== id);
    setAllowedIds(next);
    setAllowedMoveIds(next);
  }

  function banAll() {
    if (allowedIds.length === 0) return;
    if (!confirm(`Ban all ${allowedIds.length} currently allowed moves? This cannot be undone.`)) return;
    setAllowedIds([]);
    setAllowedMoveIds([]);
  }

  function allowAll() {
    const allowedSet = new Set(allowedIds);
    const toAdd = allMoves.filter(m => !allowedSet.has(m.id));
    if (toAdd.length === 0) return;
    if (!confirm(`Allow all ${allMoves.length} moves (adds ${toAdd.length})? This cannot be undone.`)) return;
    // Preserve any previously-allowed IDs that aren't in the current store
    // (e.g. moves from a different game) rather than silently dropping them.
    const next = Array.from(new Set([...allowedIds, ...allMoves.map(m => m.id)]));
    setAllowedIds(next);
    setAllowedMoveIds(next);
  }

  const allMovesAllowed = useMemo(() => {
    if (allMoves.length === 0) return false;
    const allowedSet = new Set(allowedIds);
    return allMoves.every(m => allowedSet.has(m.id));
  }, [allMoves, allowedIds]);

  const allowedMoves = sortMoves(
    allowedIds.map(id => moveIndex.get(id)).filter(Boolean) as Move[]
  );


  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Move Allow List</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Only allowed moves appear in Pokedex dropdowns. Search by Pokemon name to see all their moves, or search by move name.
      </p>

      <input
        type="text"
        placeholder="Search by Pokemon or move name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="ban-search-input"
        autoFocus
      />

      <div className="ban-bulk-toolbar">
        <button
          className="allow-btn ban-bulk-btn"
          onClick={allowAll}
          disabled={allMovesAllowed || allMoves.length === 0}
          title="Allow every move"
        >
          Allow all moves
        </button>
        <button
          className="ban-btn ban-bulk-btn"
          onClick={banAll}
          disabled={allowedIds.length === 0}
          title="Ban every currently allowed move"
        >
          Ban all moves
        </button>
      </div>

      <div className="ban-layout">
        {/* Left panel: search results while typing, otherwise the ban list. */}
        <div className="ban-panel">
          <h2 className="ban-panel-title">
            {hasSearch ? 'Results' : 'Ban List'}
            <span className="ban-panel-count">
              {hasSearch ? searchResults.length : bannedMoves.length}
            </span>
          </h2>

          {hasSearch && searchResults.length === 0 && (
            <p className="ban-empty">No matching moves found.</p>
          )}
          {!hasSearch && bannedMoves.length === 0 && (
            <p className="ban-empty">No moves banned — all are allowed.</p>
          )}

          <div className="ban-results-list" ref={resultsListRef}>
            {(hasSearch ? searchResults : bannedMoves).map(m => (
              <MoveRow
                key={m.id}
                m={m}
                isAllowed={allowedIds.includes(m.id)}
                onAllow={allow}
                onBan={ban}
              />
            ))}
          </div>
        </div>

        {/* Allowed panel */}
        <div className="ban-panel">
          <h2 className="ban-panel-title">
            Allowed
            <span className="ban-panel-count">{allowedIds.length}</span>
          </h2>

          {allowedIds.length === 0 && (
            <p className="ban-empty">No moves allowed yet — all are banned.</p>
          )}

          <div className="ban-results-list">
            {allowedMoves.map(m => (
              <MoveRow
                key={m.id}
                m={m}
                isAllowed={true}
                onAllow={allow}
                onBan={ban}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
