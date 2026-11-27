import type { PlayerHealthPayload, PokemonHealth, PokemonSet } from '@poke-fighter/shared';

export interface ReadinessSlot {
  type: 'player' | 'npc';
  displayName: string;
  profileId?: string;
  defaultTeam?: PokemonSet[];
}

export interface SlotReadiness {
  blocker: string | null;
  summary: string | null;
}

function isHurt(p: PokemonHealth): boolean {
  return p.currentHp > 0
    && (p.currentHp < p.maxHp || p.status !== undefined || p.moves.some((m) => m.currentPp < m.maxPp));
}

export function getSlotReadiness(
  slot: ReadinessSlot,
  allSlots: ReadinessSlot[],
  health?: PlayerHealthPayload,
): SlotReadiness {
  if (slot.type !== 'player' || !slot.profileId) {
    return { blocker: null, summary: null };
  }
  if (allSlots.filter((s) => s.type === 'player' && s.profileId === slot.profileId).length > 1) {
    return { blocker: 'Assigned to more than one slot.', summary: null };
  }
  if (health?.inBattle) {
    return { blocker: 'Already in a battle.', summary: null };
  }
  const teamIds = new Set((slot.defaultTeam ?? []).map((p) => p.pokemonId));
  const team = health?.pokemon.filter((p) => teamIds.has(p.pokemonId)) ?? [];
  if (team.length === 0) {
    return { blocker: null, summary: null };
  }
  const fainted = team.filter((p) => p.currentHp === 0).length;
  if (fainted === team.length) {
    return { blocker: 'No usable Pokémon. Heal the team first.', summary: null };
  }
  const hurt = team.filter(isHurt).length;
  const parts = [hurt > 0 ? `${hurt} hurt` : null, fainted > 0 ? `${fainted} fainted` : null].filter(Boolean);
  return { blocker: null, summary: parts.length > 0 ? parts.join(', ') : null };
}
