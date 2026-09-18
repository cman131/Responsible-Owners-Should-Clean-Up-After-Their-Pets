import type { PartyMember, PokemonType, WeatherType } from '@poke-fighter/shared';

export function isGrounded(
  pokemon: PartyMember,
  effectiveTypes: PokemonType[],
  gravityActive: boolean,
): boolean {
  if (gravityActive) return true;
  if (pokemon.heldItem === 'iron-ball') return true;
  if (effectiveTypes.includes('Flying')) return false;
  if (pokemon.ability === 'levitate') return false;
  if (pokemon.volatileStatus.some(v => v.name === 'magnet-rise')) return false;
  return true;
}

export const WEATHER_ACCURACY: Partial<Record<string, Partial<Record<WeatherType, number | true>>>> = {
  thunder:   { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 },
  blizzard:  { snow: true },
  hurricane: { rain: true, 'heavy-rain': true, sun: 50, 'harsh-sun': 50 },
};

export const SOLAR_MOVES = new Set(['solarbeam', 'solarblade']);

export const WEATHER_BALL_TYPE: Partial<Record<WeatherType, PokemonType>> = {
  sun: 'Fire', rain: 'Water', sand: 'Rock', snow: 'Ice',
  'harsh-sun': 'Fire', 'heavy-rain': 'Water',
};

export const GRAVITY_BLOCKED_MOVES = new Set([
  'fly', 'bounce', 'skydrop', 'skyattack', 'jumpkick', 'highjumpkick',
]);

export const GRASSY_TERRAIN_HALVED = new Set(['earthquake', 'magnitude', 'bulldoze']);
