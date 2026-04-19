import './MainMenu.css';

type Page = 'menu' | 'pokedex' | 'battle' | 'battle3v3' | 'masssim' | 'gauntlet' | 'tournament' | 'settings' | 'moveban' | 'statistics';

interface Props {
  onNavigate: (page: Page) => void;
}

export default function MainMenu({ onNavigate }: Props) {
  return (
    <div className="main-menu">
      <div className="menu-hero">
        <div className="pokeball-bg" aria-hidden="true" />
        <h1 className="menu-title">Pokemon<br />Auto-Battler</h1>
        <p className="menu-subtitle">Watch your Pokemon fight for glory</p>
      </div>
      <div className="menu-buttons">
        <button className="menu-btn" onClick={() => onNavigate('pokedex')}>
          <span className="menu-btn-icon">📖</span>
          <span>Pokedex</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('battle')}>
          <span className="menu-btn-icon">⚔️</span>
          <span>1v1 Battle</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('battle3v3')}>
          <span className="menu-btn-icon">🛡️</span>
          <span>3v3 Battle</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('gauntlet')}>
          <span className="menu-btn-icon">🎯</span>
          <span>1v1 Gauntlet</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('tournament')}>
          <span className="menu-btn-icon">🏟️</span>
          <span>1v1 Tournament</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('masssim')}>
          <span className="menu-btn-icon">🏆</span>
          <span>1v1 Mass Simulator</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('moveban')}>
          <span className="menu-btn-icon">🚫</span>
          <span>Move Ban Pool</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('statistics')}>
          <span className="menu-btn-icon">📊</span>
          <span>Statistics</span>
        </button>
        <button className="menu-btn" onClick={() => onNavigate('settings')}>
          <span className="menu-btn-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
