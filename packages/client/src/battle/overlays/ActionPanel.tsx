import { useState, useEffect } from 'react';
import { classifyTarget, sortLegalTargets, getSlotDisplayName, formatTargetNames } from '../targeting.js';
import { SwitchPanel } from './SwitchPanel.js';
import type { ActionRequestPayload, BattleState, PartyMember } from '@poke-fighter/shared';

type ValidMove = ActionRequestPayload['validMoves'][number];

interface ActionPanelProps {
  request: ActionRequestPayload;
  slotId: string;
  state: BattleState;
  onSubmitMove: (moveIndex: 0|1|2|3, targetSlotId?: string, terastallize?: boolean) => void;
  onSubmitSwitch: (instanceId: string) => void;
  submitted?: boolean;
  theme?: 'player' | 'npc';
}

const LOCKED_LABELS: Record<NonNullable<ActionRequestPayload['lockedReason']>, string> = {
  recharge: 'MUST RECHARGE',
  sleep: 'FAST ASLEEP',
  freeze: 'FROZEN SOLID',
};

export function ActionPanel({
  request, slotId, state, onSubmitMove, onSubmitSwitch,
  submitted = false, theme = 'player',
}: ActionPanelProps) {
  const [targetingMove, setTargetingMove] = useState<ValidMove | null>(null);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [terastallize, setTerastallize] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);

  useEffect(() => {
    setTargetingMove(null);
    setSelectedTarget('');
    setTerastallize(false);
    setShowSwitch(false);
  }, [request]);

  const accent = theme === 'npc' ? '#e74c3c' : '#3498db';

  const slot = state.teams.flatMap(t => t.slots).find(s => s.slotId === slotId);
  const switchTargetMons: PartyMember[] = request.switchTargets
    .map(id => slot?.party.find(p => p.instanceId === id))
    .filter((p): p is PartyMember => !!p && !p.fainted);

  if (request.lockedReason) {
    return (
      <div style={{ background: '#0d0d1a', border: `2px solid ${accent}`, borderRadius: 8, padding: 16 }}>
        <div style={{ color: accent, fontSize: 11, letterSpacing: 2, marginBottom: 10 }}>
          {LOCKED_LABELS[request.lockedReason]}
        </div>
        <button
          onClick={() => onSubmitMove(0)}
          style={{ background: accent, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
        >
          Confirm
        </button>
      </div>
    );
  }

  function handleMoveClick(mv: ValidMove) {
    if (submitted) return;
    const mode = classifyTarget(mv.targetType);
    if (mode === 'auto') {
      onSubmitMove(mv.index, mv.legalTargets[0], terastallize || undefined);
      setTerastallize(false);
    } else if (mode === 'choose' && mv.legalTargets.length === 1) {
      onSubmitMove(mv.index, mv.legalTargets[0], terastallize || undefined);
      setTerastallize(false);
    } else if (mode === 'choose') {
      const sorted = sortLegalTargets(mv.legalTargets, slotId, state);
      setTargetingMove(mv);
      setSelectedTarget(sorted[0] ?? '');
    } else if (mode === 'listed') {
      setTargetingMove(mv);
    } else {
      // labeled — target is game-determined, submit immediately
      onSubmitMove(mv.index, undefined, terastallize || undefined);
      setTerastallize(false);
    }
  }

  if (request.validMoves.length === 0 && request.canSwitch) {
    return (
      <SwitchPanel
        party={switchTargetMons}
        onSwitch={onSubmitSwitch}
        label="SWITCH REQUIRED"
      />
    );
  }

  if (showSwitch) {
    return (
      <SwitchPanel
        party={switchTargetMons}
        onSwitch={(id) => { onSubmitSwitch(id); setShowSwitch(false); }}
        onCancel={() => setShowSwitch(false)}
        label="CHOOSE POKÉMON"
      />
    );
  }

  return (
    <div style={{ background: '#0d0d1a', border: `2px solid ${accent}`, borderRadius: 8, padding: 16 }}>
      <div style={{ color: '#aaa', fontSize: 10, letterSpacing: 2, marginBottom: 10 }}>CHOOSE A MOVE</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {request.validMoves.map((mv) => {
          const disabled = mv.disabled || mv.pp === 0 || submitted;
          return (
            <button
              key={mv.index}
              disabled={disabled}
              onClick={() => handleMoveClick(mv)}
              style={{
                background: '#1a1a2e', border: `1px solid ${accent}`, color: '#fff',
                padding: '10px 12px', borderRadius: 4, fontFamily: 'inherit',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <span style={{ fontSize: 13, textTransform: 'capitalize' }}>{mv.moveId}</span>
              <span style={{ fontSize: 11, color: '#aaa' }}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>

      {targetingMove && (() => {
        const mode = classifyTarget(targetingMove.targetType);
        return (
          <div style={{ marginTop: 8, background: '#0d0d1a', border: `1px solid ${accent}`, borderRadius: 4, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#aaa', fontSize: 11 }}>
              {mode === 'choose' ? 'Target:' : 'Targets:'}
            </span>
            {mode === 'choose' ? (
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                style={{ flex: 1, background: '#111', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 }}
              >
                {sortLegalTargets(targetingMove.legalTargets, slotId, state).map((t) => (
                  <option key={t} value={t}>{getSlotDisplayName(state, t)}</option>
                ))}
              </select>
            ) : (
              <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
                {formatTargetNames(targetingMove.legalTargets, state)}
              </span>
            )}
            <button
              onClick={() => {
                const m = classifyTarget(targetingMove.targetType);
                onSubmitMove(targetingMove.index, m === 'choose' ? selectedTarget : undefined, terastallize || undefined);
                setTargetingMove(null);
                setSelectedTarget('');
                setTerastallize(false);
              }}
              style={{ background: accent, color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
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

      {request.canSwitch && !submitted && (
        <button
          onClick={() => setShowSwitch(true)}
          style={{
            background: '#1a3a1a', border: '1px solid #27ae60', color: '#fff',
            padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit',
            marginTop: 8, width: '100%', cursor: 'pointer',
          }}
        >
          SWITCH POKÉMON
        </button>
      )}

      {request.canTerastallize && !submitted && (
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
    </div>
  );
}
