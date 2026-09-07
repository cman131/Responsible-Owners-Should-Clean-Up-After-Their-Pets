import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { classifyTarget, sortLegalTargets } from '../battle/targeting.js';
import type { ActionRequestPayload, BattleState } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props {
  battleId: string;
  npcRequests: NpcSlotRequest[];
  state: BattleState | null;
}

export function NpcTabPanel({ battleId, npcRequests, state }: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const [pendingMove, setPendingMove] = useState<{ slotId: string; moveIndex: 0 | 1 | 2 | 3 } | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [switchingSlotId, setSwitchingSlotId] = useState<string | null>(null);

  useEffect(() => {
    setSubmitted(new Set());
    setPendingMove(null);
    setSelectedTarget('');
    setSwitchingSlotId(null);
    if (npcRequests.length > 0) setActiveTab(npcRequests[0]!.slotId);
  }, [npcRequests]);

  function getDisplayName(slotId: string): string {
    if (!state) return slotId;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.displayName;
    }
    return slotId;
  }

  function getActiveMon(slotId: string) {
    if (!state) return null;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.party[slot.activePokemonIndex] ?? null;
    }
    return null;
  }

  function submitNpcAction(slotId: string, moveIndex: 0 | 1 | 2 | 3, targetSlotId?: string) {
    const action = targetSlotId
      ? { type: 'move' as const, moveIndex, targetSlotId }
      : { type: 'move' as const, moveIndex };
    getSocket().emit('admin:action', { type: 'npc-action', data: { battleId, slotId, action } });
    setSubmitted((prev) => new Set([...prev, slotId]));
    setPendingMove(null);
    setSelectedTarget('');
  }

  function getBenchMon(slotId: string, instanceId: string) {
    if (!state) return null;
    for (const team of state.teams) {
      const slot = team.slots.find((s) => s.slotId === slotId);
      if (slot) return slot.party.find((p) => p.instanceId === instanceId) ?? null;
    }
    return null;
  }

  function submitNpcSwitch(slotId: string, targetInstanceId: string) {
    getSocket().emit('admin:action', {
      type: 'npc-action',
      data: { battleId, slotId, action: { type: 'switch', targetInstanceId } },
    });
    setSubmitted((prev) => new Set([...prev, slotId]));
  }

  function handleMoveClick(slotId: string, mv: ActionRequestPayload['validMoves'][number]) {
    const mode = classifyTarget(mv.targetType);
    if (mode === 'auto' || (mode === 'choose' && mv.legalTargets.length === 1)) {
      submitNpcAction(slotId, mv.index, mv.legalTargets[0]);
    } else if (mode === 'choose') {
      setPendingMove({ slotId, moveIndex: mv.index });
      const sorted = state ? sortLegalTargets(mv.legalTargets, slotId, state) : mv.legalTargets;
      setSelectedTarget(sorted[0] ?? '');
    } else {
      submitNpcAction(slotId, mv.index);
    }
  }

  if (npcRequests.length === 0) return null;

  const activeRequest = npcRequests.find((r) => r.slotId === activeTab);

  function renderBenchList(slotId: string, onSelect: (instanceId: string) => void) {
    const req = npcRequests.find((r) => r.slotId === slotId);
    if (!req) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {req.request.switchTargets.map((instanceId) => {
          const mon = getBenchMon(slotId, instanceId);
          const done = submitted.has(slotId);
          return (
            <button
              key={instanceId}
              disabled={!mon || done}
              onClick={() => onSelect(instanceId)}
              style={{ ...styles.moveBtn, opacity: !mon || done ? 0.4 : 1, cursor: !mon || done ? 'not-allowed' : 'pointer', justifyContent: 'flex-start', gap: 8 }}
            >
              <span style={{ fontSize: 11 }}>{mon?.nickname ?? instanceId}</span>
              {mon && (
                <>
                  <span style={{ color: '#aaa', fontSize: 10 }}>Lv.{mon.level}</span>
                  <span style={{ color: '#aaa', fontSize: 10 }}>{mon.currentHp}/{mon.maxHp} HP</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>NPC ACTIONS — {submitted.size}/{npcRequests.length} submitted</div>

      <div style={styles.tabStrip}>
        {npcRequests.map((r) => (
          <button
            key={r.slotId}
            onClick={() => { setActiveTab(r.slotId); setSwitchingSlotId(null); }}
            style={{
              ...styles.tab,
              background: activeTab === r.slotId ? '#e74c3c' : '#1a1a2e',
              color: submitted.has(r.slotId) ? '#555' : activeTab === r.slotId ? '#fff' : '#aaa',
              borderColor: activeTab === r.slotId ? '#e74c3c' : '#333',
            }}
          >
            {r.displayName}{submitted.has(r.slotId) ? ' ✓' : ''}
          </button>
        ))}
      </div>

      {activeRequest && (
        <div style={styles.tabBody}>
          {switchingSlotId === activeRequest.slotId ? (
            <div>
              <div style={{ color: '#27ae60', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>SWITCH POKÉMON</div>
              {renderBenchList(activeRequest.slotId, (instanceId) => { submitNpcSwitch(activeRequest.slotId, instanceId); setSwitchingSlotId(null); })}
              <button onClick={() => setSwitchingSlotId(null)} style={{ ...styles.cancelBtn, marginTop: 8 }}>Cancel</button>
            </div>
          ) : activeRequest.request.validMoves.length === 0 && activeRequest.request.canSwitch ? (
            <div>
              <div style={{ color: '#e74c3c', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
                SWITCH REQUIRED
              </div>
              {renderBenchList(activeRequest.slotId, (instanceId) => submitNpcSwitch(activeRequest.slotId, instanceId))}
            </div>
          ) : (
            <>
              {/* VS summary — unique targets across all moves */}
              <div style={styles.vsSummary}>
                {[...new Set(activeRequest.request.validMoves.flatMap((m) => m.legalTargets))].map((targetSlotId) => {
                  const mon = getActiveMon(targetSlotId);
                  const pct = mon && !mon.fainted ? mon.currentHp / mon.maxHp : 0;
                  const barColor = pct > 0.5 ? '#27ae60' : pct > 0.2 ? '#f39c12' : '#e74c3c';
                  return (
                    <div key={targetSlotId} style={styles.vsRow}>
                      <span style={{ color: '#e74c3c', fontSize: 9, width: 18 }}>VS</span>
                      <span style={{ color: '#fff', fontSize: 10, flex: 1 }}>{getDisplayName(targetSlotId)}</span>
                      {mon && !mon.fainted ? (
                        <>
                          <div style={{ width: 80, background: '#333', height: 4, borderRadius: 2 }}>
                            <div style={{ background: barColor, height: 4, borderRadius: 2, width: `${pct * 100}%` }} />
                          </div>
                          <span style={{ color: '#aaa', fontSize: 9, width: 50, textAlign: 'right' }}>{mon.currentHp}/{mon.maxHp}</span>
                        </>
                      ) : (
                        <span style={{ color: '#555', fontSize: 9 }}>FAINTED</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Move grid */}
              <div style={styles.moveGrid}>
                {activeRequest.request.validMoves.map((mv) => {
                  const done = submitted.has(activeRequest.slotId);
                  const disabled = mv.disabled || mv.pp === 0 || done;
                  return (
                    <button
                      key={mv.index}
                      disabled={disabled}
                      onClick={() => handleMoveClick(activeRequest.slotId, mv)}
                      style={{ ...styles.moveBtn, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                    >
                      <span style={{ textTransform: 'capitalize', fontSize: 11 }}>{mv.moveId}</span>
                      <span style={{ color: '#aaa', fontSize: 10 }}>PP {mv.pp}</span>
                    </button>
                  );
                })}
              </div>

              {/* Voluntary switch button */}
              {activeRequest.request.canSwitch && activeRequest.request.switchTargets.length > 0 && !submitted.has(activeRequest.slotId) && (
                <button
                  onClick={() => setSwitchingSlotId(activeRequest.slotId)}
                  style={{ ...styles.moveBtn, background: '#1a3a1a', borderColor: '#27ae60', marginTop: 4, width: '100%', justifyContent: 'center' }}
                >
                  SWITCH POKÉMON
                </button>
              )}

              {/* Target selector — multi-target only */}
              {pendingMove?.slotId === activeRequest.slotId && (() => {
                const rawTargets = activeRequest.request.validMoves.find((m) => m.index === pendingMove.moveIndex)?.legalTargets ?? [];
                const pendingMoveLegalTargets = state ? sortLegalTargets(rawTargets, pendingMove.slotId, state) : rawTargets;
                return (
                  <div style={styles.targetRow}>
                    <span style={{ color: '#aaa', fontSize: 10 }}>Target:</span>
                    <select
                      value={selectedTarget}
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      style={styles.targetSelect}
                    >
                      {pendingMoveLegalTargets.map((t) => (
                        <option key={t} value={t}>{getDisplayName(t)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => submitNpcAction(activeRequest.slotId, pendingMove.moveIndex, selectedTarget)}
                      style={styles.confirmBtn}
                    >
                      Confirm
                    </button>
                    <button onClick={() => setPendingMove(null)} style={styles.cancelBtn}>✕</button>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: { background: '#0d0d1a', border: '2px solid #e74c3c', borderRadius: 6, padding: 12 },
  header: { color: '#e74c3c', fontSize: 11, letterSpacing: 2, marginBottom: 10 },
  tabStrip: { display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' as const },
  tab: { border: '1px solid #333', borderRadius: '3px 3px 0 0', padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  tabBody: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  vsSummary: { display: 'flex', flexDirection: 'column' as const, gap: 4, background: '#111', borderRadius: 3, padding: '4px 8px' },
  vsRow: { display: 'flex', alignItems: 'center', gap: 6 },
  moveGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  moveBtn: { background: '#1a1a2e', border: '1px solid #e74c3c', color: '#fff', padding: '5px 8px', borderRadius: 3, fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  targetRow: { display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #333', paddingTop: 8 },
  targetSelect: { flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '3px 6px', borderRadius: 3, fontFamily: 'inherit', fontSize: 11 },
  confirmBtn: { background: '#e74c3c', color: '#fff', border: 'none', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
  cancelBtn: { background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 },
};
