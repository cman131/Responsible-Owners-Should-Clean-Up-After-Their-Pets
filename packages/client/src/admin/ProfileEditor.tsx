// packages/client/src/admin/ProfileEditor.tsx
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamBuilder } from './TeamBuilder.js';
import type { NpcProfile, PlayerProfile, PokemonSet } from '@poke-fighter/shared';

interface Props {
  type: 'npc' | 'player';
  profile: NpcProfile | PlayerProfile | null;
  onBack: () => void;
}

export function ProfileEditor({ type, profile, onBack }: Props) {
  const existingName = profile
    ? ('name' in profile ? profile.name : profile.displayName)
    : '';
  const existingTeam: PokemonSet[] = profile
    ? ('team' in profile ? profile.team.pokemon : (profile.defaultTeam?.pokemon ?? []))
    : [];

  const [name, setName] = useState(existingName);
  const [team, setTeam] = useState<PokemonSet[]>(existingTeam);

  const isNew = profile === null;
  const isValid = name.trim().length > 0 && team.length > 0;
  const typeLabel = type === 'npc' ? 'NPC' : 'PLAYER';
  const nameLabel = type === 'npc' ? 'NAME' : 'DISPLAY NAME';
  const namePlaceholder = type === 'npc' ? 'e.g. Gym Leader Misty' : 'e.g. Ash Ketchum';

  function handleSave() {
    const socket = getSocket();
    const now = new Date().toISOString();
    if (type === 'npc') {
      const npcProfile: NpcProfile = {
        profileId: profile?.profileId ?? uuidv4(),
        name: name.trim(),
        team: { templateId: uuidv4(), name: `${name.trim()}'s Team`, pokemon: team, createdAt: now },
        createdAt: profile?.createdAt ?? now,
      };
      socket.emit('admin:action', { type: 'registry:save-npc', data: { profile: npcProfile } } as any);
    } else {
      const playerProfile: PlayerProfile = {
        profileId: profile?.profileId ?? uuidv4(),
        displayName: name.trim(),
        defaultTeam: { templateId: uuidv4(), name: `${name.trim()}'s Team`, pokemon: team, createdAt: now },
        createdAt: profile?.createdAt ?? now,
      };
      socket.emit('admin:action', { type: 'registry:save-player', data: { profile: playerProfile } } as any);
    }
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← Back to {type === 'npc' ? 'NPCs' : 'Players'}</button>
          <span style={{ color: '#f0c040', fontSize: 14, letterSpacing: 2 }}>{isNew ? 'NEW' : 'EDIT'} {typeLabel}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...actionBtn, background: '#c0392b' }}>DISCARD</button>
            <button onClick={handleSave} disabled={!isValid} style={{ ...actionBtn, background: isValid ? '#27ae60' : '#555', cursor: isValid ? 'pointer' : 'not-allowed' }}>SAVE</button>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>{nameLabel}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={namePlaceholder}
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4 }}>
          <TeamBuilder initialTeam={existingTeam} onTeamSaved={setTeam} />
        </div>

        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0 ? 'Name is required.' : 'Add at least 1 Pokémon with all 4 moves filled.'}
          </div>
        )}
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };
