interface HubPanelProps {
  onSetup: () => void;
  onBattles: () => void;
  onRegistry: () => void;
  onLogout: () => void;
}

export function HubPanel({ onSetup, onBattles, onRegistry, onLogout }: HubPanelProps) {
  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <button onClick={onLogout} style={logoutBtn}>LOG OUT</button>
      <h1 style={{ fontSize: 32, letterSpacing: 6, color: '#e74c3c' }}>ADMIN</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        <button onClick={onSetup} style={tile('#e74c3c')}>
          <div style={{ fontSize: 32 }}>⚔</div>
          <div style={{ color: '#e74c3c', letterSpacing: 2, fontSize: 13 }}>BATTLE SETUP</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Start a new battle</div>
        </button>
        <button onClick={onBattles} style={tile('#3498db')}>
          <div style={{ fontSize: 32 }}>📋</div>
          <div style={{ color: '#3498db', letterSpacing: 2, fontSize: 13 }}>BATTLES</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Active & history</div>
        </button>
        <button onClick={onRegistry} style={tile('#27ae60')}>
          <div style={{ fontSize: 32 }}>👤</div>
          <div style={{ color: '#27ae60', letterSpacing: 2, fontSize: 13 }}>REGISTRY</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Manage NPCs & Players</div>
        </button>
      </div>
    </div>
  );
}

function tile(accent: string): React.CSSProperties {
  return {
    background: '#111', border: `2px solid ${accent}`, borderRadius: 8,
    padding: '32px 40px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'inherit', width: 180,
  };
}

const logoutBtn: React.CSSProperties = {
  position: 'absolute', top: 16, right: 16,
  background: 'transparent', border: '1px solid #555', color: '#888',
  padding: '6px 14px', fontSize: 11, letterSpacing: 2,
  cursor: 'pointer', fontFamily: 'inherit', borderRadius: 4,
};
