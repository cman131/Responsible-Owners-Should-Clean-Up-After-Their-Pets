// packages/client/src/admin/RegistryPanel.tsx
import { useState, useEffect } from 'react';
import { getSocket } from '../socket.js';
import { ProfileEditor } from './ProfileEditor.js';
import type { NpcProfile, PlayerProfile } from '@poke-fighter/shared';

type ActiveTab = 'npcs' | 'players';
type View =
  | { kind: 'list' }
  | { kind: 'editor'; type: 'npc'; profile: NpcProfile | null }
  | { kind: 'editor'; type: 'player'; profile: PlayerProfile | null };

interface Props { onBack: () => void }

export function RegistryPanel({ onBack }: Props) {
  const [npcs, setNpcs] = useState<NpcProfile[]>([]);
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('npcs');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [filter, setFilter] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } } as any);
    const handler = (payload: { resource: string; data: unknown[] }) => {
      if (payload.resource === 'npcs') setNpcs(payload.data as NpcProfile[]);
      if (payload.resource === 'players') setPlayers(payload.data as PlayerProfile[]);
    };
    socket.on('registry:data' as any, handler);
    return () => { socket.off('registry:data' as any, handler); };
  }, []);

  if (view.kind === 'editor') {
    return <ProfileEditor type={view.type} profile={view.profile} onBack={() => setView({ kind: 'list' })} />;
  }

  const items = activeTab === 'npcs' ? npcs : players;
  const getName = (item: NpcProfile | PlayerProfile) => 'name' in item ? item.name : item.displayName;
  const getPokemonCount = (item: NpcProfile | PlayerProfile) =>
    'team' in item ? item.team.pokemon.length : (item.defaultTeam?.pokemon.length ?? 0);
  const visible = items.filter((p) => getName(p).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← HUB</button>
          <h1 style={{ color: '#27ae60', letterSpacing: 4 }}>REGISTRY</h1>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #333', marginBottom: 16 }}>
          {(['npcs', 'players'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '8px 20px', background: activeTab === tab ? '#27ae60' : '#1a1a2e', color: activeTab === tab ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 2 }}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ color: '#aaa', fontSize: 12 }}>{items.length} {activeTab === 'npcs' ? 'NPCs' : 'Players'} saved</span>
          <button
            onClick={() => setView({ kind: 'editor', type: activeTab === 'npcs' ? 'npc' : 'player', profile: null })}
            style={{ background: '#27ae60', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
          >
            + NEW {activeTab === 'npcs' ? 'NPC' : 'PLAYER'}
          </button>
        </div>

        <input
          placeholder="Search…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: '100%', background: '#111', border: '1px solid #333', borderRadius: 4, color: '#fff', padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visible.map((item) => (
            <div key={item.profileId} style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: '#fff', flex: 1, fontSize: 13 }}>{getName(item)}</span>
              <span style={{ color: '#f0c040', fontSize: 11, background: '#1a1a00', padding: '2px 8px', borderRadius: 3 }}>
                {getPokemonCount(item)} Pokémon
              </span>
              <button onClick={() => setView({ kind: 'editor', type: activeTab === 'npcs' ? 'npc' : 'player', profile: item as any })} style={{ ...actionBtn, background: '#2980b9' }}>EDIT</button>
              {confirmDelete === item.profileId ? (
                <span>
                  Delete {getName(item)}?{' '}
                  <button onClick={() => { getSocket().emit('admin:action', { type: activeTab === 'npcs' ? 'registry:delete-npc' : 'registry:delete-player', data: { profileId: item.profileId } } as any); setConfirmDelete(null); }} style={{ ...actionBtn, background: '#c0392b' }}>Yes</button>
                  {' '}
                  <button onClick={() => setConfirmDelete(null)} style={{ ...actionBtn, background: '#555' }}>No</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDelete(item.profileId)} style={{ ...actionBtn, background: '#c0392b' }}>DEL</button>
              )}
            </div>
          ))}
          {visible.length === 0 && (
            <div style={{ color: '#555', textAlign: 'center', padding: 32, fontSize: 13 }}>
              {items.length === 0
                ? `No ${activeTab === 'npcs' ? 'NPCs' : 'Players'} yet. Click + NEW to add one.`
                : 'No results match your search.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 };
