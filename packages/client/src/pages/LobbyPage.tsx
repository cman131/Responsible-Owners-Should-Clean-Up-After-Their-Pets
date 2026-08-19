import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectAsPlayer, getSocket } from '../socket.js';
import type { LobbyErrorPayload } from '@poke-fighter/shared';

type Phase = 'login' | 'waiting';

export function LobbyPage() {
  const [name, setName] = useState('');
  const [phase, setPhase] = useState<Phase>('login');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const socket = getSocket();

    socket.on('lobby:error', (payload: LobbyErrorPayload) => {
      setError(payload.message);
      setPhase('login');
    });

    socket.on('battle:start', () => {
      navigate('/battle');
    });

    return () => {
      socket.off('lobby:error');
      socket.off('battle:start');
    };
  }, [navigate]);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    connectAsPlayer(name.trim());
    setPhase('waiting');
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.waiting}>Welcome, <strong>{name}</strong>!</p>
          <p style={styles.subtitle}>Waiting for the admin to set up a battle...</p>
          <div style={styles.spinner}>■ ■ ■</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <form onSubmit={handleJoin} style={styles.box}>
        <label style={styles.label}>Enter your trainer name</label>
        <input
          style={styles.input}
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
        {error && <p style={styles.error}>{error}</p>}
        <button
          type="submit"
          style={styles.button}
          disabled={!name.trim()}
        >
          JOIN BATTLE
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 48, letterSpacing: 8, color: '#f0c040' },
  box: { background: '#0d0d1a', border: '2px solid #3498db', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 320 },
  label: { color: '#aaa', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const },
  input: { background: '#1a1a2e', border: '1px solid #3498db', color: '#fff', padding: '8px 12px', fontSize: 16, borderRadius: 4, fontFamily: 'inherit' },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  error: { color: '#e74c3c', fontSize: 12 },
  waiting: { color: '#fff', fontSize: 18 },
  subtitle: { color: '#aaa', fontSize: 14 },
  spinner: { color: '#3498db', fontSize: 24, textAlign: 'center' as const, animation: 'pulse 1s infinite' },
};
