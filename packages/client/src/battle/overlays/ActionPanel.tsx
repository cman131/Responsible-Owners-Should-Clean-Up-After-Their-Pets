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

  return <div />;
}
