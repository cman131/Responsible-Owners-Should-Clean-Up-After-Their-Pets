// packages/client/src/admin/TeamBuilder.tsx
import { useState, useEffect } from 'react';
import type { PokemonSpecies, PokemonSet } from '@poke-fighter/shared';
import { PokemonSearchDropdown } from './PokemonSearchDropdown.js';
import { MoveSearchDropdown } from './MoveSearchDropdown.js';
import { TYPE_COLORS } from './pokemonTypeColors.js';

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
}

export function TeamBuilder({ onTeamSaved, initialTeam = [] }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [slotSpecies, setSlotSpecies] = useState<(PokemonSpecies | null)[]>(Array(6).fill(null));
  const [selectedSlot, setSelectedSlot] = useState(0);

  function pickPokemon(species: PokemonSpecies) {
    const updated = [...team];
    updated[selectedSlot] = {
      speciesId: species.id,
      nickname: species.displayName,
      level: 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: ['', '', '', ''] as [string, string, string, string],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'hardy',
    };
    setTeam(updated);
    const updatedSpecies = [...slotSpecies];
    updatedSpecies[selectedSlot] = species;
    setSlotSpecies(updatedSpecies);
  }

  function updateSlotField(index: number, field: keyof PokemonSet, value: unknown) {
    const updated = [...team];
    updated[index] = { ...updated[index], [field]: value };
    setTeam(updated);
  }

  const currentSpecies = slotSpecies[selectedSlot];

  useEffect(() => {
    onTeamSaved(team.filter((s): s is PokemonSet => !!s.speciesId));
  }, [team, onTeamSaved]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      {/* Slot tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
            style={{ background: selectedSlot === i ? '#2980b9' : '#1a1a2e', border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`, color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            {team[i]?.speciesId
                ? (slotSpecies[i]?.displayName ?? team[i]!.nickname ?? `#${team[i]!.speciesId}`)
                : `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Search */}
      <PokemonSearchDropdown onSelect={pickPokemon} />

      {/* Species summary — only shown after picking via dropdown in this session */}
      {currentSpecies && (
        <div style={{ background: '#0d1a2e', border: '1px solid #2980b9', borderRadius: 4, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, flexWrap: 'wrap' }}>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{currentSpecies.displayName}</span>
          <span style={{ color: '#888' }}>#{currentSpecies.id}</span>
          <span style={{ display: 'flex', gap: 3 }}>
            {currentSpecies.types.map((t) => (
              <span key={t} style={{ background: TYPE_COLORS[t] ?? '#555', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 10 }}>{t}</span>
            ))}
          </span>
          <span style={{ color: '#aaa', marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const).map((stat) => (
              <span key={stat}>
                <span style={{ color: '#666', fontSize: 9 }}>{stat.toUpperCase()} </span>
                <span style={{ color: '#ccc' }}>{currentSpecies.baseStats[stat]}</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {/* Slot editor */}
      {team[selectedSlot]?.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#aaa', fontSize: 11 }}>{currentSpecies?.displayName ?? team[selectedSlot]?.nickname ?? `#${team[selectedSlot]!.speciesId}`} — slot {selectedSlot + 1}</div>
            <img
              src={currentSpecies
                ? `https://play.pokemonshowdown.com/sprites/ani/${currentSpecies.name}.gif`
                : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${team[selectedSlot]!.speciesId}.png`}
              alt=""
              style={{ imageRendering: 'pixelated', width: 80, height: 80 }}
              loading="lazy"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Name</label>
            <input
              value={team[selectedSlot]?.nickname ?? ''}
              onChange={(e) => updateSlotField(selectedSlot, 'nickname', e.target.value.slice(0, 20))}
              maxLength={20}
              style={{ ...inp, width: 160 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Level</label>
            <input type="number" min={1} max={100} value={team[selectedSlot]?.level ?? 50}
              onChange={(e) => updateSlotField(selectedSlot, 'level', Number(e.target.value))}
              style={{ ...inp, width: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={lbl}>Nature</label>
            <input value={team[selectedSlot]?.nature ?? 'hardy'}
              onChange={(e) => updateSlotField(selectedSlot, 'nature', e.target.value)}
              style={{ ...inp, width: 100 }} />
          </div>
          <div>
            <label style={lbl}>Moves</label>
            {[0, 1, 2, 3].map((mi) => (
              <div key={mi} style={{ marginBottom: 8 }}>
                <MoveSearchDropdown
                  speciesId={team[selectedSlot]!.speciesId!}
                  value={((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])[mi] ?? ''}
                  selectedMoves={(team[selectedSlot]?.moves ?? ['', '', '', '']) as string[]}
                  onChange={(moveId) => {
                    const moves = [...((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])];
                    moves[mi] = moveId;
                    updateSlotField(selectedSlot, 'moves', moves as [string, string, string, string]);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 52 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
