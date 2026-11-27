import { useEffect, useState } from 'react';
import type { PlayerHealthPayload, PokemonSet } from '@poke-fighter/shared';
import { getSocket } from '../socket.js';
import { PokemonHealthList } from '../components/PokemonHealthList.js';

interface Props {
  profileId: string;
  team: PokemonSet[];
  bank: PokemonSet[];
}

export function HealthTab({ profileId, team, bank }: Props) {
  const [health, setHealth] = useState<PlayerHealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    function handleHealth(payload: PlayerHealthPayload) {
      if (payload.profileId === profileId) {
        setHealth(payload);
        setError(null);
      }
    }
    function handleError(payload: { type: string; message: string }) {
      if (payload.type === 'registry:heal-player') {
        setError(payload.message);
      }
    }
    socket.on('player:health', handleHealth);
    socket.on('registry:error', handleError);
    socket.emit('admin:action', { type: 'registry:player-health', data: { profileId } });
    return () => {
      socket.off('player:health', handleHealth);
      socket.off('registry:error', handleError);
    };
  }, [profileId]);

  function heal(pokemonId?: string) {
    getSocket().emit('admin:action', {
      type: 'registry:heal-player',
      data: { profileId, ...(pokemonId !== undefined ? { pokemonId } : {}) },
    });
  }

  const disabled = health === null || health.inBattle;
  const healButton = (label: string, pokemonId?: string) => (
    <button
      onClick={() => heal(pokemonId)}
      disabled={disabled}
      style={{ background: disabled ? '#555' : '#27ae60', border: 'none', color: '#fff', padding: '4px 10px', borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1 }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ color: '#888', fontSize: 11 }}>Healing applies immediately. Save and Discard don't affect it.</span>
        {healButton('HEAL ALL')}
      </div>
      {health?.inBattle && <div style={{ color: '#f0c040', fontSize: 11 }}>In battle. Healing is available after it ends.</div>}
      {error && <div style={{ color: '#e74c3c', fontSize: 11 }}>{error}</div>}
      <PokemonHealthList title="TEAM" pokemon={team} health={health?.pokemon ?? []} renderAction={(e) => healButton('HEAL', e.pokemonId)} />
      <PokemonHealthList title="BANK" pokemon={bank} health={health?.pokemon ?? []} renderAction={(e) => healButton('HEAL', e.pokemonId)} />
    </div>
  );
}
