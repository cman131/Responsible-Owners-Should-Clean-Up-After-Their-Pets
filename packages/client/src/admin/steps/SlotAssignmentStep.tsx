import { useState, useEffect } from 'react';
import { getSocket } from '../../socket.js';
import type { PlayerHealthPayload } from '@poke-fighter/shared';
import { getSlotReadiness, type SlotReadiness } from '../slotReadiness.js';

interface SlotConfig {
  slotId: string;
  type: 'player' | 'npc';
  displayName: string;
  profileId?: string;
  defaultTeam?: import('@poke-fighter/shared').PokemonSet[];
}

interface Props {
  teamASlots: number;
  teamBSlots: number;
  onNext: (slots: { teamA: SlotConfig[]; teamB: SlotConfig[] }) => void;
  onBack: () => void;
}

export function SlotAssignmentStep({ teamASlots, teamBSlots, onNext, onBack }: Props) {
  const [waitingPlayers, setWaitingPlayers] = useState<string[]>([]);
  const [savedPlayers, setSavedPlayers] = useState<{ profileId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }[]>([]);
  const [savedNpcs, setSavedNpcs] = useState<{ profileId: string; name: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }[]>([]);
  const [slots, setSlots] = useState<SlotConfig[]>(() => [
    ...Array.from({ length: teamASlots }, (_, i) => ({ slotId: `a${i + 1}`, type: 'player' as const, displayName: '' })),
    ...Array.from({ length: teamBSlots }, (_, i) => ({ slotId: `b${i + 1}`, type: 'npc' as const, displayName: '' })),
  ]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit('admin:action', { type: 'lobby:list', data: {} } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'players' } } as any);
    socket.emit('admin:action', { type: 'registry:list', data: { resource: 'npcs' } } as any);

    socket.on('lobby:players' as any, (players: string[]) => {
      setWaitingPlayers(players);
    });

    socket.on('registry:data' as any, (payload: any) => {
      if (payload.resource === 'players') {
        setSavedPlayers(payload.data.map((p: any) => ({
          profileId: p.profileId,
          displayName: p.displayName,
          defaultTeam: p.defaultTeam?.pokemon,
        })));
      }
      if (payload.resource === 'npcs') setSavedNpcs(payload.data.map((n: any) => ({ profileId: n.profileId, name: n.name, defaultTeam: n.team?.pokemon })));
    });

    return () => {
      socket.off('lobby:players' as any);
      socket.off('registry:data' as any);
    };
  }, []);

  const [healthById, setHealthById] = useState<Record<string, PlayerHealthPayload>>({});

  useEffect(() => {
    const socket = getSocket();
    function handleHealth(payload: PlayerHealthPayload) {
      setHealthById((prev) => ({ ...prev, [payload.profileId]: payload }));
    }
    socket.on('player:health', handleHealth);
    return () => { socket.off('player:health', handleHealth); };
  }, []);

  const playerIds = slots.flatMap((s) => (s.type === 'player' && s.profileId ? [s.profileId] : [])).join(',');

  useEffect(() => {
    for (const profileId of playerIds.split(',').filter(Boolean)) {
      getSocket().emit('admin:action', { type: 'registry:player-health', data: { profileId } });
    }
  }, [playerIds]);

  const readinessFor = (slot: SlotConfig): SlotReadiness =>
    getSlotReadiness(slot, slots, slot.profileId ? healthById[slot.profileId] : undefined);
  const blocked = slots.some((s) => readinessFor(s).blocker !== null);

  function updateSlot(index: number, update: Partial<SlotConfig>) {
    setSlots((prev) => prev.map((s, i) => i === index ? { ...s, ...update } : s));
  }

  const allFilled = slots.every((s) => s.displayName.trim());

  const usedNames = slots.map((s) => s.displayName).filter(Boolean);
  const duplicateNames = new Set(
    usedNames.filter((name, i) => usedNames.indexOf(name) !== i)
  );

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h2 style={{ color: '#f0c040', fontSize: 20 }}>Assign Slots</h2>

      <div style={{ display: 'flex', gap: 32 }}>
        <TeamColumn
          label="Team A"
          slots={slots.filter((s) => s.slotId.startsWith('a'))}
          startIndex={0}
          onUpdate={updateSlot}
          waitingPlayers={waitingPlayers}
          savedPlayers={savedPlayers}
          savedNpcs={savedNpcs}
          duplicateNames={duplicateNames}
          readinessFor={readinessFor}
        />
        <TeamColumn
          label="Team B"
          slots={slots.filter((s) => s.slotId.startsWith('b'))}
          startIndex={teamASlots}
          onUpdate={updateSlot}
          waitingPlayers={waitingPlayers}
          savedPlayers={savedPlayers}
          savedNpcs={savedNpcs}
          duplicateNames={duplicateNames}
          readinessFor={readinessFor}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ ...btnStyle, background: '#333' }}>← BACK</button>
        <button
          onClick={() => onNext({ teamA: slots.filter((s) => s.slotId.startsWith('a')), teamB: slots.filter((s) => s.slotId.startsWith('b')) })}
          style={{ ...btnStyle, background: '#2980b9' }}
          disabled={!allFilled || blocked}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}

