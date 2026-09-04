import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, connectAsPlayer } from '../socket.js';
import type { LobbyErrorPayload, BattleJoinOption, BattleState } from '@poke-fighter/shared';

type Phase = 'browse' | 'waiting';

export function LobbyPage() {
  const [phase, setPhase] = useState<Phase>('browse');
  const [battles, setBattles] = useState<BattleJoinOption[]>([]);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinedDisplayName, setJoinedDisplayName] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    if (selectedBattleId === null) return;
    const battle = battles.find((b) => b.battleId === selectedBattleId);
    if (!battle) {
      setSelectedBattleId(null);
      setSelectedSlotId(null);
      return;
    }
    if (selectedSlotId !== null && !battle.slots.find((s) => s.slotId === selectedSlotId && s.status !== 'occupied')) {
      setSelectedSlotId(null);
    }
  }, [battles, selectedBattleId, selectedSlotId]);

  useEffect(() => {
    connectAsPlayer();
    const socket = getSocket();

    socket.on('lobby:battles', (payload: { battles: BattleJoinOption[] }) => {
      setBattles(payload.battles);
    });

    socket.on('lobby:error', (payload: LobbyErrorPayload) => {
      setError(payload.message);
      setPhase('browse');
    });

    socket.on('state:sync', (state: BattleState) => {
      navigate('/battle', { state: { battleState: state } });
    });

    return () => {
      socket.off('lobby:battles');
      socket.off('lobby:error');
      socket.off('state:sync');
    };
  }, [navigate]);

  function handleJoin() {
    if (!selectedBattleId || !selectedSlotId) return;

    const battle = battles.find((b) => b.battleId === selectedBattleId);
    const slot = battle?.slots.find((s) => s.slotId === selectedSlotId && s.status !== 'occupied');
    if (!slot) return;

    setError(null);
    setJoinedDisplayName(slot.displayName);
    sessionStorage.setItem('mySlotId', selectedSlotId);
    getSocket().emit('player:join', { battleId: selectedBattleId, slotId: selectedSlotId });
    setPhase('waiting');
  }

  if (phase === 'waiting') {
    return (
      <div style={styles.container}>
        <h1 style={styles.title}>POKE FIGHTER</h1>
        <div style={styles.box}>
          <p style={styles.waiting}>Welcome, <strong>{joinedDisplayName}</strong>!</p>
          <p style={styles.subtitle}>Waiting for the battle to begin...</p>
          <div style={styles.spinner}>■ ■ ■</div>
        </div>
      </div>
    );
  }

  const selectedBattle = battles.find((b) => b.battleId === selectedBattleId) ?? null;
  const joinableSlots = selectedBattle?.slots.filter((s) => s.status !== 'occupied') ?? [];
  const canJoin = selectedBattleId !== null && selectedSlotId !== null;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>POKE FIGHTER</h1>
      <div style={styles.box}>
        <div style={styles.sectionLabel}>Select Battle</div>

        {battles.length === 0 ? (
          <p style={styles.emptyText}>No active battles yet. Check with your admin.</p>
        ) : (
          battles.map((b) => {
            const joinable = b.slots.filter((s) => s.status !== 'occupied').length;
            return (
              <div
                key={b.battleId}
                onClick={() => { setSelectedBattleId(b.battleId); setSelectedSlotId(null); }}
                style={{
                  ...styles.battleCard,
                  borderColor: selectedBattleId === b.battleId ? '#27ae60' : '#333',
                  background: selectedBattleId === b.battleId ? '#0d1a12' : '#111',
                }}
              >
                <div style={styles.battleLabel}>{b.label}</div>
                {joinable > 0 ? (
                  <div style={styles.slotCount}>{joinable} slot{joinable !== 1 ? 's' : ''} available</div>
                ) : (
                  <div style={{ ...styles.slotCount, color: '#666' }}>Full – In Progress</div>
                )}
              </div>
            );
          })
        )}

        {selectedBattle && joinableSlots.length > 0 && (
          <div style={styles.slotSection}>
            <div style={styles.sectionLabel}>You are...</div>
            <select
              style={styles.select}
              value={selectedSlotId ?? ''}
              onChange={(e) => setSelectedSlotId(e.target.value || null)}
            >
              <option value="">— pick your slot —</option>
              {joinableSlots.map((s) => (
                <option key={s.slotId} value={s.slotId}>
                  {s.displayName}{s.status === 'reconnectable' ? ' (reconnect)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}

        <button
          style={{ ...styles.button, opacity: canJoin ? 1 : 0.5 }}
          disabled={!canJoin}
          onClick={handleJoin}
        >
          JOIN BATTLE
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
  emptyText: { color: '#555', fontSize: 13 },
  battleCard: { border: '2px solid #333', borderRadius: 6, padding: '12px 14px', cursor: 'pointer' },
  battleLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' as const },
  slotCount: { color: '#aaa', fontSize: 11, marginTop: 3 },
  slotSection: { display: 'flex', flexDirection: 'column' as const, gap: 10, borderTop: '1px solid #222', paddingTop: 14 },
  select: { width: '100%', padding: 8, background: '#1a1a2e', color: '#fff', border: '1px solid #3498db', borderRadius: 4, fontFamily: 'inherit' },
  error: { color: '#e74c3c', fontSize: 12 },
  button: { background: '#2980b9', color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' },
  waiting: { color: '#fff', fontSize: 18 },
  subtitle: { color: '#aaa', fontSize: 14 },
  spinner: { color: '#3498db', fontSize: 24, textAlign: 'center' as const },
};
