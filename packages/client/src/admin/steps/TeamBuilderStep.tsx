import { useState, useCallback } from 'react';
import { TeamBuilder, slotStatus } from '../TeamBuilder.js';
import type { PokemonSet } from '@poke-fighter/shared';

interface SlotInfo { slotId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }
interface SlotTeam { slotId: string; displayName: string; team: PokemonSet[] }

interface Props {
  slots: { teamA: SlotInfo[]; teamB: SlotInfo[] };
  onNext: (slotTeams: SlotTeam[]) => void;
  onBack: () => void;
}

export function TeamBuilderStep({ slots, onNext, onBack }: Props) {
  const allSlots = [...slots.teamA, ...slots.teamB];
  const [activeSlot, setActiveSlot] = useState(allSlots[0]?.slotId ?? '');
  const [teams, setTeams] = useState<Record<string, PokemonSet[]>>(() => {
    const initial: Record<string, PokemonSet[]> = {};
    allSlots.forEach((slot) => {
      if (slot.defaultTeam && slot.defaultTeam.length > 0) {
        initial[slot.slotId] = slot.defaultTeam;
      }
    });
    return initial;
  });

  const handleTeamSaved = useCallback((team: PokemonSet[]) => {
    setTeams((prev) => ({ ...prev, [activeSlot]: team }));
  }, [activeSlot]);

  const allFilled = allSlots.every((s) => {
    const team = teams[s.slotId] ?? [];
    return team.length > 0 && team.every((p) => slotStatus(p) === 'complete');
  });

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Build Teams</h2>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {allSlots.map((slot) => (
          <button
            key={slot.slotId}
            onClick={() => setActiveSlot(slot.slotId)}
            style={{
              background: activeSlot === slot.slotId ? '#2980b9' : '#1a1a2e',
              border: `1px solid ${teams[slot.slotId] ? '#27ae60' : activeSlot === slot.slotId ? '#3498db' : '#555'}`,
              color: '#fff', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
            }}
          >
            {slot.displayName} {teams[slot.slotId] ? '✓' : '○'}
          </button>
        ))}
      </div>

      {activeSlot && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 6 }}>
          <TeamBuilder
            key={activeSlot}
            initialTeam={teams[activeSlot] ?? []}
            onTeamSaved={handleTeamSaved}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' }}>← BACK</button>
        <button
          onClick={() => onNext(allSlots.map((s) => ({ slotId: s.slotId, displayName: s.displayName, team: teams[s.slotId] ?? [] })))}
          disabled={!allFilled}
          style={{ background: allFilled ? '#2980b9' : '#333', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: allFilled ? 'pointer' : 'not-allowed', borderRadius: 4, fontFamily: 'inherit' }}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}
