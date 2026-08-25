import { useState, useEffect, useRef } from 'react';
import { connectAsAdmin, getSocket } from '../socket.js';
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
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingToken = useRef<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      pendingToken.current = session.token;
      setConnecting(true);
      connectAsAdmin(session.token);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onAuthenticated = () => {
      if (pendingToken.current) {
        saveSession(pendingToken.current);
        pendingToken.current = null;
      }
      setConnecting(false);
      setAuthenticated(true);
    };

    const onError = ({ message }: { message: string }) => {
      localStorage.removeItem(SESSION_KEY);
      pendingToken.current = null;
      setConnecting(false);
      setAuthenticated(false);
      setError(message);
    };

    socket.on('admin:authenticated', onAuthenticated);
    socket.on('admin:error', onError);
    return () => {
      socket.off('admin:authenticated', onAuthenticated);
      socket.off('admin:error', onError);
    };
  }, []);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setError(null);
    setConnecting(true);
    pendingToken.current = t;
    connectAsAdmin(t);
  }

  if (authenticated) return <AdminRouter />;

  if (connecting) {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>ADMIN</h1>
        <div style={styles.box}>
          <p style={{ color: '#aaa', textAlign: 'center', margin: 0 }}>Verifying token...</p>
        </div>
      </div>
    );
  }

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
        {error && <p style={styles.error}>{error}</p>}
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
  error: { color: '#e74c3c', fontSize: 12, margin: 0 },
};
