import { useLocation, useNavigate } from 'react-router-dom';
import { BattleProvider, useBattle } from '../battle/BattleContext.js';
import { getSocket } from '../socket.js';
import { BattleScene } from '../battle/BattleScene.js';
import { ActionPanel } from '../battle/overlays/ActionPanel.js';
import { SwitchPanel } from '../battle/overlays/SwitchPanel.js';
import { TurnLog } from '../battle/overlays/TurnLog.js';
import { ExpBar } from '../battle/overlays/ExpBar.js';
import { HpBarsRow } from '../battle/overlays/HpBarsRow.js';
import { BattleResultPanel } from '../battle/overlays/BattleResultPanel.js';
import type { BattleState } from '@poke-fighter/shared';

export function BattlePage() {
  const location = useLocation();
  const locationState = location.state as { battleState?: BattleState; slotId?: string } | null;
  const initialState = locationState?.battleState ?? null;
  const mySlotId = locationState?.slotId ?? sessionStorage.getItem('mySlotId') ?? 'a1';
  return (
    <BattleProvider mySlotId={mySlotId} initialState={initialState}>
      <BattleView />
    </BattleProvider>
  );
}

function BattleView() {
  const navigate = useNavigate();
  const { state, mySlotId, actionRequest, switchRequest, turnLog, displayHp, animatingSlots, submitAction, battleResult } = useBattle();

  function handleGoHome() {
    if (state && !battleResult) {
      if (!confirm('Leave this battle? You may not be able to rejoin.')) {
        return;
      }
    }
    getSocket().emit('player:leave');
    sessionStorage.removeItem('mySlotId');
    navigate('/');
  }

  function handleSwitch(instanceId: string) {
    submitAction({ slotId: mySlotId, action: { type: 'switch', targetInstanceId: instanceId } });
  }

  if (!state) {
    return (
      <div style={{ position: 'relative', padding: 48, textAlign: 'center', color: '#aaa' }}>
        <button
          onClick={handleGoHome}
          style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          ← Home
        </button>
        Waiting for battle to start...
      </div>
    );
  }

  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];
  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const myActiveMon = mySlot?.party[mySlot.activePokemonIndex];
  const switchableParty = mySlot?.party.filter((p) => !p.fainted && p.instanceId !== myActiveMon?.instanceId) ?? [];

  return (
    <div style={{ background: '#0d0d1a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, gap: 12, position: 'relative' }}>
      <button
        onClick={handleGoHome}
        style={{ position: 'absolute', top: 16, left: 16, background: 'none', border: '1px solid #555', color: '#aaa', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
      >
        ← Home
      </button>

      <div style={{ color: '#f0c040', fontSize: 12, letterSpacing: 2 }}>{state.label} — Turn {state.turnNumber}</div>

      <HpBarsRow
        label="ENEMY"
        variant="enemy"
        slots={foeTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        displayHp={displayHp}
      />

      <BattleScene state={state} mySlotId={mySlotId} animatingSlots={animatingSlots} />

      <HpBarsRow
        label="MY TEAM"
        variant="own"
        slots={myTeam?.slots.filter((s) => !s.isSpectator) ?? []}
        highlightSlotId={mySlotId}
        displayHp={displayHp}
      />

      {myActiveMon && <ExpBar instanceId={myActiveMon.instanceId} nickname={myActiveMon.nickname} />}

      <div data-testid="action-log-wrapper" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, width: '100%', maxWidth: 800 }}>
        <div style={{ flex: '1 0 260px' }}>
          {battleResult ? (
            <BattleResultPanel
              winningTeamId={battleResult.winningTeamId}
              finalState={battleResult.finalState}
              mySlotId={mySlotId}
              onGoHome={handleGoHome}
            />
          ) : switchRequest !== null ? (
            <SwitchPanel
              party={switchableParty}
              onSwitch={handleSwitch}
              label="YOUR POKÉMON FAINTED — CHOOSE NEXT"
            />
          ) : actionRequest && !mySlot?.isSpectator ? (
            <ActionPanel
              request={actionRequest}
              slotId={mySlotId}
              state={state}
              onSubmitMove={(moveIndex, targetSlotId, tera) =>
                submitAction({
                  slotId: mySlotId,
                  action: {
                    type: 'move',
                    moveIndex,
                    ...(targetSlotId !== undefined ? { targetSlotId } : {}),
                    ...(tera ? { terastallize: tera } : {}),
                  },
                })
              }
              onSubmitSwitch={handleSwitch}
              theme="player"
            />
          ) : mySlot?.isSpectator ? (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Watching...</div>
          ) : (
            <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 6, padding: 16, color: '#555', fontSize: 13, textAlign: 'center' }}>Waiting for others...</div>
          )}
        </div>
        <div style={{ flex: '0 0 300px', maxWidth: '100%' }}>
          <TurnLog messages={turnLog} />
        </div>
      </div>
    </div>
  );
}
