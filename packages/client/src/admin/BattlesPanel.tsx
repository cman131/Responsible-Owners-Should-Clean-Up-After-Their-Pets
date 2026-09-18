import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { BattleSummary } from '@poke-fighter/shared';

interface Props {
  onBack: () => void;
  onWatch: (battleId: string) => void;
}

export function BattlesPanel({ onBack, onWatch }: Props) {
  const [battles, setBattles] = useState<BattleSummary[]>([]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'battles:list', data: {} } as any);

    const onData = (payload: { battles: BattleSummary[] }) => setBattles(payload.battles);
    socket.on('battles:data' as any, onData);
    return () => { socket.off('battles:data' as any, onData); };
  }, []);

  const active = battles.filter((b) => b.status === 'active');
  const past = battles.filter((b) => b.status === 'ended');

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← HUB</button>
          <h1 style={{ color: '#3498db', letterSpacing: 4, fontSize: 22 }}>BATTLES</h1>
          <div style={{ width: 60 }} />
        </div>

        {battles.length === 0 && (
          <p style={{ color: '#555', textAlign: 'center', marginTop: 64 }}>
            No battles yet. Start one from Battle Setup.
          </p>
        )}

        {active.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={sectionLabel}>Active — {active.length}</div>
            {active.map((b) => <ActiveRow key={b.battleId} battle={b} onWatch={onWatch} />)}
          </section>
        )}

        {past.length > 0 && (
          <section>
            <div style={sectionLabel}>Past — {past.length}</div>
            {past.map((b) => <PastRow key={b.battleId} battle={b} />)}
          </section>
        )}
      </div>
    </div>
  );
}

function participantSummary(teams: BattleSummary['teams']): string {
  return teams.map((t) => t.slots.map((s) => s.displayName).join(' & ')).join(' vs ');
}

function winnerLabel(battle: BattleSummary): string {
  if (!battle.winningTeamId) return '—';
  const team = battle.teams.find((t) => t.teamId === battle.winningTeamId);
  return team ? team.slots.map((s) => s.displayName).join(' & ') : battle.winningTeamId;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActiveRow({ battle, onWatch }: { battle: BattleSummary; onWatch: (id: string) => void }) {
  return (
    <div style={{ background: '#0d1a12', border: '1px solid #27ae60', borderRadius: 4, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{battle.label}</div>
        <div style={{ color: '#aaa', fontSize: 12, marginTop: 2 }}>{participantSummary(battle.teams)}</div>
        <div style={{ color: '#27ae60', fontSize: 11, marginTop: 3 }}>● Turn {battle.turnNumber}</div>
      </div>
      <button onClick={() => onWatch(battle.battleId)} style={watchBtn}>WATCH</button>
    </div>
  );
}

function PastRow({ battle }: { battle: BattleSummary }) {
  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: '10px 16px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ color: '#ccc', fontWeight: 'bold', fontSize: 13 }}>{battle.label}</div>
        <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>{participantSummary(battle.teams)}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: '#f0c040', fontSize: 12 }}>Winner: {winnerLabel(battle)}</div>
        <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
          {battle.startedAt ? formatDate(battle.startedAt) : ''} · {battle.turnNumber} turns
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const watchBtn: React.CSSProperties = { background: '#27ae60', color: '#000', border: 'none', padding: '6px 16px', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
const sectionLabel: React.CSSProperties = { color: '#aaa', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 };
