import { useState } from 'react';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleCanvas } from '../battle/BattleCanvas.js';
import { MovePanel } from '../battle/overlays/MovePanel.js';
import { SwitchPanel } from '../battle/overlays/SwitchPanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { HpBar } from '../battle/overlays/HpBar.js';
import { StatusBadge } from '../battle/overlays/StatusBadge.js';

// Temporary — in real app, slotId comes from lobby state
const MY_SLOT_ID = sessionStorage.getItem('mySlotId') ?? 'slot-a1';

export function BattlePage() {
  return (
    <BattleProvider mySlotId={MY_SLOT_ID}>
      <BattleView />
    </BattleProvider>
  );
}

function BattleView() {
  const { state, mySlotId, actionRequest, switchRequest, turnLog, submitAction } = useBattle();
  const [targetingMoveIndex, setTargetingMoveIndex] = useState<0 | 1 | 2 | 3 | null>(null);
  const [terastallize, setTerastallize] = useState(false);
  const [showSwitchPanel, setShowSwitchPanel] = useState(false);

  function handleMoveSelect(moveIndex: 0 | 1 | 2 | 3) {
    if (!actionRequest) return;
    const move = actionRequest.validMoves[moveIndex];
    if (!move) return;

    // If move needs a target and there are multiple options, enter targeting view
    if (actionRequest.legalTargets.length > 1) {
      setTargetingMoveIndex(moveIndex);
    } else {
      // Auto-target the only option
      const autoTarget = actionRequest.legalTargets[0];
      submitAction({
        slotId: mySlotId,
        action: {
          type: 'move',
          moveIndex,
          ...(autoTarget !== undefined ? { targetSlotId: autoTarget } : {}),
          ...(terastallize ? { terastallize } : {}),
        },
      });
      setTerastallize(false);
    }
  }

  function handleTargetSelected(targetSlotId: string) {
    if (targetingMoveIndex === null || !actionRequest) return;
    submitAction({
      slotId: mySlotId,
      action: {
        type: 'move',
        moveIndex: targetingMoveIndex,
        targetSlotId,
        ...(terastallize ? { terastallize } : {}),
      },
    });
    setTargetingMoveIndex(null);
    setTerastallize(false);
  }

  if (!state) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#aaa' }}>Waiting for battle to start...</div>;
  }

  const myTeam = state.teams.find((t) => t.slots.some((s) => s.slotId === mySlotId));
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];

  const switchableParty = (() => {
    if (!mySlot) return [];
    return mySlot.party.filter((_, i) => i !== mySlot.activePokemonIndex);
  })();

  function handleSwitch(instanceId: string) {
    submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
    setShowSwitchPanel(false);
  }

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      <BattleCanvas
        state={state}
        mySlotId={mySlotId}
        targetingMoveIndex={targetingMoveIndex}
        legalTargets={actionRequest?.legalTargets ?? []}
        onTargetSelected={handleTargetSelected}
        onCancelTargeting={() => setTargetingMoveIndex(null)}
      />

      {myActiveMon && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#111', border: '1px solid #333', borderRadius: 6, padding: '8px 16px', width: 800 }}>
          <span style={{ color: '#fff', fontSize: 14 }}>Species #{myActiveMon.speciesId} L{myActiveMon.level}</span>
          <StatusBadge status={myActiveMon.status} />
          <div style={{ flex: 1 }}>
            <HpBar current={myActiveMon.currentHp} max={myActiveMon.maxHp} showNumbers />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, width: 800 }}>
        <div style={{ flex: 1 }}>
          {(switchRequest !== null || showSwitchPanel) ? (
            <SwitchPanel
              party={switchableParty}
              onSwitch={handleSwitch}
              label={switchRequest !== null ? 'YOUR POKÉMON FAINTED — CHOOSE NEXT' : 'CHOOSE POKÉMON'}
              {...(switchRequest === null ? { onCancel: () => setShowSwitchPanel(false) } : {})}
            />
          ) : actionRequest && !mySlot?.isSpectator ? (
            <>
              <MovePanel
                request={actionRequest}
                onSelectMove={handleMoveSelect}
                onSwitchRequested={() => setShowSwitchPanel(true)}
              />
              {actionRequest.canTerastallize && (
                <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
                  <label style={{ color: '#aaa', fontSize: 11 }}>
                    <input
                      type="checkbox"
                      checked={terastallize}
                      onChange={(e) => setTerastallize(e.target.checked)}
                      style={{ marginRight: 6 }}
                    />
                    Terastallize this turn
                  </label>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>
              {mySlot?.isSpectator ? 'Watching...' : 'Waiting for other players...'}
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
