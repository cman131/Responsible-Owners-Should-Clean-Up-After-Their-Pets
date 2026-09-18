import { useState } from 'react';
import type { BattleState, SlotState } from '@poke-fighter/shared';
import { toShowdownId } from './utils.js';
import './battle-animations.css';

interface Props {
  state: BattleState;
  mySlotId: string;
  animatingSlots?: Map<string, 'attack' | 'hit' | 'faint'>;
}

export function BattleScene({ state, mySlotId, animatingSlots }: Props) {
  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const resolvedMyTeamIdx = myTeamIdx === -1 ? 0 : myTeamIdx;
  const foeTeamIdx = resolvedMyTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[resolvedMyTeamIdx];
  const foeTeam = state.teams[foeTeamIdx];

  const mySlot = myTeam?.slots.find((s) => s.slotId === mySlotId);
  const allySlots = myTeam?.slots.filter((s) => s.slotId !== mySlotId && !s.isSpectator) ?? [];
  const foeSlots = foeTeam?.slots.filter((s) => !s.isSpectator) ?? [];

  return (
    <div style={{
      position: 'relative',
      width: 800,
      height: 240,
      background: 'linear-gradient(to bottom, #87ceeb 55%, #5a8a3a 55%)',
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {mySlot && <SpriteSlot slot={mySlot} role="own" index={0} animatingSlots={animatingSlots} />}
      {allySlots.map((slot, i) => (
        <SpriteSlot key={slot.slotId} slot={slot} role="ally" index={i} animatingSlots={animatingSlots} />
      ))}
      {foeSlots.map((slot, i) => (
        <SpriteSlot key={slot.slotId} slot={slot} role="foe" index={i} animatingSlots={animatingSlots} />
      ))}
    </div>
  );
}

interface SpriteSlotProps {
  slot: SlotState;
  role: 'own' | 'ally' | 'foe';
  index: number;
  animatingSlots: Map<string, 'attack' | 'hit' | 'faint'> | undefined;
}

function SpriteSlot({ slot, role, index, animatingSlots }: SpriteSlotProps) {
  const [imgError, setImgError] = useState(false);

  const mon = slot.party[slot.activePokemonIndex];
  const animKind = animatingSlots?.get(slot.slotId);
  if (!mon || (mon.fainted && animKind !== 'faint')) return null;

  let animClassName: string | undefined;
  if (animKind === 'attack') {
    animClassName = role === 'foe' ? 'anim-attack-left' : 'anim-attack-right';
  } else if (animKind === 'hit') {
    animClassName = 'anim-hit';
  } else if (animKind === 'faint') {
    animClassName = 'anim-faint';
  }

  const pos: React.CSSProperties = role === 'own'
    ? { bottom: 18, left: 60, width: 72, height: 72 }
    : role === 'ally'
    ? { bottom: 24, left: 155 + index * 60, width: 54, height: 54, opacity: 0.85 }
    : index === 0
    ? { top: 18, right: 60, width: 64, height: 64 }
    : { top: 30, right: 145 + index * 60, width: 50, height: 50, opacity: 0.85 };

  const url = role === 'foe'
    ? `https://play.pokemonshowdown.com/sprites/ani/${toShowdownId(mon.speciesName)}.gif`
    : `https://play.pokemonshowdown.com/sprites/ani-back/${toShowdownId(mon.speciesName)}.gif`;

  return (
    <div
      className={animClassName}
      style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', ...pos }}
    >
      {mon.speciesName && !imgError ? (
        <img
          src={url}
          alt={mon.speciesName}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          background: role === 'foe' ? '#e74c3c' : '#2980b9',
          borderRadius: 3,
        }} />
      )}
      <span style={{
        fontSize: 8,
        color: role === 'foe' ? '#000' : '#fff',
        textShadow: role === 'foe' ? '0 0 3px #fff' : '0 0 3px #000',
        whiteSpace: 'nowrap',
        marginTop: 2,
      }}>
        {slot.displayName}
      </span>
    </div>
  );
}
