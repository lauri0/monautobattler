interface Props {
  current: number;
  max: number;
}

export default function HpBar({ current, max }: Props) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 50 ? '#4caf50' : pct > 20 ? '#ff9800' : '#f44336';

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.8rem', marginBottom: 4 }}>
        <span>{current} / {max}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="hp-bar-container">
        <div className="hp-bar" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
