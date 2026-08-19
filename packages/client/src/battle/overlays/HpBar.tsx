interface Props {
  current: number;
  max: number;
  showNumbers?: boolean;
}

export function HpBar({ current, max, showNumbers = false }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  const color = pct > 0.5 ? '#2ecc71' : pct > 0.2 ? '#f0c040' : '#e74c3c';

  return (
    <div>
      <div style={{ background: '#333', borderRadius: 3, height: 6, overflow: 'hidden', width: '100%' }}>
        <div
          data-testid="hp-fill"
          style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.3s ease' }}
        />
      </div>
      {showNumbers && (
        <div style={{ color: '#aaa', fontSize: 10, marginTop: 2 }}>{current}/{max}</div>
      )}
    </div>
  );
}
