import type { PokemonCondition, PokemonSet } from '@poke-fighter/shared';
import type { AppDatabase } from '../db/Database.js';

export interface StartSlot {
  slotId: string;
  displayName: string;
  isNpc: boolean;
  party: PokemonSet[];
  profileId?: string;
  conditions?: ReadonlyMap<string, PokemonCondition>;
}

export type StartTeams = [{ slots: StartSlot[] }, { slots: StartSlot[] }];

export type PrepareResult = { ok: true; teams: StartTeams } | { ok: false; message: string };

type SlotResult = { ok: true; slot: StartSlot } | { ok: false; message: string };

function prepareSlot(
  db: AppDatabase,
  slot: StartSlot,
  assigned: Set<string>,
  isInBattle: (profileId: string) => boolean,
): SlotResult {
  const { profileId, conditions: _ignored, ...rest } = slot;
  if (slot.isNpc || profileId === undefined) {
    return { ok: true, slot: rest };
  }
  const profile = db.players.get(profileId);
  if (!profile) {
    return { ok: false, message: `Saved player ${slot.displayName} no longer exists.` };
  }
  const name = profile.displayName;
  if (assigned.has(profileId)) {
    return { ok: false, message: `${name} is assigned to more than one slot.` };
  }
  assigned.add(profileId);
  if (isInBattle(profileId)) {
    return { ok: false, message: `${name} is already in a battle.` };
  }
  const party = profile.defaultTeam?.pokemon ?? [];
  const conditions = db.conditions.getForProfile(profileId);
  const usable = party.some((p) => (conditions.get(p.pokemonId ?? '')?.currentHp ?? 1) > 0);
  if (!usable) {
    return { ok: false, message: `${name} has no usable Pokémon. Heal their team first.` };
  }
  return { ok: true, slot: { ...rest, profileId, party, conditions } };
}

/** Loads saved player teams and refuses starts that health tracking doesn't allow. */
export function prepareBattleTeams(
  db: AppDatabase,
  teams: StartTeams,
  isInBattle: (profileId: string) => boolean,
): PrepareResult {
  const assigned = new Set<string>();
  const prepared: Array<{ slots: StartSlot[] }> = [];
  for (const team of teams) {
    const slots: StartSlot[] = [];
    for (const slot of team.slots) {
      const result = prepareSlot(db, slot, assigned, isInBattle);
      if (!result.ok) {
        return result;
      }
      slots.push(result.slot);
    }
    prepared.push({ slots });
  }
  return { ok: true, teams: prepared as StartTeams };
}
