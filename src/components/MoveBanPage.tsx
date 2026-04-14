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

  // Search results: all moves matching query (both allowed and banned)
  const searchResults = useMemo((): Move[] => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const matchedPokemon = allPokemon.filter(p => p.name.toLowerCase().includes(q));
    if (matchedPokemon.length > 0) {
      const seen = new Set<number>();
      const moves: Move[] = [];
      for (const p of matchedPokemon) {
        for (const m of p.availableMoves) {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            moves.push(m);
          }
        }
      }
      return moves;
    }

    return allMoves.filter(m => m.name.toLowerCase().includes(q));
  }, [search, allPokemon, allMoves]);

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
    if (!confirm('Remove all allowed moves?')) return;
    setAllowedIds([]);
    setAllowedMoveIds([]);
  }

  const allowedMoves = allowedIds.map(id => moveIndex.get(id)).filter(Boolean) as Move[];

  function MoveRow({ m, isAllowed }: { m: Move; isAllowed: boolean }) {
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
          {m.power}pw · {m.accuracy ?? '—'}%{fx ? ` · ${fx}` : ''}
        </span>
        {isAllowed
          ? <button className="ban-btn" onClick={() => ban(m.id)}>Ban</button>
          : <button className="allow-btn" onClick={() => allow(m)}>Allow</button>
        }
      </div>
    );
  }

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

      <div className="ban-layout">
        {/* Search results panel */}
        <div className="ban-panel">
          <h2 className="ban-panel-title">
            Results
            {search.trim() && <span className="ban-panel-count">{searchResults.length}</span>}
          </h2>

          {!search.trim() && (
            <p className="ban-empty">Start typing to search for moves or Pokemon.</p>
          )}
          {search.trim() && searchResults.length === 0 && (
            <p className="ban-empty">No matching moves found.</p>
          )}

          <div className="ban-results-list" ref={resultsListRef}>
            {searchResults.map(m => (
              <MoveRow key={m.id} m={m} isAllowed={allowedIds.includes(m.id)} />
            ))}
          </div>
        </div>

        {/* Allowed panel */}
        <div className="ban-panel">
          <h2 className="ban-panel-title">
            Allowed
            <span className="ban-panel-count">{allowedIds.length}</span>
            {allowedIds.length > 0 && (
              <button className="ban-clear-btn" onClick={banAll}>Ban all</button>
            )}
          </h2>

          {allowedIds.length === 0 && (
            <p className="ban-empty">No moves allowed yet — all are banned.</p>
          )}

          <div className="ban-results-list">
            {allowedMoves.map(m => (
              <MoveRow key={m.id} m={m} isAllowed={true} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
