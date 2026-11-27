import type { BattleState, PlayerHealthPayload, PokemonHealth } from '@poke-fighter/shared';
import type { AppDatabase } from '../db/Database.js';
import type { ConditionEntry } from '../db/ConditionStore.js';
import { allPokemon } from '../db/pokemonIds.js';
import { BattleConfigurator } from './BattleConfigurator.js';
import { applyCondition, captureCondition, toHealth } from './condition.js';

export interface HealthService {
  isInBattle(profileId: string): boolean;
  publish(profileId: string): void;
}

export type HealResult = { ok: true } | { ok: false; message: string };

let sharedConfigurator: BattleConfigurator | null = null;

function configurator(): BattleConfigurator {
  sharedConfigurator ??= new BattleConfigurator();
  return sharedConfigurator;
}

export function buildPlayerHealth(db: AppDatabase, profileId: string, inBattle: boolean): PlayerHealthPayload {
  const profile = db.players.get(profileId);
  const conditions = db.conditions.getForProfile(profileId);
  const pokemon: PokemonHealth[] = [];
  for (const set of profile ? allPokemon(profile) : []) {
    if (set.pokemonId === undefined) {
      continue;
    }
    try {
      const member = configurator().buildMember(set);
      const condition = conditions.get(set.pokemonId);
      if (condition !== undefined) {
        applyCondition(member, condition);
      }
      pokemon.push(toHealth(set.pokemonId, member));
    } catch (err) {
      console.error(`[playerHealth] skipping ${set.pokemonId}:`, err);
    }
  }
  return { profileId, inBattle, pokemon };
}

export function healPlayer(
  db: AppDatabase,
  profileId: string,
  pokemonId: string | undefined,
  inBattle: boolean,
): HealResult {
  const profile = db.players.get(profileId);
  if (!profile) {
    return { ok: false, message: 'Player not found.' };
  }
  if (pokemonId !== undefined && !allPokemon(profile).some((p) => p.pokemonId === pokemonId)) {
    return { ok: false, message: 'Pokémon not found.' };
  }
  if (inBattle) {
    return { ok: false, message: `${profile.displayName} is in a battle. Heal after it ends.` };
  }
  db.conditions.clear(profileId, pokemonId);
  return { ok: true };
}

export function getOwnerProfileIds(state: BattleState): string[] {
  const ids = state.teams.flatMap((team) =>
    team.slots.flatMap((slot) => slot.party.flatMap((member) => member.ownerProfileId ?? [])),
  );
  return [...new Set(ids)];
}

export function saveBattleConditions(db: AppDatabase, state: BattleState): void {
  const members = state.teams.flatMap((t) => t.slots.flatMap((s) => s.party));
  const entries: ConditionEntry[] = [];
  for (const profileId of getOwnerProfileIds(state)) {
    const profile = db.players.get(profileId);
    if (!profile) {
      continue;
    }
    const sets = allPokemon(profile);
    const previous = db.conditions.getForProfile(profileId);
    for (const member of members) {
      if (member.ownerProfileId !== profileId) {
        continue;
      }
      // Skips Pokémon removed from the profile during the battle
      const set = sets.find((p) => p.pokemonId === member.pokemonId);
      if (set?.pokemonId === undefined) {
        continue;
      }
      entries.push({
        profileId,
        pokemonId: set.pokemonId,
        condition: captureCondition(member, set.moves, previous.get(set.pokemonId)),
      });
    }
  }
  db.conditions.saveMany(entries);
}
