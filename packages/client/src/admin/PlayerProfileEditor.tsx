import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getSocket } from '../socket.js';
import { TeamBuilder, slotStatus } from './TeamBuilder.js';
import { BankTab } from './BankTab.js';
import { InventoryTab } from './InventoryTab.js';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

interface Props {
  profile: PlayerProfile | null;
  onBack: () => void;
}

function computeLeased(team: PokemonSet[], bank: PokemonSet[]): Record<string, number> {
  const leased: Record<string, number> = {};
  for (const p of [...team, ...bank]) {
    if (p.heldItem) leased[p.heldItem] = (leased[p.heldItem] ?? 0) + 1;
  }
  return leased;
}

export function PlayerProfileEditor({ profile, onBack }: Props) {
  const [name, setName] = useState(profile?.displayName ?? '');
  const [playerKey, setPlayerKey] = useState(profile?.playerKey ?? '');
  const [team, setTeam] = useState<PokemonSet[]>(profile?.defaultTeam?.pokemon ?? []);
  const [bank, setBank] = useState<PokemonSet[]>(profile?.bank ?? []);
  const [inventory, setInventory] = useState<Record<string, number>>(profile?.inventory ?? {});
  const [tab, setTab] = useState<'team' | 'bank' | 'inventory'>('team');
  const [teamKey, setTeamKey] = useState(0);

  const isNew = profile === null;
  const teamComplete = team.length === 0 || team.every((p) => slotStatus(p) === 'complete');
  const leasedItems = computeLeased(team, bank);
  const overLeased = Object.entries(leasedItems).some(([itemId, count]) => count > (inventory[itemId] ?? 0));
  const isValid = name.trim().length > 0 && teamComplete && !overLeased;

  function handleSendToBank(pokemon: PokemonSet) {
    setBank((prev) => [...prev, pokemon]);
  }

  function handleMoveToTeam(pokemon: PokemonSet) {
    if (team.length >= 6) return;
    const next = [...team, pokemon];
    setTeam(next);
    setBank((prev) => prev.filter((p) => p !== pokemon));
    setTeamKey((k) => k + 1);
    setTab('team');
  }

  function handleSave() {
    const socket = getSocket();
    const now = new Date().toISOString();
    const playerProfile: PlayerProfile = {
      profileId: profile?.profileId ?? uuidv4(),
      displayName: name.trim(),
      ...(playerKey.trim().length > 0 ? { playerKey: playerKey.trim() } : {}),
      ...(team.length > 0 ? {
        defaultTeam: {
          templateId: profile?.defaultTeam?.templateId ?? uuidv4(),
          name: `${name.trim()}'s Team`,
          pokemon: team,
          createdAt: profile?.defaultTeam?.createdAt ?? now,
        },
      } : {}),
      bank,
      inventory,
      createdAt: profile?.createdAt ?? now,
    };
    socket.emit('admin:action', { type: 'registry:save-player', data: { profile: playerProfile } } as any);
    onBack();
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d1a', padding: 32 }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <button onClick={onBack} style={backBtn}>← Back to Players</button>
          <span style={{ color: '#f0c040', fontSize: 14, letterSpacing: 2 }}>{isNew ? 'NEW' : 'EDIT'} PLAYER</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onBack} style={{ ...actionBtn, background: '#c0392b' }}>DISCARD</button>
            <button onClick={handleSave} disabled={!isValid} style={{ ...actionBtn, background: isValid ? '#27ae60' : '#555', cursor: isValid ? 'pointer' : 'not-allowed' }}>SAVE</button>
          </div>
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>DISPLAY NAME</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ash Ketchum"
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 11, letterSpacing: 2, display: 'block', marginBottom: 8 }}>PLAYER KEY</label>
          <input
            value={playerKey}
            onChange={(e) => setPlayerKey(e.target.value)}
            placeholder="Plaintext key for player portal access"
            style={{ background: '#1a1a2e', border: '1px solid #555', color: '#fff', padding: '8px 12px', borderRadius: 4, fontFamily: 'inherit', fontSize: 14, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
          {(['team', 'bank', 'inventory'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ padding: '8px 20px', background: tab === t ? TAB_COLOR[t] : '#1a1a2e', color: tab === t ? '#fff' : '#888', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, letterSpacing: 2 }}
            >
              {t === 'team' ? `TEAM (${team.length}/6)` : t === 'bank' ? `BANK (${bank.length})` : `INVENTORY (${Object.keys(inventory).length})`}
            </button>
          ))}
        </div>

        <div style={{ background: '#111', border: '1px solid #333', borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
          <div style={{ display: tab === 'team' ? 'block' : 'none' }}>
            <TeamBuilder
              key={teamKey}
              initialTeam={team}
              initialSelectedSlot={team.length > 0 ? team.length - 1 : 0}
              onTeamSaved={setTeam}
              onSendToBank={handleSendToBank}
              inventory={inventory}
              leasedItems={leasedItems}
            />
          </div>
          <div style={{ display: tab === 'bank' ? 'block' : 'none', padding: 16 }}>
            <BankTab
              bank={bank}
              teamSize={team.length}
              onBankChange={setBank}
              onMoveToTeam={handleMoveToTeam}
              inventory={inventory}
              leasedItems={leasedItems}
            />
          </div>
          <div style={{ display: tab === 'inventory' ? 'block' : 'none', padding: 16 }}>
            <InventoryTab inventory={inventory} onInventoryChange={setInventory} />
          </div>
        </div>

        {!isValid && (
          <div style={{ marginTop: 8, color: '#e74c3c', fontSize: 11 }}>
            {name.trim().length === 0
              ? 'Name is required.'
              : overLeased
              ? 'A held item exceeds inventory — reduce usage or add more to inventory.'
              : 'All Pokémon must have at least one move.'}
          </div>
        )}
      </div>
    </div>
  );
}

const TAB_COLOR: Record<'team' | 'bank' | 'inventory', string> = { team: '#2980b9', bank: '#27ae60', inventory: '#8e44ad' };
const backBtn: React.CSSProperties = { background: 'none', border: '1px solid #555', color: '#aaa', padding: '5px 12px', borderRadius: 3, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 };
const actionBtn: React.CSSProperties = { border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 3, fontFamily: 'inherit', fontSize: 12, letterSpacing: 1 };
