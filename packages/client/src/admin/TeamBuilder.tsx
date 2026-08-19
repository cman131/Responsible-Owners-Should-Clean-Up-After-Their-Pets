import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import type { PokemonSpecies, PokemonSet } from '@poke-fighter/shared';

interface Props {
  onTeamSaved: (team: PokemonSet[]) => void;
  initialTeam?: PokemonSet[];
}

export function TeamBuilder({ onTeamSaved, initialTeam = [] }: Props) {
  const [team, setTeam] = useState<Partial<PokemonSet>[]>(initialTeam.length > 0 ? initialTeam : [{}]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PokemonSpecies[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);

  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: any) => {
      if (payload.resource === 'pokemon') setSearchResults(payload.results);
    };
    socket.on('data:results' as any, handler);
    return () => { socket.off('data:results' as any, handler); };
  }, []);

  function searchPokemon(q: string) {
    setSearch(q);
    if (q.length >= 2) {
      getSocket().emit('admin:action', { type: 'data:query', data: { resource: 'pokemon', query: q } } as any);
    } else {
      setSearchResults([]);
    }
  }

  function pickPokemon(species: PokemonSpecies) {
    const updated = [...team];
    updated[selectedSlot] = {
      speciesId: species.id,
      level: 50,
      ability: Object.values(species.abilities)[0] ?? '',
      moves: ['', '', '', ''] as [string, string, string, string],
      evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      nature: 'hardy',
    };
    setTeam(updated);
    setSearchResults([]);
    setSearch('');
  }

  function updateSlotField(index: number, field: keyof PokemonSet, value: unknown) {
    const updated = [...team];
    updated[index] = { ...updated[index], [field]: value };
    setTeam(updated);
  }

  const isValid = team.length > 0 && team.some((s) => s.speciesId) && team.every((s) => !s.speciesId || (s.moves?.every(Boolean)));

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ color: '#f0c040', fontSize: 14, letterSpacing: 1 }}>TEAM BUILDER</div>

      {/* Slot tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <button
            key={i}
            onClick={() => { setSelectedSlot(i); if (!team[i]) { const t = [...team]; t[i] = {}; setTeam(t); } }}
            style={{
              background: selectedSlot === i ? '#2980b9' : '#1a1a2e',
              border: `1px solid ${selectedSlot === i ? '#3498db' : '#333'}`,
              color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
            }}
          >
            {team[i]?.speciesId ? `#${team[i]!.speciesId}` : `Slot ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Pokemon search */}
      <div>
        <input
          placeholder="Search Pokemon by name or dex number..."
          value={search}
          onChange={(e) => searchPokemon(e.target.value)}
          style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '6px 10px', borderRadius: 4, fontFamily: 'inherit', width: '100%', fontSize: 13 }}
        />
        {searchResults.length > 0 && (
          <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
            {searchResults.map((s) => (
              <div
                key={s.id}
                onClick={() => pickPokemon(s)}
                style={{ padding: '6px 10px', cursor: 'pointer', color: '#fff', fontSize: 12, borderBottom: '1px solid #222' }}
              >
                #{s.id} {s.displayName} [{s.types.join('/')}]
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slot editor */}
      {team[selectedSlot]?.speciesId && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ color: '#aaa', fontSize: 11 }}>Species #{team[selectedSlot]!.speciesId} — slot {selectedSlot + 1}</div>
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
            <label style={lbl}>Moves (IDs)</label>
            {[0, 1, 2, 3].map((mi) => (
              <input key={mi} placeholder={`Move ${mi + 1} id`}
                value={(team[selectedSlot]?.moves ?? [])[mi] ?? ''}
                onChange={(e) => {
                  const moves = [...((team[selectedSlot]?.moves ?? ['', '', '', '']) as string[])];
                  moves[mi] = e.target.value;
                  updateSlotField(selectedSlot, 'moves', moves as [string, string, string, string]);
                }}
                style={{ ...inp, display: 'block', marginBottom: 4, width: '100%' }} />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => onTeamSaved(team.filter((s): s is PokemonSet => !!s.speciesId))}
        disabled={!isValid}
        style={{ background: isValid ? '#27ae60' : '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 4, cursor: isValid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 13, letterSpacing: 1 }}
      >
        SAVE TEAM ({team.filter((s) => s.speciesId).length}/6)
      </button>
    </div>
  );
}

const lbl: React.CSSProperties = { color: '#aaa', fontSize: 11, minWidth: 50 };
const inp: React.CSSProperties = { background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12 };
