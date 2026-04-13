import { useState } from 'react';
import { fetchAndStoreRange } from '../api/pokeapi';
import { clearAllPokemonData } from '../persistence/db';
import { clearLoadedRange, getLoadedRange, resetAllStats } from '../persistence/userStorage';

interface Props {
  onBack: () => void;
  onDataLoaded: () => void;
}

export default function SettingsPage({ onBack, onDataLoaded }: Props) {
  const [fromId, setFromId] = useState(1);
  const [toId, setToId] = useState(20);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  const loadedRange = getLoadedRange();

  async function handleLoad() {
    if (fromId < 1 || toId < fromId) {
      setError('Invalid range.');
      return;
    }
    setError('');
    setLoading(true);
    setProgress(0);
    try {
      await fetchAndStoreRange(fromId, toId, (msg, done, total) => {
        setProgressMsg(msg);
        setProgress(total > 0 ? done / total : 0);
      });
      onDataLoaded();
    } catch (e) {
      setError('Failed to load data. Check your connection.');
      console.error(e);
    } finally {
      setLoading(false);
      setProgress(1);
    }
  }

  async function handleDeleteData() {
    if (!confirm('Delete all cached Pokemon data? You will need to re-download.')) return;
    await clearAllPokemonData();
    clearLoadedRange();
    onDataLoaded();
  }

  function handleResetStats() {
    if (!confirm('Reset all ELO and win/loss records to default? Movesets are kept.')) return;
    resetAllStats();
    alert('Stats reset.');
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Settings</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text)' }}>Pokemon Data Manager</h2>

        {loadedRange.ids.length > 0 ? (
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Loaded: #{loadedRange.min}–#{loadedRange.max} ({loadedRange.ids.length} Pokemon)
          </p>
        ) : (
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No data loaded yet.</p>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            From #
            <input
              type="number"
              min={1}
              max={1010}
              value={fromId}
              onChange={e => setFromId(Number(e.target.value))}
              style={{ width: 80 }}
              disabled={loading}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            To #
            <input
              type="number"
              min={1}
              max={1010}
              value={toId}
              onChange={e => setToId(Number(e.target.value))}
              style={{ width: 80 }}
              disabled={loading}
            />
          </label>
          <button className="btn-primary" onClick={handleLoad} disabled={loading}>
            {loading && <span className="spinner" />}
            Load Pokemon
          </button>
        </div>

        {loading && (
          <div>
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>{progressMsg}</p>
          </div>
        )}

        {error && <p style={{ color: '#f44336', marginTop: '0.5rem' }}>{error}</p>}

        <div style={{ marginTop: '1.2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button className="btn-danger" onClick={handleDeleteData} disabled={loading}>
            Delete All Pokemon Data
          </button>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Clears all cached data. You'll need to re-download.
          </p>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '0.75rem', color: 'var(--text)' }}>Reset Stats</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Resets all ELO to 1500 and win/loss records to 0. Custom movesets and disabled flags are kept.
        </p>
        <button className="btn-danger" onClick={handleResetStats}>Reset All Stats</button>
      </div>
    </div>
  );
}
