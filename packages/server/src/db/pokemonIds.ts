import { v4 as uuidv4 } from 'uuid';
import type { PlayerProfile, PokemonSet } from '@poke-fighter/shared';

export function allPokemon(profile: PlayerProfile): PokemonSet[] {
  return [...(profile.defaultTeam?.pokemon ?? []), ...(profile.bank ?? [])];
}

export function needsPokemonIds(profile: PlayerProfile): boolean {
  const ids = allPokemon(profile).map((p) => p.pokemonId);
  return ids.some((id) => !id) || new Set(ids).size !== ids.length;
}

/** Returns a copy in which every Pokémon has an ID that is unique within the profile. */
export function assignPokemonIds(profile: PlayerProfile): PlayerProfile {
  const seen = new Set<string>();
  const withId = (set: PokemonSet): PokemonSet => {
    const pokemonId = set.pokemonId && !seen.has(set.pokemonId) ? set.pokemonId : uuidv4();
    seen.add(pokemonId);
    return { ...set, pokemonId };
  };
  return {
    ...profile,
    ...(profile.defaultTeam !== undefined
      ? { defaultTeam: { ...profile.defaultTeam, pokemon: profile.defaultTeam.pokemon.map(withId) } }
      : {}),
    ...(profile.bank !== undefined ? { bank: profile.bank.map(withId) } : {}),
  };
}
