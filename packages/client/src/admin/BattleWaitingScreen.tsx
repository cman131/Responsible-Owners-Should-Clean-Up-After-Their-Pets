import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { SlotStatusPayload } from '@poke-fighter/shared';

interface SlotConfig {
  slotId: string;
  displayName: string;
  type: 'player' | 'npc';
}

interface Props {
  battleId: string;
  slotAssignment: { teamA: SlotConfig[]; teamB: SlotConfig[] };
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function BattleWaitingScreen({ battleId, slotAssignment, onBack, onWatch }: Props) {
  const [joinedSlots, setJoinedSlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    const socket = getSocket();

    socket.emit('admin:action', { type: 'lobby:slot-status', data: { battleId } } as any);

    function handleSlotStatus(payload: SlotStatusPayload) {
      if (payload.battleId !== battleId) return;
      setJoinedSlots(new Set(payload.slots.filter((s) => s.joined).map((s) => s.slotId)));
    }

    socket.on('lobby:slot-status', handleSlotStatus);
    return () => {
      socket.off('lobby:slot-status', handleSlotStatus);
    };
  }, [battleId]);

  const allPlayerSlots = [
    ...slotAssignment.teamA.filter((s) => s.type === 'player'),
    ...slotAssignment.teamB.filter((s) => s.type === 'player'),
  ];
  const joinedCount = allPlayerSlots.filter((s) => joinedSlots.has(s.slotId)).length;
  const totalCount = allPlayerSlots.length;

  function renderSlotRow(slot: SlotConfig) {
    if (slot.type === 'npc') {
      return (
        <div key={slot.slotId} style={styles.slotRow}>
          <div style={{ ...styles.dot, background: '#555' }} />
          <div style={styles.slotName}>{slot.displayName}</div>
          <div style={styles.npcLabel}>🤖 NPC</div>
        </div>
      );
    }
    const joined = joinedSlots.has(slot.slotId);
    return (
      <div
        key={slot.slotId}
        style={{ ...styles.slotRow, background: joined ? '#0d1a12' : '#111', borderColor: joined ? '#27ae60' : '#444' }}
      >
        <div style={{ ...styles.dot, background: joined ? '#27ae60' : '#444' }} />
        <div style={{ ...styles.slotName, color: joined ? '#fff' : '#888' }}>{slot.displayName}</div>
        <div style={joined ? styles.joinedLabel : styles.waitingLabel}>
          {joined ? '● Joined' : '○ Waiting...'}
        </div>
      </div>
    );
  }

  function renderTeam(label: string, slots: SlotConfig[]) {
    return (
      <div style={styles.teamSection}>
        <div style={styles.teamLabel}>{label}</div>
        {slots.map(renderSlotRow)}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← HUB</button>
        <div style={styles.headerTitle}>BATTLE SETUP</div>
        <span style={styles.headerStatus}>Battle Started!</span>
      </div>

      <div style={styles.body}>
        <div style={styles.subtitle}>Waiting for players to connect...</div>
        {renderTeam('Team A', slotAssignment.teamA)}
        <div style={styles.divider} />
        {renderTeam('Team B', slotAssignment.teamB)}
      </div>

      <div style={styles.footer}>
        <div style={styles.countText}>{joinedCount} / {totalCount} players connected</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => {
              getSocket().emit('admin:action', { type: 'cancel-battle', data: { battleId } });
              onBack();
            }}
            style={{ background: '#c0392b', color: '#fff', border: 'none', padding: '5px 14px', fontSize: 11, letterSpacing: 1, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' }}
          >
            Cancel Battle
          </button>
          <button onClick={() => onWatch(battleId)} style={styles.watchButton}>WATCH BATTLE →</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column' as const, minHeight: '100vh', background: '#0d0d1a' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #222' },
  backButton: { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10 },
  headerTitle: { color: '#e74c3c', fontSize: 14, letterSpacing: 3, fontWeight: 'bold' as const },
  headerStatus: { color: '#aaa', fontSize: 11 },
  body: { flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 8 },
  subtitle: { color: '#555', fontSize: 11, marginBottom: 8 },
  teamSection: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  teamLabel: { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, marginBottom: 4 },
  slotRow: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #444', borderRadius: 4, padding: '10px 14px' },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  slotName: { fontSize: 13, flex: 1 },
  joinedLabel: { color: '#27ae60', fontSize: 11 },
  waitingLabel: { color: '#555', fontSize: 11 },
  npcLabel: { color: '#3498db', fontSize: 11 },
  divider: { borderTop: '1px solid #1a1a2e', margin: '4px 0' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #222' },
  countText: { color: '#aaa', fontSize: 11 },
  watchButton: { background: '#27ae60', color: '#000', border: 'none', padding: '5px 14px', fontSize: 11, letterSpacing: 2, cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit' },
};
