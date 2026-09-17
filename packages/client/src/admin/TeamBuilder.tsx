import { useState, useEffect } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { PokemonSlotEditor } from './PokemonSlotEditor.js';

export function slotStatus(p: Partial<PokemonSet> | undefined): 'empty' | 'incomplete' | 'complete' {
  if (!p?.speciesId) return 'empty';
  if (!(p.moves ?? []).some(Boolean)) return 'incomplete';
  return 'complete';
}

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
  onSendToBank?: (pokemon: PokemonSet) => void;
}

export function TeamBuilder({ onTeamSaved, initialTeam = [], onSendToBank }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [selectedSlot, setSelectedSlot] = useState(0);

  function handleSlotChange(updated: Partial<PokemonSet>) {
    const next = [...team];
    next[selectedSlot] = updated;
    setTeam(next);
  }

  function handleSendToBank() {
    const pokemon = team[selectedSlot] as PokemonSet;
    onSendToBank!(pokemon);
    const next = [...team];
    next[selectedSlot] = {};
    setTeam(next);
  }

  useEffect(() => {
    onTeamSaved(team.filter((s): s is PokemonSet => !!s.speciesId));
  }, [team, onTeamSaved]);

  const filledCount = team.filter(s => !!s.speciesId).length;
  const visibleSlots = Math.min(filledCount + 1, 6);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: visibleSlots }, (_, i) => {
          const status = slotStatus(team[i]);
          const isSelected = selectedSlot === i;
          const borderColor =
            status === 'complete'   ? '#27ae60' :
            status === 'incomplete' ? '#f0c040' :
            isSelected              ? '#3498db' : '#333';
          const label = team[i]?.speciesId
            ? (team[i]!.nickname ?? `#${team[i]!.speciesId}`)
            : i < visibleSlots - 1 ? `Slot ${i + 1}` : '+ Add';

          return (
            <button
              key={i}
              onClick={() => {
                setSelectedSlot(i);
                if (!team[i]) {
                  const t = [...team];
                  t[i] = {};
                  setTeam(t);
                }
              }}
              style={{ background: isSelected ? '#2980b9' : '#1a1a2e', border: `1px solid ${borderColor}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <PokemonSlotEditor
        key={selectedSlot}
        value={team[selectedSlot] ?? {}}
        onChange={handleSlotChange}
      />

      {onSendToBank && team[selectedSlot]?.speciesId && (
        <button
          onClick={handleSendToBank}
          style={{ background: '#c0392b', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1, alignSelf: 'flex-start' }}
        >
          → SEND TO BANK
        </button>
      )}
    </div>
  );
}
