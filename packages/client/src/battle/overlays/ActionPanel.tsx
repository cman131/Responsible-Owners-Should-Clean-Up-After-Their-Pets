import { useState, useEffect } from 'react';
import { classifyTarget, sortLegalTargets, getSlotDisplayName, formatTargetNames } from '../targeting.js';
import { SwitchPanel } from './SwitchPanel.js';
import { TYPE_COLORS } from '../../pokemonTypeColors.js';
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

function formatMoveName(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const LOCKED_LABELS: Record<NonNullable<ActionRequestPayload['lockedReason']>, string> = {
  recharge: 'MUST RECHARGE',
  bide: 'STORING ENERGY',
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
          disabled={submitted}
          onClick={() => onSubmitMove(0)}
          style={{ background: accent, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 4, cursor: submitted ? 'not-allowed' : 'pointer', opacity: submitted ? 0.4 : 1, fontFamily: 'inherit', fontSize: 12 }}
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
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                <span style={{
                  background: TYPE_COLORS[mv.type] ?? '#666',
                  borderRadius: 3, padding: '1px 5px', fontSize: 10, color: '#fff',
                  flexShrink: 0,
                }}>{mv.type}</span>
                <span style={{ fontSize: 13 }}>{formatMoveName(mv.moveId)}</span>
              </div>
              <span style={{ fontSize: 11, color: '#aaa' }}>PP {mv.pp}</span>
            </button>
          );
        })}
      </div>

      {targetingMove && (() => {
        const mode = classifyTarget(targetingMove.targetType);
        return (
          <div style={{ marginTop: 8, background: '#0d0d1a', border: `1px solid ${accent}`, borderRadius: 4, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: mode === 'choose' ? 6 : 0 }}>
              <span style={{ color: '#aaa', fontSize: 11 }}>
                {mode === 'choose' ? 'Target:' : 'Targets:'}
              </span>
              {mode === 'listed' && (
                <span style={{ flex: 1, color: '#fff', fontSize: 12 }}>
                  {formatTargetNames(targetingMove.legalTargets, state)}
                </span>
              )}
              {mode === 'listed' && (
                <button
                  onClick={() => {
                    onSubmitMove(targetingMove.index, undefined, terastallize || undefined);
                    setTargetingMove(null);
                    setTerastallize(false);
                  }}
                  style={{ background: accent, color: '#fff', border: 'none', padding: '4px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
                >
                  Confirm
                </button>
              )}
              <button
                onClick={() => { setTargetingMove(null); setSelectedTarget(''); }}
                style={{ background: 'none', border: '1px solid #555', color: '#aaa', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
              >
                ✕
              </button>
            </div>
            {mode === 'choose' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sortLegalTargets(targetingMove.legalTargets, slotId, state).map((targetSlotId) => {
                  const targetSlot = state.teams.flatMap(t => t.slots).find(s => s.slotId === targetSlotId);
                  const activeMon = targetSlot?.party[targetSlot.activePokemonIndex];
                  const hpPct = activeMon ? Math.round((activeMon.currentHp / activeMon.maxHp) * 100) : null;
                  const hpColor = hpPct === null ? '#aaa' : hpPct > 50 ? '#27ae60' : hpPct > 25 ? '#f39c12' : '#e74c3c';
                  return (
                    <button
                      key={targetSlotId}
                      onClick={() => {
                        onSubmitMove(targetingMove.index, targetSlotId, terastallize || undefined);
                        setTargetingMove(null);
                        setSelectedTarget('');
                        setTerastallize(false);
                      }}
                      style={{
                        background: '#1a1a2e', border: `1px solid ${accent}`, color: '#fff',
                        padding: '6px 12px', borderRadius: 4, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      {getSlotDisplayName(state, targetSlotId)}
                      {hpPct !== null && (
                        <span style={{ color: hpColor, fontSize: 11 }}>{hpPct}% HP</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
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
