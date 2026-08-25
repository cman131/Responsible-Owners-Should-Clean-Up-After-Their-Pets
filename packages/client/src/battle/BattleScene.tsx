import type { BattleState, SlotState } from '@poke-fighter/shared';
import { toShowdownId } from './utils.js';

interface Props {
  state: BattleState;
  mySlotId: string;
}

export function BattleScene({ state, mySlotId }: Props) {
  const myTeamIdx = state.teams.findIndex((t) => t.slots.some((s) => s.slotId === mySlotId));
  const foeTeamIdx = myTeamIdx === 0 ? 1 : 0;
  const myTeam = state.teams[myTeamIdx];
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
      {mySlot && renderSprite(mySlot, 'own', 0)}
      {allySlots.map((slot, i) => renderSprite(slot, 'ally', i))}
      {foeSlots.map((slot, i) => renderSprite(slot, 'foe', i))}
    </div>
  );
}

function renderSprite(slot: SlotState, role: 'own' | 'ally' | 'foe', index: number) {
  const mon = slot.party[slot.activePokemonIndex];
  if (!mon || mon.fainted) return null;

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
      key={slot.slotId}
      style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', ...pos }}
    >
      {mon.speciesName ? (
        <img
          src={url}
          alt={mon.speciesName}
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
