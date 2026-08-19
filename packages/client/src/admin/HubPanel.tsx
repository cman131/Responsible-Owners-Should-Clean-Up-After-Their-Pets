// packages/client/src/admin/HubPanel.tsx
interface HubPanelProps {
  onSetup: () => void;
  onRegistry: () => void;
}

export function HubPanel({ onSetup, onRegistry }: HubPanelProps) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <h1 style={{ fontSize: 32, letterSpacing: 6, color: '#e74c3c' }}>ADMIN</h1>
      <div style={{ display: 'flex', gap: 24 }}>
        <button onClick={onSetup} style={tile('#e74c3c')}>
          <div style={{ fontSize: 32 }}>⚔</div>
          <div style={{ color: '#e74c3c', letterSpacing: 2, fontSize: 13 }}>BATTLE SETUP</div>
          <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Start a new battle</div>
        </button>
        <button onClick={onRegistry} style={tile('#27ae60')}>
          <div style={{ fontSize: 32 }}>📋</div>
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
