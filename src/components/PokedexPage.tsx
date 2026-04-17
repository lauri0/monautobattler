import { useState, useMemo } from 'react';
import type { PokemonData, TypeName } from '../models/types';
import { ALL_TYPES } from '../utils/typeChart';
import { getPokemonPersisted } from '../persistence/userStorage';
import TypeBadge from './TypeBadge';
import { getTypeColor } from '../utils/typeColors';
import './PokedexPage.css';

interface Props {
  allPokemon: PokemonData[];
  onSelectPokemon: (id: number) => void;
  onBack: () => void;
}

export default function PokedexPage({ allPokemon, onSelectPokemon, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeName | null>(null);

  const filtered = useMemo(() => {
    return allPokemon
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .filter(p => !typeFilter || p.types.includes(typeFilter))
      .sort((a, b) => a.id - b.id);
  }, [allPokemon, search, typeFilter]);

  const usedTypes = useMemo(() => {
    const set = new Set<TypeName>();
    allPokemon.forEach(p => p.types.forEach(t => set.add(t)));
    return ALL_TYPES.filter(t => set.has(t));
  }, [allPokemon]);

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Pokedex</h1>

      <div className="pokedex-filters">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <div className="type-filter-row">
          <button
            className={typeFilter === null ? 'type-filter-btn active' : 'type-filter-btn'}
            onClick={() => setTypeFilter(null)}
          >All</button>
          {usedTypes.map(t => (
            <button
              key={t}
              className={typeFilter === t ? 'type-filter-btn active' : 'type-filter-btn'}
              style={typeFilter === t ? { background: getTypeColor(t), borderColor: getTypeColor(t) } : {}}
              onClick={() => setTypeFilter(t === typeFilter ? null : t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <p className="pokedex-count">Showing {filtered.length} of {allPokemon.length} Pokemon</p>

      <div className="pokedex-grid">
        {filtered.map(p => {
          const persisted = getPokemonPersisted(p.id);
          return (
            <button
              key={p.id}
              className={`pokedex-card ${persisted.disabled ? 'disabled' : ''}`}
              onClick={() => onSelectPokemon(p.id)}
            >
              <span className="pokedex-num">#{String(p.id).padStart(3, '0')}</span>
              <img
                src={p.spriteUrl}
                alt={p.name}
                className="pokedex-sprite"
                loading="lazy"
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
              />
              <span className="pokedex-name">{p.name}</span>
              <div className="pokedex-types">
                {p.types.map(t => <TypeBadge key={t} type={t} />)}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            No Pokemon found.
          </p>
        )}
      </div>
    </div>
  );
}