function TeamColumn({ label, slots, startIndex, onUpdate, waitingPlayers, savedPlayers, savedNpcs, duplicateNames, readinessFor }: any) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ color: '#aaa', fontSize: 12, letterSpacing: 2, marginBottom: 12 }}>{label.toUpperCase()}</div>
      {slots.map((slot: any, i: number) => (
        <SlotRow key={slot.slotId} slot={slot} index={startIndex + i} onUpdate={onUpdate}
          waitingPlayers={waitingPlayers} savedPlayers={savedPlayers} savedNpcs={savedNpcs}
          duplicateNames={duplicateNames} readiness={readinessFor(slot)} />
      ))}
    </div>
  );
}

function SlotRow({ slot, index, onUpdate, waitingPlayers, savedPlayers, savedNpcs, duplicateNames, readiness }: any) {
  return (
    <div style={{ background: '#0d0d1a', border: '1px solid #333', borderRadius: 4, padding: 12, marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
      <select
        value={slot.type}
        onChange={(e) => onUpdate(index, { type: e.target.value as 'player' | 'npc', displayName: '', profileId: undefined, defaultTeam: undefined })}
        style={selectStyle}
      >
        <option value="player">Player</option>
        <option value="npc">NPC</option>
      </select>

      {slot.type === 'player' ? (
        <select
          value={slot.displayName}
          onChange={(e) => {
            const name = e.target.value;
            const player = savedPlayers.find((p: { profileId: string; displayName: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }) => p.displayName === name);
            onUpdate(index, { displayName: name, profileId: player?.profileId, defaultTeam: player?.defaultTeam });
          }}
          style={selectStyle}
        >
          <option value="">— select player —</option>
          {waitingPlayers.map((name: string) => <option key={name} value={name}>{name} (online)</option>)}
          {savedPlayers.map((p: any) => <option key={p.profileId} value={p.displayName}>{p.displayName} (saved)</option>)}
        </select>
      ) : (
        <select
          value={slot.displayName}
          onChange={(e) => {
            const name = e.target.value;
            const npc = savedNpcs.find((n: { profileId: string; name: string; defaultTeam?: import('@poke-fighter/shared').PokemonSet[] }) => n.name === name);
            onUpdate(index, { displayName: name, profileId: npc?.profileId, defaultTeam: npc?.defaultTeam });
          }}
          style={selectStyle}
        >
          <option value="">— select NPC —</option>
          {savedNpcs.map((n: any) => <option key={n.profileId} value={n.name}>{n.name}</option>)}
        </select>
      )}

      <span style={{ color: slot.displayName ? '#2ecc71' : '#555', fontSize: 12 }}>
        {slot.displayName ? '✓' : '○'}
      </span>
      {duplicateNames?.has(slot.displayName) && (
        <span style={{ color: '#f0c040', fontSize: 10 }}>⚠ duplicate</span>
      )}
      {readiness.blocker && <span style={{ color: '#e74c3c', fontSize: 10 }}>{readiness.blocker}</span>}
      {readiness.summary && <span style={{ color: '#f0c040', fontSize: 10 }}>{readiness.summary}</span>}
    </div>
  );
}

const btnStyle = { color: '#fff', border: 'none', padding: '10px 24px', fontSize: 14, letterSpacing: 2, cursor: 'pointer', borderRadius: 4, fontFamily: 'inherit' };
const selectStyle = { background: '#1a1a2e', color: '#fff', border: '1px solid #555', padding: '6px 8px', borderRadius: 4, fontFamily: 'inherit', flex: 1 };
