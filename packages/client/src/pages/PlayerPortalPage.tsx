import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, connectAsPlayerPortal } from '../socket.js';
import type { PlayerProfile } from '@poke-fighter/shared';

type Phase = 'entry' | 'loading' | 'portal';
type ActiveTab = 'team' | 'bank' | 'inventory';

export function PlayerPortalPage() {
  const [phase, setPhase] = useState<Phase>('entry');
  const [playerKey, setPlayerKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('team');
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket();

    socket.on('player:portal-data', (payload: { profile: PlayerProfile }) => {
      setProfile(payload.profile);
      setPhase('portal');
    });

    socket.on('player:portal-error', (payload: { message: string }) => {
      setError(payload.message);
      setPhase('entry');
    });

    return () => {
      socket.off('player:portal-data');
      socket.off('player:portal-error');
    };
  }, []);

  function handleSubmit() {
    setError(null);
    setPhase('loading');
    connectAsPlayerPortal();
    getSocket().emit('player:portal-auth', { playerKey });
  }

  if (phase === 'loading') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.loadingText}>Authenticating…</p>
        </div>
      </div>
    );
  }

  if (phase === 'portal' && profile !== null) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <h2 style={styles.displayName}>{profile.displayName}</h2>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'team' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('team')}
            >
              Team
            </button>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'bank' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('bank')}
            >
              Bank
            </button>
            <button
              style={{ ...styles.tabButton, ...(activeTab === 'inventory' ? styles.tabActive : {}) }}
              onClick={() => setActiveTab('inventory')}
            >
              Inventory
            </button>
          </div>
          <div style={styles.tabContent}>
            {activeTab === 'team' && <p style={styles.placeholder}>Team management coming soon.</p>}
            {activeTab === 'bank' && <p style={styles.placeholder}>Bank management coming soon.</p>}
            {activeTab === 'inventory' && <p style={styles.placeholder}>Inventory coming soon.</p>}
          </div>
          <button style={styles.backLink} onClick={() => navigate('/')}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <div style={styles.box}>
        <div style={styles.sectionLabel}>Player Portal</div>
        <input
          style={styles.input}
          type="text"
          placeholder="Player Key"
          value={playerKey}
          onChange={(e) => setPlayerKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && playerKey.trim()) handleSubmit(); }}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          style={{ ...styles.button, opacity: playerKey.trim() ? 1 : 0.5 }}
          disabled={!playerKey.trim()}
          onClick={handleSubmit}
        >
          ENTER
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 14, minWidth: 320, maxWidth: 400 },
  sectionLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const },
  input: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box' as const },
  error: { color: '#e74c3c', fontSize: 12 },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  loadingText: { color: '#aaa', fontSize: 14, textAlign: 'center' as const },
  displayName: { color: '#f0c040', fontSize: 24, letterSpacing: 2, margin: 0 },
  tabs: { display: 'flex', gap: 8, borderBottom: '1px solid #333', paddingBottom: 8 },
  tabButton: { background: 'transparent', color: '#aaa', border: 'none', padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: 1 },
  tabActive: { color: '#3498db', borderBottom: '2px solid #3498db' },
  tabContent: { minHeight: 80 },
  placeholder: { color: '#555', fontSize: 13 },
  backLink: { background: 'transparent', color: '#aaa', border: 'none', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const, padding: 0, marginTop: 8 },
};
