import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleScene } from '../battle/BattleScene.js';
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { NpcTabPanel } from './NpcTabPanel.js';
import { BattleResultPanel } from '../battle/overlays/BattleResultPanel.js';
import type { ActionRequestPayload, AdminActionPayload, SlotStatusPayload } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props { battleId: string; onBack: () => void }

function ControlPanelInner({ battleId, onBack }: Props) {
  const { state, turnLog, battleResult } = useBattle();
  const [npcRequests, setNpcRequests] = useState<NpcSlotRequest[]>([]);
  const [slotStatuses, setSlotStatuses] = useState<SlotStatusPayload['slots']>([]);

  useEffect(() => {
    const socket = getSocket();

    const onNpcRequest = (payload: { battleId: string; slots: NpcSlotRequest[] }) => {
      if (payload.battleId === battleId) setNpcRequests(payload.slots);
    };
    const onTurnResolve = () => setNpcRequests([]);
    const onSlotStatus = (payload: SlotStatusPayload) => {
      if (payload.battleId === battleId) setSlotStatuses(payload.slots);
    };

    socket.on('npc:action-request', onNpcRequest);
    socket.on('turn:resolve', onTurnResolve);
    socket.on('lobby:slot-status', onSlotStatus);

    socket.emit('admin:action', { type: 'lobby:slot-status', data: { battleId } } as any);

    return () => {
      socket.off('npc:action-request', onNpcRequest);
      socket.off('turn:resolve', onTurnResolve);
      socket.off('lobby:slot-status', onSlotStatus);
    };
  }, [battleId]);

  function sendAdminAction(type: AdminActionPayload['type'], data: Record<string, unknown>) {
    getSocket().emit('admin:action', { type, data: { battleId, ...data } });
  }

  function handleForfeit(teamId: string) {
    if (confirm(`Forfeit ${teamId}?`)) {
      sendAdminAction('forfeit', { teamId });
    }
  }

  const teamASlots = state?.teams[0]?.slots.filter((s) => !s.isSpectator) ?? [];
  const teamBSlots = state?.teams[1]?.slots.filter((s) => !s.isSpectator) ?? [];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: 800 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
        >
          ← BATTLES
        </button>
        {state && (
          <span style={{ color: '#f0c040', fontSize: 12, letterSpacing: 1 }}>
            {state.label} Turn {state.turnNumber}
          </span>
        )}
        <span style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW</span>
        {slotStatuses.filter(s => !s.joined).map(s => (
          <span key={s.slotId} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e74c3c', fontSize: 11 }}>
            ⚠ {s.displayName} disconnected
            <button
              onClick={() => sendAdminAction('submit-default-action', { slotId: s.slotId })}
              style={{ ...btnStyle, background: '#7a3', padding: '2px 8px', fontSize: 10 }}
            >
              SUBMIT ACTION
            </button>
          </span>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={() => handleForfeit('team-a')} style={btnStyle}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={btnStyle}>FORFEIT TEAM B</button>
        </div>
      </div>

      {state && (
        <>
          <HpBarsRow label="TEAM B" variant="enemy" slots={teamBSlots} />
          <BattleScene state={state} mySlotId="__admin__" />
          <HpBarsRow label="TEAM A" variant="own" slots={teamASlots} />
        </>
      )}

      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {battleResult ? (
            <BattleResultPanel
              winningTeamId={battleResult.winningTeamId}
              finalState={battleResult.finalState}
              mySlotId="__admin__"
              onGoHome={onBack}
            />
          ) : npcRequests.length > 0 ? (
            <NpcTabPanel battleId={battleId} npcRequests={npcRequests} state={state} />
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>
              No pending NPC actions
            </div>
          )}
        </div>
        <div style={{ width: 300 }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}

export function ControlPanel({ battleId, onBack }: Props) {
  return (
    <BattleProvider mySlotId="__admin__">
      <ControlPanelInner battleId={battleId} onBack={onBack} />
    </BattleProvider>
  );
}

const btnStyle = {
  color: '#fff',
  border: 'none',
  padding: '6px 14px',
  fontSize: 11,
  letterSpacing: 1,
  cursor: 'pointer',
  borderRadius: 3,
  fontFamily: 'inherit',
  background: '#555',
};
