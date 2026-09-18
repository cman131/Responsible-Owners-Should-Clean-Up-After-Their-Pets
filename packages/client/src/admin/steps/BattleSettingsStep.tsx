import { useState } from 'react';

interface Props {
  onStart: (settings: { label: string; levelCap?: number }) => void;
  onBack: () => void;
}

export function BattleSettingsStep({ onStart, onBack }: Props) {
  const [label, setLabel] = useState('Battle 1');
  const [levelCap, setLevelCap] = useState(0);

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Battle Settings</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>BATTLE NAME</label>
        <input
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16 }}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ color: '#aaa', fontSize: 12, letterSpacing: 2 }}>LEVEL CAP</label>
        <select
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 16 }}
          value={levelCap}
          onChange={(e) => setLevelCap(Number(e.target.value))}
        >
          <option value={0}>None (use as-is)</option>
          <option value={50}>Level 50</option>
          <option value={100}>Level 100</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => {
            const settings: { label: string; levelCap?: number } = { label };
            if (levelCap > 0) {
              settings.levelCap = levelCap;
            }
            onStart(settings);
          }}
          style={{ background: '#27ae60', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}
          disabled={!label.trim()}
        >
          ▶ START BATTLE
        </button>
      </div>
    </div>
  );
}
