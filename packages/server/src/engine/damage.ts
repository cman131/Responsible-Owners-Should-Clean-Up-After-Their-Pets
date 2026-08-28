import type { PokemonType, WeatherType } from '@poke-fighter/shared';

export interface DamageInput {
  level: number;
  attackStat: number;
  defenseStat: number;
  basePower: number;
  typeEffectiveness: number;
  stab: boolean;
  isBurned: boolean;
  randomFactor: number;
  isCritical?: boolean;
  otherModifiers?: number;
  moveType?: PokemonType;
  weather?: WeatherType;
}

export interface DamageResult {
  damage: number;
  isCrit: boolean;
}

export function calcDamage(input: DamageInput): DamageResult {
  const {
    level, attackStat, defenseStat, basePower,
    typeEffectiveness, stab, isBurned, randomFactor,
    isCritical = false, otherModifiers = 1,
    moveType, weather,
  } = input;

  if (basePower === 0) return { damage: 0, isCrit: false };

  let dmg = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * basePower * attackStat) / defenseStat) / 50) + 2;

  if (isCritical) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * randomFactor);
  if (stab) dmg = Math.floor(dmg * 1.5);
  dmg = Math.floor(dmg * typeEffectiveness);
  if (isBurned) dmg = Math.floor(dmg / 2);

  if (weather && moveType) {
    if (weather === 'sun'  && moveType === 'Fire')  dmg = Math.floor(dmg * 1.5);
    if (weather === 'sun'  && moveType === 'Water') dmg = Math.floor(dmg * 0.5);
    if (weather === 'rain' && moveType === 'Water') dmg = Math.floor(dmg * 1.5);
    if (weather === 'rain' && moveType === 'Fire')  dmg = Math.floor(dmg * 0.5);
  }

  dmg = Math.floor(dmg * otherModifiers);
  return { damage: Math.max(1, dmg), isCrit: isCritical };
}

export function randomDamageFactor(): number {
  return (85 + Math.floor(Math.random() * 16)) / 100;
}
