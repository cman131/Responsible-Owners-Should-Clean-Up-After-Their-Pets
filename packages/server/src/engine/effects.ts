import type {
  PartyMember, StatBoosts, StatusCondition, PokemonType, TurnResolveEvent, Move,
} from '@poke-fighter/shared';
import { canApplyStatus } from './status.js';

export function applyStatus(
  member: PartyMember,
  slotId: string,
  status: StatusCondition,
  types: PokemonType[],
): TurnResolveEvent | null {
  if (!canApplyStatus({ status, types, currentStatus: member.status, ability: member.ability })) {
    return null;
  }
  member.status = status;
  if (status === 'slp') {
    const counter = Math.floor(Math.random() * 3) + 1;
    member.volatileStatus.push({ name: 'sleep', counter });
  }
  return { type: 'status-applied', data: { slotId, status } };
}

export function applyStatBoost(
  member: PartyMember,
  slotId: string,
  deltas: Partial<Record<keyof StatBoosts, number>>,
): TurnResolveEvent {
  const changes: Record<string, number> = {};
  for (const [key, delta] of Object.entries(deltas) as [keyof StatBoosts, number][]) {
    if (delta === undefined) continue;
    const current = member.statBoosts[key];
    const next = Math.max(-6, Math.min(6, current + delta));
    const actual = next - current;
    member.statBoosts[key] = next;
    changes[key] = actual;
  }
  return { type: 'stat-change', data: { slotId, changes } };
}

const STATUS_CONDITIONS = new Set<string>(['brn', 'par', 'psn', 'tox', 'slp', 'frz']);

export function evaluateSecondaryEffect(
  move: Move,
  target: PartyMember,
  targetSlotId: string,
  targetTypes: PokemonType[],
): TurnResolveEvent | null {
  if (!move.effect || move.effectChance === undefined) return null;
  if (Math.random() * 100 >= move.effectChance) return null;
  if (STATUS_CONDITIONS.has(move.effect)) {
    return applyStatus(target, targetSlotId, move.effect as StatusCondition, targetTypes);
  }
  return null;
}
