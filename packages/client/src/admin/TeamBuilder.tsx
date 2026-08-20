import { useState, useEffect } from 'react';
import type { PokemonSet } from '@poke-fighter/shared';
import { PokemonSlotEditor } from './PokemonSlotEditor.js';

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

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
            style={{ background: selectedSlot === i ? '#2980b9' : '#1a1a2e', border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            {team[i]?.speciesId ? (team[i]!.nickname ?? `#${team[i]!.speciesId}`) : `Slot ${i + 1}`}
          </button>
        ))}
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
