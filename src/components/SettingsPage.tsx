import { useState } from 'react';
import { fetchAndStoreRange, repairMissingAbilities } from '../api/pokeapi';
import {
  getLoadedRange,
  resetAllStats,
  getMoveLearnSettings,
  setMoveLearnSettings,
  getSelectedGame,
  setSelectedGame,
  getVariantSettings,
  setVariantSettings,
  getAutoDisableBstThreshold,
  setAutoDisableBstThreshold,
  getAutoDisableBstMaxThreshold,
  setAutoDisableBstMaxThreshold,
  getAutoDisableOverwrite,
  setAutoDisableOverwrite,
  GAME_VERSIONS,
  exportPokedexState,
  importPokedexState,
  type MoveLearnSettings,
  type GameVersion,
  type VariantSettings,
} from '../persistence/userStorage';
import { clearDamageStats } from '../persistence/damageStatsStorage';

interface Props {
  onBack: () => void;
  onDataLoaded: () => void;
}

export default function SettingsPage({ onBack, onDataLoaded }: Props) {
  const [fromId, setFromId] = useState(1);
  const [toId, setToId] = useState(149);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [learnSettings, setLearnSettingsState] = useState<MoveLearnSettings>(() =>
    getMoveLearnSettings()
  );
  const [variantSettings, setVariantSettingsState] = useState<VariantSettings>(() =>
    getVariantSettings()
  );
  const [bstThreshold, setBstThresholdState] = useState(() => getAutoDisableBstThreshold());
  const [bstMaxThreshold, setBstMaxThresholdState] = useState(() => getAutoDisableBstMaxThreshold());
  const [autoDisableOverwrite, setAutoDisableOverwriteState] = useState(() => getAutoDisableOverwrite());
  const [game, setGameState] = useState<GameVersion>(() => getSelectedGame());
  const gameLabel = GAME_VERSIONS.find(g => g.id === game)?.label ?? game;
  const loadedRange = getLoadedRange();

  function changeGame(next: GameVersion) {
    setGameState(next);
    setSelectedGame(next);
  }

  function toggleLearn(key: keyof MoveLearnSettings) {
    const updated = { ...learnSettings, [key]: !learnSettings[key] };
    setLearnSettingsState(updated);
    setMoveLearnSettings(updated);
  }

  function toggleVariant(key: keyof VariantSettings) {
    const updated = { ...variantSettings, [key]: !variantSettings[key] };
    setVariantSettingsState(updated);
    setVariantSettings(updated);
  }

  const isLgpe = game === 'lgpe';
  const supportsAlolan = game === 'lgpe' || game === 'sv';
  const supportsHisuian = game === 'sv';
  const supportsPaldean = game === 'sv';

  const anyLearnEnabled = Object.values(learnSettings).some(Boolean);

  async function handleLoad() {
    if (fromId < 1 || toId < fromId) {
      setError('Invalid range.');
      return;
    }
    if (!anyLearnEnabled) {
      setError('Enable at least one move learn method.');
      return;
    }
    setError('');
    setSummary('');
    setLoading(true);
    setProgress(0);
    try {
      const result = await fetchAndStoreRange(fromId, toId, (msg, done, total) => {
        setProgressMsg(msg);
        setProgress(total > 0 ? done / total : 0);
      });
      const msg =
        result.loaded.length === 0
          ? `No ${gameLabel}-available Pokemon in range #${fromId}–#${toId}.`
          : `Loaded ${result.loaded.length} ${gameLabel} Pokemon` +
            (result.skipped.length > 0
              ? ` (${result.skipped.length} not in ${gameLabel} were skipped)`
              : '');
      setSummary(msg);
      onDataLoaded();
    } catch (e) {
      setError('Failed to load data. Check your connection.');
      console.error(e);
    } finally {
      setLoading(false);
      setProgress(1);
    }
  }

  async function handleRepairAbilities() {
    const range = getLoadedRange();
    if (range.ids.length === 0) {
      setError('No Pokemon loaded yet.');
      return;
    }
    setError('');
    setSummary('');
    setLoading(true);
    setProgress(0);
    try {
      const result = await repairMissingAbilities(range.ids, (msg, done, total) => {
        setProgressMsg(msg);
        setProgress(total > 0 ? done / total : 0);
      });
      const msg = result.repaired.length === 0
        ? 'All Pokemon already have abilities — nothing to repair.'
        : `Repaired abilities for ${result.repaired.length} Pokemon.`;
      setSummary(msg);
      if (result.repaired.length > 0) onDataLoaded();
    } catch (e) {
      setError('Failed to repair abilities. Check your connection.');
      console.error(e);
    } finally {
      setLoading(false);
      setProgress(1);
    }
  }

  function handleResetStats() {
    if (!confirm('Reset all ELO, win/loss records, and damage statistics to default? Movesets are kept.')) return;
    resetAllStats();
    clearDamageStats();
    alert('Stats reset.');
  }

  function handleExport() {
    const data = exportPokedexState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pokedex-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (typeof parsed !== 'object' || parsed === null) {
            alert('Invalid file: not a JSON object.');
            return;
          }
          if (!confirm('This will overwrite your current pokedex state (movesets, disabled flags, allowed moves). Continue?')) return;
          const { pokemonCount, warnings } = importPokedexState(parsed);
          onDataLoaded();
          const parts = [`Imported ${pokemonCount} Pokemon.`];
          if (warnings.length > 0) parts.push('\nWarnings:\n' + warnings.join('\n'));
          alert(parts.join(''));
        } catch {
          alert('Failed to parse file. Make sure it is valid JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Settings</h1>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem', color: 'var(--text)' }}>Pokemon Data Manager</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Only Pokemon and moves available in <strong>{gameLabel}</strong> are fetched.
          IDs outside that game's pokedex are skipped.
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem',
          }}>
            Game
          </span>
          <select
            value={game}
            onChange={e => changeGame(e.target.value as GameVersion)}
            disabled={loading}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem' }}
          >
            {GAME_VERSIONS.map(g => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Applies when loading new Pokemon. Already-loaded Pokemon keep their previously fetched moves.
          </p>
        </div>

        {loadedRange.ids.length > 0 ? (
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Loaded: #{loadedRange.min}–#{loadedRange.max} ({loadedRange.ids.length} Pokemon)
          </p>
        ) : (
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No data loaded yet.</p>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem',
          }}>
            Move Learn Methods
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {([
              { key: 'levelUp', label: 'Level-up' },
              { key: 'machine', label: 'TM / HM (machine)' },
              { key: 'tutor', label: 'Tutor' },
              { key: 'egg', label: 'Egg' },
            ] as { key: keyof MoveLearnSettings; label: string }[]).map(({ key, label }) => (
              <label key={key} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9rem',
              }}>
                <input
                  type="checkbox"
                  checked={learnSettings[key]}
                  onChange={() => toggleLearn(key)}
                  disabled={loading}
                />
                {label}
              </label>
            ))}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            Applies when loading new Pokemon. Already-loaded Pokemon keep their previously fetched moves.
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem',
          }}>
            Variants
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: (!supportsAlolan || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: supportsAlolan ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={variantSettings.useAlolan}
                onChange={() => toggleVariant('useAlolan')}
                disabled={!supportsAlolan || loading}
              />
              Replace with Alolan forms (e.g. Meowth → Dark-type Alolan Meowth) — Let's Go or Scarlet/Violet
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: (!supportsHisuian || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: supportsHisuian ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={variantSettings.useHisuian}
                onChange={() => toggleVariant('useHisuian')}
                disabled={!supportsHisuian || loading}
              />
              Replace with Hisuian forms (e.g. Growlithe → Fire/Rock Hisuian Growlithe) — Scarlet/Violet
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: (!supportsPaldean || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: supportsPaldean ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={variantSettings.usePaldean}
                onChange={() => toggleVariant('usePaldean')}
                disabled={!supportsPaldean || loading}
              />
              Replace Tauros with Paldean Tauros (Blaze Breed, Fire/Fighting) — Scarlet/Violet
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: (!isLgpe || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: isLgpe ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={variantSettings.includeMegas}
                onChange={() => toggleVariant('includeMegas')}
                disabled={!isLgpe || loading}
              />
              Include Mega Evolutions as separate Pokédex entries
            </label>
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              cursor: (!isLgpe || loading) ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              opacity: isLgpe ? 1 : 0.4,
            }}>
              <input
                type="checkbox"
                checked={variantSettings.swapMegaDrain}
                onChange={() => toggleVariant('swapMegaDrain')}
                disabled={!isLgpe || loading}
              />
              Replace Mega Drain with Giga Drain (75 power) in move pools
            </label>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem',
          }}>
            Auto-disable threshold
          </span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            Disable Pokemon with BST below
            <input
              type="number"
              min={0}
              max={999}
              value={bstThreshold}
              onChange={e => {
                const val = Number(e.target.value);
                if (isFinite(val) && val >= 0) {
                  setBstThresholdState(val);
                  setAutoDisableBstThreshold(val);
                }
              }}
              style={{ width: 70 }}
              disabled={loading}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            Disable Pokemon with BST above
            <input
              type="number"
              min={0}
              max={999}
              value={bstMaxThreshold}
              onChange={e => {
                const val = Number(e.target.value);
                if (isFinite(val) && val >= 0) {
                  setBstMaxThresholdState(val);
                  setAutoDisableBstMaxThreshold(val);
                }
              }}
              style={{ width: 70 }}
              disabled={loading}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginTop: '0.6rem', cursor: loading ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={autoDisableOverwrite}
              onChange={e => {
                setAutoDisableOverwriteState(e.target.checked);
                setAutoDisableOverwrite(e.target.checked);
              }}
              disabled={loading}
            />
            Always overwrite enable/disable state on load
          </label>
          {autoDisableOverwrite && (
            <p style={{ fontSize: '0.75rem', color: '#f1c40f', marginTop: '0.4rem' }}>
              ⚠ When enabled, loading Pokemon will overwrite their current enable/disable state based on the BST threshold above.
            </p>
          )}
          {!autoDisableOverwrite && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Applied only to newly loaded Pokemon with no prior data.
            </p>
          )}
        </div>

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
          <button className="btn-primary" onClick={handleRepairAbilities} disabled={loading || loadedRange.ids.length === 0} title="Fetch and add missing abilities to already-loaded Pokemon">
            {loading && <span className="spinner" />}
            Repair Abilities
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
        {summary && !loading && (
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.85rem' }}>{summary}</p>
        )}

      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '0.75rem', color: 'var(--text)' }}>Export / Import</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Export your pokedex configuration (movesets, disabled flags, ELO, allowed moves) to a file, or import from a previously exported file.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleExport}>Export to File</button>
          <button className="btn-primary" onClick={handleImport}>Import from File</button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '0.75rem', color: 'var(--text)' }}>Reset Stats</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
          Resets all ELO to 1500, win/loss records to 0, and damage statistics. Custom movesets and disabled flags are kept.
        </p>
        <button className="btn-danger" onClick={handleResetStats}>Reset All Stats</button>
      </div>
    </div>
  );
}
