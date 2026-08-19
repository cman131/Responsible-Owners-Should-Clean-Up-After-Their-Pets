import { useState, useEffect } from 'react';
import { connectAsAdmin, getSocket } from '../socket.js';
import { SetupPanel } from './SetupPanel.js';
import { ControlPanel } from './ControlPanel.js';

export function AdminShell() {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeBattle, setActiveBattle] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    const socket = getSocket();
    const onBattleStart = (payload: { state: { battleId: string } }) => {
      setActiveBattle(payload.state.battleId);
    };
    socket.on('battle:start', onBattleStart);
    return () => {
      socket.off('battle:start', onBattleStart);
    };
  }, [connected]);

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    connectAsAdmin(token.trim());
    setConnected(true);
  }

  if (connected && activeBattle) return <ControlPanel battleId={activeBattle} />;
  if (connected) return <SetupPanel />;

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
  container: { display:'flex', flexDirection:'column' as const, alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:24 },
  title: { fontSize:36, letterSpacing:6, color:'#e74c3c' },
  box: { background:'#0d0d1a', border:'2px solid #e74c3c', borderRadius:8, padding:32, display:'flex', flexDirection:'column' as const, gap:16, minWidth:320 },
  label: { color:'#aaa', fontSize:12, letterSpacing:2, textTransform:'uppercase' as const },
  input: { background:'#1a1a2e', border:'1px solid #e74c3c', color:'#fff', padding:'8px 12px', fontSize:16, borderRadius:4, fontFamily:'inherit' },
  button: { background:'#c0392b', color:'#fff', border:'none', padding:'10px 20px', fontSize:14, letterSpacing:2, cursor:'pointer', borderRadius:4, fontFamily:'inherit' },
  error: { color:'#e74c3c', fontSize:12 },
};
