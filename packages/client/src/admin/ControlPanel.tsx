import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleCanvas } from '../battle/BattleCanvas.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { NpcActionPanel } from './NpcActionPanel.js';
import type { ActionRequestPayload } from '@poke-fighter/shared';

interface NpcSlotRequest {
  slotId: string;
  displayName: string;
  request: ActionRequestPayload;
}

interface Props { battleId: string }

function ControlPanelInner({ battleId }: Props) {
  const { state, turnLog } = useBattle();
  const [npcRequests, setNpcRequests] = useState<NpcSlotRequest[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onNpcRequest = (payload: { battleId: string; slots: NpcSlotRequest[] }) => {
      if (payload.battleId === battleId) setNpcRequests(payload.slots);
    };

    const onTurnResolve = () => setNpcRequests([]);

    socket.on('npc:action-request', onNpcRequest);
    socket.on('turn:resolve', onTurnResolve);

    return () => {
      socket.off('npc:action-request', onNpcRequest);
      socket.off('turn:resolve', onTurnResolve);
    };
  }, [battleId]);

  function sendAdminAction(type: string, data: Record<string, unknown>) {
    getSocket().emit('admin:action', { type, data: { battleId, ...data } } as any);
  }

  function handleForfeit(teamId: string) {
    if (confirm(`Forfeit ${teamId}?`)) {
      sendAdminAction('forfeit', { teamId });
    }
  }

  function togglePause() {
    sendAdminAction(paused ? 'unpause' : 'pause', {});
    setPaused(!paused);
  }

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', gap: 16, padding: 16 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: '#e74c3c', fontSize: 12, letterSpacing: 2 }}>ADMIN VIEW — {battleId}</div>
        <BattleCanvas
          state={state}
          mySlotId="__admin__"
          targetingMoveIndex={null}
          legalTargets={[]}
          onTargetSelected={() => {}}
          onCancelTargeting={() => {}}
        />
        <TurnLog messages={turnLog} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={togglePause} style={{ ...btnStyle, background: paused ? '#27ae60' : '#e67e22' }}>
            {paused ? 'UNPAUSE' : 'PAUSE'}
          </button>
          <button onClick={() => handleForfeit('team-a')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM A</button>
          <button onClick={() => handleForfeit('team-b')} style={{ ...btnStyle, background: '#555' }}>FORFEIT TEAM B</button>
        </div>
      </div>
      <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <NpcActionPanel battleId={battleId} npcRequests={npcRequests} />
      </div>
    </div>
  );
}

export function ControlPanel({ battleId }: Props) {
  return (
    <BattleProvider mySlotId="__admin__">
      <ControlPanelInner battleId={battleId} />
    </BattleProvider>
  );
}

const btnStyle = { color: '#fff', border: 'none', padding: '8px 16px', fontSize: 12, letterSpacing: 1, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
