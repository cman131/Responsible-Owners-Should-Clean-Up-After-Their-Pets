import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { BattleScene } from '../battle/BattleScene.js';
import { MovePanel } from '../battle/overlays/MovePanel.js';
import { SwitchPanel } from '../battle/overlays/SwitchPanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { ExpBar } from '../battle/overlays/ExpBar.js';
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
import { classifyTarget, getTargetLabel, getSlotDisplayName, formatTargetNames } from '../battle/targeting.js';
import type { BattleState, ActionRequestPayload } from '@poke-fighter/shared';

type ValidMove = ActionRequestPayload['validMoves'][number];

export function BattlePage() {
  const location = useLocation();
  const initialState = (location.state as { battleState?: BattleState } | null)?.battleState ?? null;
  const mySlotId = sessionStorage.getItem('mySlotId') ?? 'a1';
  return (
    <BattleProvider mySlotId={mySlotId} initialState={initialState}>
      <BattleView />
    </BattleProvider>
  );
}

function BattleView() {
  const { state, mySlotId, actionRequest, switchRequest, turnLog, submitAction } = useBattle();
  const [targetingMove, setTargetingMove] = useState<ValidMove | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [terastallize, setTerastallize] = useState(false);
  const [showSwitchPanel, setShowSwitchPanel] = useState(false);

  // Reset targeting state when a new action request arrives
  useEffect(() => {
    setTargetingMove(null);
    setSelectedTarget('');
  }, [actionRequest]);

  if (!state) {
    return <div style={{ padding: 48, textAlign: 'center', color: '#aaa' }}>Waiting for battle to start...</div>;
  }

  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];
  const switchableParty = mySlot?.party.filter((_, i) => i !== mySlot.activePokemonIndex) ?? [];

  function handleMoveSelect(moveIndex: 0 | 1 | 2 | 3) {
    if (!actionRequest) return;
    const move = actionRequest.validMoves[moveIndex];
    if (!move) return;

    const mode = classifyTarget(move.targetType);

    if (mode === 'auto') {
      const autoTarget = move.legalTargets[0];
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
      return;
    }

    setTargetingMove(move);
    if (mode === 'choose') {
      setSelectedTarget(move.legalTargets[0] ?? '');
    }
  }

  function handleConfirmTarget() {
    if (!targetingMove || !actionRequest) return;
    const mode = classifyTarget(targetingMove.targetType);

    submitAction({
      slotId: mySlotId,
      action: {
        type: 'move',
        moveIndex: targetingMove.index,
        ...(mode === 'choose' ? { targetSlotId: selectedTarget } : {}),
        ...(terastallize ? { terastallize } : {}),
      },
    });
    setTargetingMove(null);
    setSelectedTarget('');
    setTerastallize(false);
  }

  function handleSwitch(instanceId: string) {
    submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
    setShowSwitchPanel(false);
  }

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      <HpBarsRow
        label="ENEMY"
        variant="enemy"
        slots={foeTeam?.slots.filter((s) => !s.isSpectator) ?? []}
      />

      {/* Battle scene */}
      <BattleScene state={state} mySlotId={mySlotId} />

      <HpBarsRow
        label="MY TEAM"
        variant="own"
        slots={myTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        highlightSlotId={mySlotId}
      />

      {myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} />}

      {/* Bottom row: action panel + turn log */}
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
              {targetingMove !== null && (() => {
                const mode = classifyTarget(targetingMove.targetType);
                return (
                  <div style={{ marginTop: 8, background: '#0d0d1a', border: '1px solid #3498db', borderRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#aaa', fontSize: 11 }}>
                      {mode === 'choose' ? 'Target:' : 'Targets:'}
                    </span>
                    {mode === 'choose' ? (
                      <select
                        value={selectedTarget}
                        onChange={(e) => setSelectedTarget(e.target.value)}
                        style={{ flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
                      >
                        {targetingMove.legalTargets.map((t) => (
                          <option key={t} value={t}>{getSlotDisplayName(state, t)}</option>
                        ))}
                      </select>
                    ) : mode === 'listed' ? (
                      <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
                        {formatTargetNames(targetingMove.legalTargets, state)}
                      </span>
                    ) : (
                      <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
                        {getTargetLabel(targetingMove.targetType)}
                      </span>
                    )}
                    <button
                      onClick={handleConfirmTarget}
                      style={{ background: '#2980b9', color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => { setTargetingMove(null); setSelectedTarget(''); }}
                      style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })()}
              {actionRequest.canTerastallize && (
                <div style={{ marginTop: 10, borderTop: '1px solid #333', paddingTop: 10 }}>
                  <label style={{ color: '#aaa', fontSize: 11 }}>
                    <input type="checkbox" checked={terastallize} onChange={(e) => setTerastallize(e.target.checked)} style={{ marginRight: 6 }} />
                    Terastallize this turn
                  </label>
                </div>
              )}
            </>
          ) : mySlot?.isSpectator ? (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Watching...</div>
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Waiting for others...</div>
          )}
        </div>
        <div style={{ width: 300 }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}
