import type { StatusCondition, PokemonType } from '@poke-fighter/shared';

export const PARALYSIS_SPEED_MOD = 0.5;
export const PARALYSIS_FULL_PARALYSIS_CHANCE = 0.25;
export const FREEZE_THAW_CHANCE = 0.2;
export const CONFUSION_HURT_CHANCE = 0.33;

interface CanApplyInput {
  status: StatusCondition;
  types: PokemonType[];
  currentStatus: StatusCondition | undefined;
  ability: string;
}

const IMMUNITIES: Record<StatusCondition, PokemonType[]> = {
  brn: ['Fire'],
  par: ['Electric'],
  frz: ['Ice'],
  psn: ['Poison', 'Steel'],
  tox: ['Poison', 'Steel'],
  slp: [],
  fnt: [],
};

export function canApplyStatus({ status, types, currentStatus, ability }: CanApplyInput): boolean {
  if (currentStatus) return false;  // already has a status
  const immune = IMMUNITIES[status] ?? [];
  if (types.some((t) => immune.includes(t))) return false;
  // Ability-based immunities (subset — full list handled in abilities.ts)
  if (ability === 'limber' && status === 'par') return false;
  if (ability === 'immunity' && (status === 'psn' || status === 'tox')) return false;
  if (ability === 'magmaarmor' && status === 'frz') return false;
  if (ability === 'waterveil' && status === 'brn') return false;
  if (ability === 'insomnia' && status === 'slp') return false;
  return true;
}

export function getBurnDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 16));
}

export function getPoisonDamage(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp / 8));
}

export function getToxicDamage(maxHp: number, toxicCounter: number): number {
  return Math.max(1, Math.floor(maxHp * toxicCounter / 16));
}

