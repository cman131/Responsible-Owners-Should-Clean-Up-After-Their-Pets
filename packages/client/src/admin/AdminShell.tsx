import { useState, useEffect } from 'react';
import { connectAsAdmin } from '../socket.js';
import { AdminRouter } from './AdminRouter.js';

const SESSION_KEY = 'poke_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface AdminSession { token: string; expiresAt: number }

function loadSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    return s.expiresAt > Date.now() ? s : null;
  } catch { return null; }
}

function saveSession(token: string): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + SESSION_TTL_MS }));
}

export function AdminShell() {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      connectAsAdmin(session.token);
      setAuthenticated(true);
    }
  }, []);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    connectAsAdmin(token.trim());
    saveSession(token.trim());
    setAuthenticated(true);
  }

  if (authenticated) return <AdminRouter />;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>ADMIN</h1>
      <form onSubmit={handleConnect} style={styles.box}>
        <label style={styles.label}>Admin token</label>
        <input
          type="password"
          style={styles.input}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter admin token"
          autoFocus
        />
        <button type="submit" style={styles.button} disabled={!token.trim()}>
          CONNECT AS ADMIN
        </button>
      </form>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 },
  title: { fontSize: 36, letterSpacing: 6, color: '#e74c3c' },
  box: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 8, padding: 32, display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 320 },
  label: { color: '#aaa', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const },
  input: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '8px 12px', fontSize: 16, borderRadius: 4, fontFamily: 'inherit' },
  button: { background: '#c0392b', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
};
