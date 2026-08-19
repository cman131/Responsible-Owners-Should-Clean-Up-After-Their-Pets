import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
}

export function NpcActionPanel({ battleId, npcRequests }: Props) {
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSubmitted(new Set());
  }, [npcRequests]);

  function submitNpcAction(slotId: string, moveIndex: 0 | 1 | 2 | 3, targetSlotId?: string) {
    const action = targetSlotId
      ? { type: 'move' as const, moveIndex, targetSlotId }
      : { type: 'move' as const, moveIndex };
    getSocket().emit('admin:action', {
      type: 'npc-action',
      data: { battleId, slotId, action },
    });
    setSubmitted((prev) => new Set([...prev, slotId]));
  }

  if (npcRequests.length === 0) return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>NPC ACTIONS — {submitted.size}/{npcRequests.length} submitted</div>
      <div style={styles.slots}>
        {npcRequests.map((npcReq) => {
          const done = submitted.has(npcReq.slotId);
          return (
            <div key={npcReq.slotId} style={{ ...styles.slot, opacity: done ? 0.5 : 1 }}>
              <div style={styles.npcName}>{npcReq.displayName} {done ? '✓' : ''}</div>
              <div style={styles.moveGrid}>
                {npcReq.request.validMoves.map((mv) => (
                  <button
                    key={mv.index}
                    style={{ ...styles.moveBtn, opacity: mv.disabled || mv.pp === 0 || done ? 0.4 : 1 }}
                    disabled={mv.disabled || mv.pp === 0 || done}
                    onClick={() => {
                      const target = npcReq.request.legalTargets[0];
                      submitNpcAction(npcReq.slotId, mv.index, target);
                    }}
                  >
                    <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{mv.moveId}</span>
                    <span style={{ color: '#555', fontSize: 10 }}>PP {mv.pp}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 6, padding: 16 },
  header: { color: '#e74c3c', fontSize: 11, letterSpacing: 2, marginBottom: 12 },
  slots: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  slot: { background: '#111', borderRadius: 4, padding: 10 },
  npcName: { color: '#aaa', fontSize: 12, marginBottom: 6, letterSpacing: 1 },
  moveGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '6px 8px', borderRadius: 3, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontFamily: 'inherit' },
};
