import type { StatusCondition, PokemonType, BattleState } from '@poke-fighter/shared';
import { getAbilityHooks } from './abilities.js';

export const PARALYSIS_SPEED_MOD = 0.5;
export const PARALYSIS_FULL_PARALYSIS_CHANCE = 0.25;
export const FREEZE_THAW_CHANCE = 0.2;
export const CONFUSION_HURT_CHANCE = 0.33;

interface CanApplyInput {
  status: StatusCondition;
  types: PokemonType[];
  currentStatus: StatusCondition | undefined;
  ability: string;
  battle?: BattleState;
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

export function canApplyStatus({ status, types, currentStatus, ability, battle }: CanApplyInput): boolean {
  if (currentStatus) return false;
  const immune = IMMUNITIES[status] ?? [];
  if (types.some((t) => immune.includes(t))) return false;
  if (getAbilityHooks(ability).onStatusImmunity?.({ status, ...(battle !== undefined ? { state: battle } : {}) })) return false;
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
