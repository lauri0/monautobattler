import { useState, useEffect, useCallback } from 'react';
import type { PokemonData } from './models/types';
import { loadAllPokemonData } from './data/loadLocalData';
import MainMenu from './components/MainMenu';
import PokedexPage from './components/PokedexPage';
import PokemonDetail from './components/PokemonDetail';
import BattlePage from './components/BattlePage';
import Battle3v3Page from './components/Battle3v3Page';
import RoundRobin3v3Page from './components/RoundRobin3v3Page';
import MassSimPage from './components/MassSimPage';
import SettingsPage from './components/SettingsPage';
import MoveBanPage from './components/MoveBanPage';
import GauntletPage from './components/GauntletPage';
import TournamentPage from './components/TournamentPage';
import StatisticsPage from './components/StatisticsPage';

type Page = 'menu' | 'pokedex' | 'pokedex-detail' | 'battle' | 'battle3v3' | 'roundrobin3v3' | 'masssim' | 'gauntlet' | 'tournament' | 'settings' | 'moveban' | 'statistics';

export default function App() {
  const [page, setPage] = useState<Page>('menu');
  const [allPokemon, setAllPokemon] = useState<PokemonData[]>([]);
  const [selectedPokemonId, setSelectedPokemonId] = useState<number | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const data = await loadAllPokemonData();
    setAllPokemon(data);
    setDataLoaded(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Redirect to settings if no data
  useEffect(() => {
    if (dataLoaded && allPokemon.length === 0) {
      setPage('settings');
    }
  }, [dataLoaded, allPokemon]);

  function handleDataLoaded() {
    loadData();
  }

  const noData = dataLoaded && allPokemon.length === 0;

  if (page === 'settings') {
    return (
      <SettingsPage
        onBack={() => setPage('menu')}
        onDataLoaded={handleDataLoaded}
      />
    );
  }

  if (noData) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <h1 className="page-title">Welcome to Pokemon Auto-Battler</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          No Pokemon data found. Load data to get started.
        </p>
        <button className="btn-primary" onClick={() => setPage('settings')}>
          Go to Settings
        </button>
      </div>
    );
  }

  if (page === 'menu') {
    return <MainMenu onNavigate={(p) => setPage(p as Page)} />;
  }

  if (page === 'pokedex') {
    return (
      <PokedexPage
        allPokemon={allPokemon}
        onSelectPokemon={(id) => { setSelectedPokemonId(id); setPage('pokedex-detail'); }}
        onBack={() => setPage('menu')}
      />
    );
  }

  if (page === 'pokedex-detail' && selectedPokemonId !== null) {
    const pokemon = allPokemon.find(p => p.id === selectedPokemonId);
    if (pokemon) {
      return (
        <PokemonDetail
          key={pokemon.id}
          pokemon={pokemon}
          allPokemon={allPokemon}
          onBack={() => setPage('pokedex')}
          onNavigate={(id) => setSelectedPokemonId(id)}
        />
      );
    }
  }

  if (page === 'battle') {
    return <BattlePage allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'battle3v3') {
    return <Battle3v3Page allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'roundrobin3v3') {
    return <RoundRobin3v3Page allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'masssim') {
    return <MassSimPage allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'gauntlet') {
    return <GauntletPage allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'tournament') {
    return <TournamentPage allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  if (page === 'moveban') {
    return <MoveBanPage onBack={() => setPage('menu')} />;
  }

  if (page === 'statistics') {
    return <StatisticsPage allPokemon={allPokemon} onBack={() => setPage('menu')} />;
  }

  return <MainMenu onNavigate={(p) => setPage(p as Page)} />;
}
